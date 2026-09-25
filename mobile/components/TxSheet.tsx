import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Toast from 'react-native-toast-message'
import { Colors } from '../constants/theme'
import { Transaction, getTransactionCategories, updateTransaction } from '../api/transactions'
import { Card } from '../api/cards'
import { getCategoryIcon } from '../utils/categoryIcon'
import { hasPinTag, stripPinTag, txDisplayTitle, withPinTag } from '../utils/pinned'
import { isSyncCategory } from '../utils/cardExclusion'
import { triggerErrorHaptic, triggerLightHaptic, triggerSuccessHaptic } from '../utils/haptics'
import SheetModal from './SheetModal'
import { GlassPressable } from './LiquidGlass'
import Icon from './Icon'
import { fmtMoney } from './TxRow'

interface Props {
  tx: Transaction | null
  cards: Card[]
  hidden?: boolean
  onClose: () => void
  /** Saved: the screen reloads its lists */
  onSaved: (updated: Transaction) => void
}

const parseAmount = (s: string) => parseFloat(s.replace(',', '.').replace(/\s/g, ''))

/**
 * Tap on a transaction: everything about it, editable right here (no separate "edit" step).
 * "Зберегти" appears only once something changed. Actions (pin, split, refund, delete) live in
 * the long-press menu and the swipe.
 */
