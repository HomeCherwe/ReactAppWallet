import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LinearGradient } from 'expo-linear-gradient'
import { initialWindowMetrics } from 'react-native-safe-area-context'
import { Colors } from '../constants/theme'
import { askAssistant, AssistantTurn } from '../api/assistant'
import { Transaction } from '../api/transactions'
import { Card } from '../api/cards'
import { triggerErrorHaptic, triggerLightHaptic } from '../utils/haptics'
import { txDisplayTitle } from '../utils/pinned'
import SheetModal from './SheetModal'
import TxRow from './TxRow'
import TxSheet from './TxSheet'
import Icon from './Icon'
import { AI_ACCENT, AI_COLORS, AiGlowBorder, AiGlowRing } from './AiGlow'

const STORAGE_KEY = 'assistant_chat_v1'
// Kept on the phone (the general chat; chats about one transaction aren't kept)
const KEEP_MESSAGES = 40
// Sent to the assistant as the conversation so far
const SEND_MESSAGES = 16
const TOP_CLEARANCE = (initialWindowMetrics?.insets.top ?? 47) + 24

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  transactions?: Transaction[]
  /** The answer didn't come: the bubble offers a retry */
  error?: boolean
}

const GENERAL_SUGGESTIONS = [
  'Скільки я витратив цього місяця?',
  'На що йде найбільше грошей?',
  'Порівняй цей місяць з минулим',
  'Які в мене підписки?',
  'Найбільші покупки за тиждень',
  'Скільки зараз на всіх рахунках?',
]
const TX_SUGGESTIONS = ['Що це за транзакція?', 'Чи нормальна ця сума?', 'Як часто я тут витрачаю?', 'Покажи схожі транзакції']

// The send button: the AI's colors without the loop back to orange
const SEND_COLORS = [AI_COLORS[0], AI_COLORS[1], AI_COLORS[2], AI_COLORS[3]] as const

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/** The assistant's text: paragraphs, "- " bullets and **bold** */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const bullet = line.match(/^(\s*)[-•]\s+(.*)$/)
        const content = bullet ? bullet[2] : line
        if (!content.trim()) return <View key={i} style={{ height: 6 }} />
        const parts = content
          .split(/(\*\*[^*]+\*\*)/g)
          .filter(Boolean)
          .map((p, j) =>
            p.startsWith('**') && p.endsWith('**') ? (
              <Text key={j} style={styles.bold}>
                {p.slice(2, -2)}
              </Text>
            ) : (
              p
            )
          )
        if (!bullet) {
          return (
            <Text key={i} style={styles.aiText}>
              {parts}
            </Text>
          )
        }
        return (
          <View key={i} style={[styles.bulletRow, bullet[1].length >= 2 && styles.bulletNested]}>
            <View style={styles.bulletDot} />
            <Text style={[styles.aiText, styles.bulletText]}>{parts}</Text>
          </View>
        )
      })}
    </>
  )
}

/** Three dots while the assistant is thinking */
function Thinking() {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 3, duration: 1200, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [])
  return (
    <View style={styles.thinking}>
      {[0, 1, 2].map(i => (
        <Animated.View
          key={i}
          style={[
            styles.thinkingDot,
            {
              opacity: v.interpolate({ inputRange: [0, i, i + 0.5, i + 1, 3], outputRange: [0.3, 0.3, 1, 0.3, 0.3], extrapolate: 'clamp' }),
            },
          ]}
        />
      ))}
      <Text style={styles.thinkingText}>Дивлюсь твої транзакції…</Text>
    </View>
  )
}

interface Props {
  visible: boolean
  onClose: () => void
  /** Opened from a transaction (long press → «Запитати AI»): the chat is about it */
  tx?: Transaction | null
  cards: Card[]
  hidden?: boolean
  /** A transaction was edited from the chat */
  onChanged?: () => void
}

/**
 * «AI-асистент»: ask about your money in plain words. Answers come with the transactions they're
 * about; tap one to open it. The assistant only reads — nothing is changed.
 */
