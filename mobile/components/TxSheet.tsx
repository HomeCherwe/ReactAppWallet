import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import Toast from 'react-native-toast-message'
import { Colors } from '../constants/theme'
import { Transaction, getTransactionCategories, listTransferLegs, updateTransaction } from '../api/transactions'
import { autoCategorize } from '../api/insights'
import { Card } from '../api/cards'
import { getCategoryIcon } from '../utils/categoryIcon'
import { hasPinTag, stripPinTag, txDisplayTitle, withPinTag } from '../utils/pinned'
import { isSyncCategory } from '../utils/cardExclusion'
import { triggerErrorHaptic, triggerLightHaptic, triggerSuccessHaptic } from '../utils/haptics'
import SheetModal from './SheetModal'
import { confirmUnlinkTransfer } from '../utils/transferActions'
import DateTimeField from './DateTimeField'
import { GlassPressable } from './LiquidGlass'
import Icon from './Icon'
import { fmtMoney } from './TxRow'
import { cardLabel } from '../utils/cardLabel'

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
  // "Враховувати в статистиці" (exclude_from_stats), same switch as the web's editor
  const [counted, setCounted] = useState(true)
  const [date, setDate] = useState(() => new Date())
  // A transfer: both of its legs (this one and the other account's)
  const [legs, setLegs] = useState<Transaction[] | null>(null)
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
    // Waiting for a category: the rules' suggestion is preselected, «Зберегти» confirms it
    setCategory(isSyncCategory(tx.category || '') ? tx.suggested_category || '' : tx.category || '')
    setCardId(tx.card_id ?? null)
    setNote(stripPinTag(tx.note))
    setCounted(!tx.exclude_from_stats)
    setDate(new Date(tx.created_at))
    setCatQuery('')
    setLegs(null)
    if (tx.is_transfer && tx.transfer_id) {
      listTransferLegs([tx.transfer_id])
        .then(list => setLegs([...list].sort((a, b) => (a.transfer_role === 'from' ? -1 : 0) - (b.transfer_role === 'from' ? -1 : 0))))
        .catch(() => setLegs([]))
    }
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
      counted: !t.exclude_from_stats,
      dateMs: new Date(t.created_at).getTime(),
    }
  }, [t?.id, t?.amount, t?.category, t?.card_id, t?.note, t?.exclude_from_stats, t?.created_at])

  const parsed = parseAmount(amount)
  // The picker works in minutes: a different minute is a change
  const dateChanged = !!original && Math.abs(date.getTime() - original.dateMs) >= 60000
  const dirty =
    !!original &&
    (kind !== original.kind ||
      (Number.isFinite(parsed) && Math.abs(parsed - original.amount) > 0.0001) ||
      category.trim() !== original.category ||
      cardId !== original.cardId ||
      counted !== original.counted ||
      dateChanged ||
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
  const d = date
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
      exclude_from_stats: !counted,
      ...(dateChanged && { created_at: date.toISOString() }),
    }
    const categoryChanged = payload.category !== t.category
    try {
      await updateTransaction(t.id, payload)
      // The app learned this merchant's category: its other waiting imports get it now
      const similar = categoryChanged ? await autoCategorize({ gpt: false }).catch(() => null) : null
      triggerSuccessHaptic()
      Toast.show({
        type: 'success',
        text1: 'Збережено',
        text2: similar?.applied
          ? `Ще ${similar.applied} схожих отримали категорію`
          : waitingCategory === false && isSyncCategory(t.category || '')
            ? 'Транзакція перейшла в загальний список'
            : undefined,
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
          <Text style={styles.hSub} numberOfLines={1}>
            {when}
            {t.status === 'pending' ? ' · В обробці' : ''}
          </Text>
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

        {/* A transfer between the user's accounts: both legs, money out first */}
        {t.is_transfer && t.transfer_id ? (
          <View style={styles.transferBox}>
            <View style={styles.transferHead}>
              <Icon name="transfer" size={15} color="#8AB4FF" strokeWidth={2.4} />
              <Text style={styles.transferTitle}>Переказ між рахунками</Text>
            </View>
            {legs === null ? (
              <ActivityIndicator color={Colors.orange} style={{ marginVertical: 8 }} />
            ) : (
              legs.map((leg, i) => {
                const legCard = leg.card_id ? cards.find(c => c.id === leg.card_id) : undefined
                const legAmount = Number(leg.amount)
                return (
                  <React.Fragment key={leg.id}>
                    {i > 0 && <Text style={styles.transferArrow}>↓</Text>}
                    <View style={[styles.legRow, leg.id === t.id && styles.legRowThis]}>
                      <Text style={styles.legDir}>{legAmount < 0 ? 'З' : 'На'}</Text>
                      <Text style={styles.legCard} numberOfLines={1}>
                        {legCard ? cardLabel(legCard) : leg.card_id ? 'Рахунок' : 'Готівка'}
                        {leg.id === t.id ? <Text style={styles.legThisMark}>  · ця</Text> : null}
                      </Text>
                      <Text style={styles.legAmount}>
                        {hidden ? '••••' : `${legAmount < 0 ? '−' : '+'}${fmtMoney(legAmount, leg.currency || legCard?.currency)}`}
                      </Text>
                    </View>
                  </React.Fragment>
                )
              })
            )}
            {legs !== null && legs.length < 2 ? (
              <Text style={styles.transferHint}>Другої частини переказу не знайдено (можливо, вона в архіві).</Text>
            ) : (
              <Text style={styles.transferHint}>Не рахується ні витратою, ні доходом.</Text>
            )}
            <Pressable
              onPress={() =>
                confirmUnlinkTransfer(t, cards, () => {
                  onSaved(t)
                  onClose()
                })
              }
              style={({ pressed }) => [styles.transferUndo, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.transferUndoText}>Скасувати переказ</Text>
            </Pressable>
          </View>
        ) : null}

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
          ) : isSyncCategory(t.category || '') && t.suggested_category && category === t.suggested_category ? (
            <Text style={styles.hint}>✨ Підказка з ваших звичок — «Зберегти», і схожі отримають її теж</Text>
          ) : t.category_source === 'auto' && category === t.category ? (
            <Text style={styles.hint}>✨ Поставлено автоматично за вашими звичками — змініть, якщо не так</Text>
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

        {/* When it happened */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Icon name="calendar" size={14} color={Colors.white60} />
            <Text style={styles.sectionLabel}>Дата і час</Text>
          </View>
          <DateTimeField value={date} onChange={setDate} title="" />
        </View>

        {/* Counted in statistics */}
        <View style={[styles.section, styles.switchRow]}>
          <View style={styles.switchText}>
            <Text style={styles.switchTitle}>Враховувати в статистиці</Text>
            <Text style={styles.switchHint}>
              {counted
                ? 'Входить у витрати, доходи й графіки'
                : 'Не входить у статистику; на баланс картки впливає, як і раніше'}
            </Text>
          </View>
          <Switch
            value={counted}
            onValueChange={v => {
              triggerLightHaptic()
              setCounted(v)
            }}
            trackColor={{ true: Colors.orange, false: 'rgba(255,255,255,0.18)' }}
            ios_backgroundColor="rgba(255,255,255,0.18)"
          />
        </View>

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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchText: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
  switchHint: {
    fontSize: 12,
    color: Colors.white40,
    marginTop: 2,
  },
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
  transferBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(138, 180, 255, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(138, 180, 255, 0.35)',
    gap: 6,
  },
  transferHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  transferTitle: { fontSize: 13, fontWeight: '800', color: '#8AB4FF' },
  transferArrow: { fontSize: 14, color: Colors.white40, marginLeft: 10 },
  legRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  legRowThis: { backgroundColor: 'rgba(255,255,255,0.10)' },
  legDir: { width: 22, fontSize: 12.5, fontWeight: '800', color: Colors.white60 },
  legCard: { flex: 1, fontSize: 14.5, fontWeight: '700', color: Colors.white },
  legThisMark: { fontSize: 12, fontWeight: '600', color: Colors.white40 },
  legAmount: { fontSize: 14.5, fontWeight: '800', color: Colors.white, fontVariant: ['tabular-nums'] },
  transferHint: { fontSize: 12, lineHeight: 16, color: Colors.white40, marginTop: 2 },
  transferUndo: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.08)' },
  transferUndoText: { fontSize: 13, fontWeight: '700', color: Colors.white80 },
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