export default function TxSheet({ tx, cards, hidden, onClose, onSaved }: Props) {
  // Keep showing the last transaction while the sheet slides out
  const last = useRef<Transaction | null>(null)
  if (tx) last.current = tx
  const t = last.current

  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [cardId, setCardId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [catQuery, setCatQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const saveAnim = useRef(new Animated.Value(0)).current

  // Fill the form from the opened transaction
  useEffect(() => {
    if (!tx) return
    const amt = Number(tx.amount || 0)
    setKind(amt < 0 ? 'expense' : 'income')
    setAmount(String(Math.abs(amt)).replace('.', ','))
    setCategory(isSyncCategory(tx.category || '') ? '' : tx.category || '')
    setCardId(tx.card_id ?? null)
    setNote(stripPinTag(tx.note))
    setCatQuery('')
  }, [tx?.id])

  useEffect(() => {
    if (tx && categories.length === 0) getTransactionCategories().then(c => c && setCategories(c)).catch(() => {})
  }, [tx])

  const original = useMemo(() => {
    if (!t) return null
    const amt = Number(t.amount || 0)
    return {
      kind: amt < 0 ? 'expense' : 'income',
      amount: Math.abs(amt),
      category: isSyncCategory(t.category || '') ? '' : t.category || '',
      cardId: t.card_id ?? null,
      note: stripPinTag(t.note),
    }
  }, [t?.id, t?.amount, t?.category, t?.card_id, t?.note])

  const parsed = parseAmount(amount)
  const dirty =
    !!original &&
    (kind !== original.kind ||
      (Number.isFinite(parsed) && Math.abs(parsed - original.amount) > 0.0001) ||
      category.trim() !== original.category ||
      cardId !== original.cardId ||
      note.trim() !== original.note.trim())

  useEffect(() => {
    Animated.spring(saveAnim, { toValue: dirty ? 1 : 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start()
  }, [dirty])

  // Category chips: typed text filters; a new name can be used as is
  const q = catQuery.trim().toLowerCase()
  // The selected category is always first (even a new one not saved yet)
  const catOptions = useMemo(() => {
    const list = categories.filter(c => !isSyncCategory(c))
    const found = (q ? list.filter(c => c.toLowerCase().includes(q)) : list).slice(0, q ? 20 : 14)
    const sel = category.trim()
    if (!sel || q) return found
    return [sel, ...found.filter(c => c !== sel)]
  }, [categories, q, category])
  const orderedCards = useMemo(() => {
    const sel = cards.find(c => c.id === cardId)
    return sel ? [sel, ...cards.filter(c => c.id !== cardId)] : cards
  }, [cards, cardId])
  const cardScroll = useRef<ScrollView>(null)
  const moveToFront = () =>
    LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity))
  const canCreate = !!q && !categories.some(c => c.toLowerCase() === q)

  if (!t) return null

  const card = t.card_id ? cards.find(c => c.id === t.card_id) : undefined
  const currency = t.currency || card?.currency
  const d = new Date(t.created_at)
  const when = d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
  const waitingCategory = isSyncCategory(t.category || '') && !category.trim()
  const stat = t.amount_stat == null ? null : Number(t.amount_stat)
  const refunded = Number(t.amount) < 0 && stat != null && Math.abs(stat - Number(t.amount)) > 0.004

  const save = async () => {
    if (!Number.isFinite(parsed) || parsed <= 0) {
      triggerErrorHaptic()
      Toast.show({ type: 'error', text1: 'Вкажіть суму', text2: 'Сума має бути більшою за нуль' })
      return
    }
    setSaving(true)
    const signed = kind === 'expense' ? -Math.abs(parsed) : Math.abs(parsed)
    const payload: Partial<Transaction> = {
      amount: signed,
      category: category.trim() || t.category || 'Інше',
      card_id: cardId,
      // Keep the pin (the tag isn't shown in the editor)
      note: withPinTag(note.trim(), hasPinTag(t.note)) ?? (null as unknown as string),
    }
    try {
      await updateTransaction(t.id, payload)
      triggerSuccessHaptic()
      Toast.show({
        type: 'success',
        text1: 'Збережено',
        text2: waitingCategory === false && isSyncCategory(t.category || '') ? 'Транзакція перейшла в загальний список' : undefined,
      })
      onSaved({ ...t, ...payload } as Transaction)
      onClose()
    } catch (e: any) {
      triggerErrorHaptic()
      Toast.show({ type: 'error', text1: 'Не вдалося зберегти', text2: e?.message })
    } finally {
      setSaving(false)
    }
  }

  const isExpense = kind === 'expense'

  return (
    <SheetModal visible={!!tx} onClose={onClose} sheetStyle={styles.sheet}>
      {/* Header: what it is */}
      <View style={styles.header}>
        <View style={[styles.hIcon, !isExpense && styles.hIconIncome]}>
          <Text style={styles.hEmoji}>{getCategoryIcon(category || t.category || null, isExpense ? -1 : 1)}</Text>
        </View>
        <View style={styles.hText}>
          <Text style={styles.hTitle} numberOfLines={1}>{txDisplayTitle(t)}</Text>
          <Text style={styles.hSub} numberOfLines={1}>{when}</Text>
        </View>
        <GlassPressable onPress={onClose} style={styles.closeBtn}>
          <Icon name="close" size={15} color={Colors.white80} strokeWidth={2.6} />
        </GlassPressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Amount (editable) + expense/income */}
        <View style={styles.amountBox}>
          <View style={styles.kindSwitch}>
            {(['expense', 'income'] as const).map(k => (
              <Pressable
                key={k}
                onPress={() => {
                  if (k !== kind) triggerLightHaptic()
                  setKind(k)
                }}
                style={[styles.kindBtn, kind === k && (k === 'expense' ? styles.kindExpense : styles.kindIncome)]}
              >
                <Text style={[styles.kindText, kind === k && styles.kindTextActive]}>{k === 'expense' ? 'Витрата' : 'Дохід'}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.amountRow}>
            <Text style={[styles.sign, isExpense ? styles.signExpense : styles.signIncome]}>{isExpense ? '−' : '+'}</Text>
            <TextInput
              style={[styles.amountInput, isExpense ? styles.signExpense : styles.signIncome]}
              value={hidden ? '••••' : amount}
              editable={!hidden}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              selectTextOnFocus
            />
            {currency ? <Text style={styles.cur}>{currency}</Text> : null}
          </View>
          {refunded && !hidden ? (
            <Text style={styles.refundNote}>
              Після повернень: {Math.abs(stat as number) < 0.005 ? 'повернено повністю' : `−${fmtMoney(stat as number, currency)}`}
            </Text>
          ) : null}
          {t.merchant_name ? <Text style={styles.merchant}>🏪 {t.merchant_name}</Text> : null}
        </View>

        {/* Category */}
        <View style={[styles.section, waitingCategory && styles.sectionAttention]}>
          <View style={styles.sectionHead}>
            <Icon name="tag" size={14} color={waitingCategory ? Colors.orange : Colors.white60} />
            <Text style={[styles.sectionLabel, waitingCategory && { color: Colors.orange }]}>
              {waitingCategory ? 'Оберіть категорію' : 'Категорія'}
            </Text>
            {category ? (
              <View style={styles.selectedCat}>
                <Text style={styles.selectedCatText} numberOfLines={1}>{category}</Text>
              </View>
            ) : null}
          </View>
          {waitingCategory ? (
            <Text style={styles.hint}>Імпорт з банку чекає на категорію — після збереження перейде в загальний список</Text>
          ) : null}
          <TextInput
            style={styles.input}
            value={catQuery}
            onChangeText={setCatQuery}
            placeholder="Пошук або нова категорія"
            placeholderTextColor={Colors.textMuted}
            autoCorrect={false}
          />
          <View style={styles.chips}>
            {canCreate && (
              <Pressable
                onPress={() => {
                  triggerLightHaptic()
                  moveToFront()
                  setCategory(catQuery.trim())
                  setCatQuery('')
                }}
                style={[styles.chip, styles.chipCreate]}
              >
                <Icon name="plus" size={13} color={Colors.orange} strokeWidth={2.6} />
                <Text style={[styles.chipText, { color: Colors.orange }]}>Створити «{catQuery.trim()}»</Text>
              </Pressable>
            )}
            {catOptions.map(c => {
              const active = c === category
              return (
                <Pressable
                  key={c}
                  onPress={() => {
                    if (active) return
                    triggerLightHaptic()
                    moveToFront()
                    setCategory(c)
                    setCatQuery('')
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* Card */}
        {cards.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>Рахунок</Text>
            </View>
            <ScrollView ref={cardScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
              {orderedCards.map(c => {
                const active = c.id === cardId
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      if (active) return
                      triggerLightHaptic()
                      moveToFront()
                      setCardId(c.id)
                      cardScroll.current?.scrollTo({ x: 0, animated: true })
                    }}
                    style={[styles.cardPill, active && styles.cardPillActive]}
                  >
                    <Text style={styles.cardBank} numberOfLines={1}>{c.bank || 'Рахунок'}</Text>
                    <Text style={[styles.cardName, active && { color: Colors.white }]} numberOfLines={1}>
                      {c.name} · {c.currency}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        )}

        {/* Note */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionLabel}>Примітка</Text>
          </View>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            placeholder="Опис або примітка"
            placeholderTextColor={Colors.textMuted}
            multiline
          />
        </View>

        <Text style={styles.footerHint}>Утримуйте транзакцію в списку — закріпити, розділити, повернення, видалити</Text>
        <View style={{ height: 90 }} />
      </ScrollView>

      {/* Save appears only when something changed */}
      <Animated.View
        pointerEvents={dirty ? 'auto' : 'none'}
        style={[
          styles.saveWrap,
          { opacity: saveAnim, transform: [{ translateY: saveAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] },
        ]}
      >
        <Pressable onPress={save} disabled={saving} style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}>
          {saving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Icon name="check" size={18} color={Colors.white} strokeWidth={3} />
              <Text style={styles.saveText}>Зберегти</Text>
            </>
          )}
        </Pressable>
      </Animated.View>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 10,
  },
  hIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 107, 0, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hIconIncome: {
    backgroundColor: 'rgba(34, 197, 94, 0.14)',
  },
  hEmoji: {
    fontSize: 21,
  },
  hText: {
    flex: 1,
  },
  hTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.white,
  },
  hSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 16,
    gap: 12,
  },
  amountBox: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  kindSwitch: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  kindBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 9,
  },
  kindExpense: {
    backgroundColor: 'rgba(255, 107, 0, 0.22)',
  },
  kindIncome: {
    backgroundColor: 'rgba(34, 197, 94, 0.22)',
  },
  kindText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white60,
  },
  kindTextActive: {
    color: Colors.white,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  sign: {
    fontSize: 34,
    fontWeight: '800',
  },
  signExpense: {
    color: Colors.white,
  },
  signIncome: {
    color: Colors.green,
  },
  amountInput: {
    fontSize: 40,
    fontWeight: '800',
    minWidth: 60,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    paddingVertical: 0,
  },
  cur: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white60,
    marginLeft: 6,
  },
  refundNote: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.green,
    marginTop: 4,
  },
  merchant: {
    fontSize: 13,
    color: Colors.white60,
    marginTop: 6,
  },
  section: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    gap: 10,
  },
  sectionAttention: {
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.5)',
    backgroundColor: 'rgba(255, 107, 0, 0.07)',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.white60,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectedCat: {
    marginLeft: 'auto',
    maxWidth: '55%',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 107, 0, 0.18)',
  },
  selectedCatText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.orange,
  },
  hint: {
    fontSize: 12,
    color: Colors.white60,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.white,
    fontSize: 15,
  },
  noteInput: {
    minHeight: 44,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.2)',
    borderColor: 'rgba(255, 107, 0, 0.6)',
  },
  chipCreate: {
    borderColor: 'rgba(255, 107, 0, 0.45)',
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white80,
  },
  chipTextActive: {
    color: Colors.white,
  },
  cardsRow: {
    gap: 8,
  },
  cardPill: {
    minWidth: 110,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardPillActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.16)',
    borderColor: 'rgba(255, 107, 0, 0.55)',
  },
  cardBank: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white80,
    marginTop: 2,
  },
  footerHint: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  saveWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
  },
  saveBtn: {
    height: 54,
    borderRadius: 18,
    backgroundColor: Colors.orange,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: Colors.orange,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  saveText: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.white,
  },
})