export default function AssistantSheet({ visible, onClose, tx, cards, hidden, onChanged }: Props) {
  const { height: screenH } = useWindowDimensions()
  const [general, setGeneral] = useState<ChatMessage[]>([])
  const [txChat, setTxChat] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [keyboard, setKeyboard] = useState(0)
  const [openTx, setOpenTx] = useState<Transaction | null>(null)
  const scrollRef = useRef<ScrollView>(null)
  const loaded = useRef(false)
  // Keep showing the transaction while the sheet slides out
  const lastTx = useRef<Transaction | null>(null)
  if (visible) lastTx.current = tx ?? null
  const focus = lastTx.current
  const messages = focus ? txChat : general
  const setMessages = focus ? setTxChat : setGeneral

  // The general chat is kept on the phone
  useEffect(() => {
    if (!visible || loaded.current) return
    loaded.current = true
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => raw && setGeneral(JSON.parse(raw)))
      .catch(() => {})
  }, [visible])
  useEffect(() => {
    if (!loaded.current) return
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(general.filter(m => !m.error).slice(-KEEP_MESSAGES))).catch(() => {})
  }, [general])

  // A new transaction → a new chat about it
  useEffect(() => {
    if (visible && tx) setTxChat([])
  }, [visible, tx?.id])

  // The sheet gives the keyboard its height, so the top stays where it is
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', e => setKeyboard(e.endCoordinates.height))
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboard(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80)
    return () => clearTimeout(t)
  }, [messages.length, sending, keyboard])

  const send = async (text: string, history: ChatMessage[] = messages) => {
    const q = text.trim()
    if (!q || sending) return
    triggerLightHaptic()
    const userMsg: ChatMessage = { id: newId(), role: 'user', text: q }
    const next = [...history.filter(m => !m.error), userMsg]
    setMessages(next)
    setInput('')
    Keyboard.dismiss()
    setSending(true)
    try {
      const turns: AssistantTurn[] = next.slice(-SEND_MESSAGES).map(m => ({ role: m.role, content: m.text }))
      const reply = await askAssistant(turns, focus?.id)
      setMessages(prev => [...prev, { id: newId(), role: 'assistant', text: reply.answer, transactions: reply.transactions }])
    } catch (e: any) {
      triggerErrorHaptic()
      setMessages(prev => [...prev, { id: newId(), role: 'assistant', text: e?.message || 'Не вдалося отримати відповідь', error: true }])
    } finally {
      setSending(false)
    }
  }

  const retry = () => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUser) return
    const idx = messages.lastIndexOf(lastUser)
    send(lastUser.text, messages.slice(0, idx))
  }

  const clear = () => {
    triggerLightHaptic()
    setMessages([])
  }

  const cardsById = Object.fromEntries(cards.map(c => [c.id, c]))
  const sheetHeight = Math.max(320, screenH - TOP_CLEARANCE - keyboard)
  const suggestions = focus ? TX_SUGGESTIONS : GENERAL_SUGGESTIONS
  const canSend = !!input.trim() && !sending

  return (
    <SheetModal visible={visible} onClose={onClose} sheetStyle={{ height: sheetHeight, maxHeight: sheetHeight }}>
      <View style={styles.root}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <AiGlowRing size={34} thickness={2} style={styles.headerRing} />
            <Icon name="sparkles" size={18} color={AI_ACCENT} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>AI-асистент</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              Читає твої транзакції — нічого не змінює
            </Text>
          </View>
          {messages.length > 0 && (
            <Pressable onPress={clear} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}>
              <Text style={styles.headerBtnText}>Нова</Text>
            </Pressable>
          )}
          <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}>
            <Icon name="close" size={16} color={Colors.white80} strokeWidth={2.4} />
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* A tap on an empty spot hides the keyboard */}
          <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} accessible={false} />
          {focus && (
            <View style={styles.context}>
              <Text style={styles.contextLabel}>Про транзакцію</Text>
              <View style={styles.contextRow}>
                <TxRow tx={focus} card={focus.card_id ? cardsById[focus.card_id] : undefined} hidden={hidden} showDate last swipeEnabled={false} />
              </View>
            </View>
          )}

          {messages.length === 0 && !sending && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{focus ? `Що цікавить про «${txDisplayTitle(focus)}»?` : 'Запитай про свої гроші'}</Text>
              <Text style={styles.emptyText}>
                {focus
                  ? 'Можу пояснити, що це за списання, порівняти з минулими й показати схожі.'
                  : 'Скільки, де, коли й на що — асистент сам знайде транзакції й порахує.'}
              </Text>
              <View style={styles.suggestions}>
                {suggestions.map(s => (
                  <Pressable key={s} onPress={() => send(s)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                    <Text style={styles.chipText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {messages.map(m =>
            m.role === 'user' ? (
              <View key={m.id} style={styles.userRow}>
                <LinearGradient colors={['#FF7A1A', '#FF5A00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.userBubble}>
                  <Text style={styles.userText}>{m.text}</Text>
                </LinearGradient>
              </View>
            ) : (
              <View key={m.id} style={styles.aiRow}>
                <View style={[styles.aiBubble, m.error && styles.aiBubbleError]}>
                  <RichText text={m.text} />
                  {m.error && (
                    <Pressable onPress={retry} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
                      <Text style={styles.retryText}>Спробувати ще раз</Text>
                    </Pressable>
                  )}
                </View>
                {!!m.transactions?.length && (
                  <View style={styles.txList}>
                    {m.transactions.map((t, i) => (
                      <TxRow
                        key={t.id}
                        tx={t}
                        card={t.card_id ? cardsById[t.card_id] : undefined}
                        hidden={hidden}
                        showDate
                        last={i === m.transactions!.length - 1}
                        swipeEnabled={false}
                        onPress={setOpenTx}
                      />
                    ))}
                  </View>
                )}
              </View>
            )
          )}
          {sending && <Thinking />}
        </ScrollView>

        {/* Input with the AI's running contour */}
        <View style={[styles.inputWrap, keyboard > 0 && styles.inputWrapKeyboard]}>
          {/* With the keyboard up: a button to put it away */}
          {keyboard > 0 && (
            <Pressable
              onPress={Keyboard.dismiss}
              hitSlop={8}
              accessibilityLabel="Сховати клавіатуру"
              style={({ pressed }) => [styles.hideKbBtn, pressed && styles.pressed]}
            >
              <Icon name="chevronDown" size={20} color={Colors.white80} strokeWidth={2.4} />
            </Pressable>
          )}
          <AiGlowBorder radius={22} thickness={1.5} background="#1C1B22" style={[styles.inputBox, { flex: 1 }]}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={focus ? 'Запитай про цю транзакцію…' : 'Запитай про свої гроші…'}
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={1000}
              editable={!sending}
              returnKeyType="send"
              submitBehavior="blurAndSubmit"
              enablesReturnKeyAutomatically
              onSubmitEditing={() => send(input)}
            />
            <Pressable onPress={() => send(input)} disabled={!canSend} style={({ pressed }) => [styles.sendBtn, !canSend && styles.sendOff, pressed && styles.pressed]}>
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <LinearGradient colors={SEND_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sendFill}>
                  <Icon name="arrowUp" size={18} color="#fff" strokeWidth={2.6} />
                </LinearGradient>
              )}
            </Pressable>
          </AiGlowBorder>
        </View>
      </View>

      <TxSheet
        tx={openTx}
        cards={cards}
        hidden={hidden}
        onClose={() => setOpenTx(null)}
        onSaved={() => onChanged?.()}
      />
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 10 },
  headerIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerRing: { position: 'absolute', left: 0, top: 0 },
  title: { fontSize: 19, fontWeight: '800', color: Colors.white },
  subtitle: { fontSize: 12, color: Colors.white40, marginTop: 1 },
  headerBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.07)' },
  headerBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white80 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  pressed: { opacity: 0.6 },
  scroll: { paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  context: { gap: 6 },
  contextLabel: { fontSize: 12, fontWeight: '700', color: Colors.white40, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4 },
  contextRow: { borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(199,125,255,0.45)' },
  empty: { paddingTop: 18, gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: Colors.white },
  emptyText: { fontSize: 14, lineHeight: 20, color: Colors.white60 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 100,
    backgroundColor: 'rgba(199,125,255,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(199,125,255,0.45)',
  },
  chipText: { fontSize: 13.5, fontWeight: '600', color: Colors.white },
  userRow: { alignItems: 'flex-end' },
  userBubble: { maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderBottomRightRadius: 6 },
  userText: { fontSize: 15.5, lineHeight: 21, color: '#fff' },
  aiRow: { alignItems: 'flex-start', gap: 8 },
  aiBubble: {
    maxWidth: '94%',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    gap: 3,
  },
  aiBubbleError: { borderColor: 'rgba(255,107,107,0.45)', backgroundColor: 'rgba(255,107,107,0.08)' },
  aiText: { fontSize: 15.5, lineHeight: 22, color: Colors.white },
  bold: { fontWeight: '800' },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  bulletNested: { paddingLeft: 16 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: AI_ACCENT, marginTop: 9 },
  bulletText: { flex: 1 },
  retry: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.10)' },
  retryText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  txList: {
    alignSelf: 'stretch',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#1A1A1E',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 4 },
  thinkingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: AI_ACCENT },
  thinkingText: { fontSize: 13, color: Colors.white40, marginLeft: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 28 },
  // Right above the keyboard: no room for the home indicator needed
  inputWrapKeyboard: { paddingBottom: 10 },
  hideKbBtn: { width: 40, height: 50, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  inputBox: { flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 16, paddingRight: 6, paddingVertical: 6, minHeight: 50 },
  input: { flex: 1, color: Colors.white, fontSize: 16, lineHeight: 21, maxHeight: 110, paddingTop: 8, paddingBottom: 8 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' },
  sendOff: { opacity: 0.4 },
  sendFill: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
})
