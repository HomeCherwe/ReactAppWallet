import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { Colors } from '../constants/theme'
import { Card } from '../api/cards'
import { Transaction } from '../api/transactions'
import { listTransferCandidates, markExistingAsTransfer, transferFromExisting } from '../api/transfers'
import { convertCurrency, fetchExchangeRates, formatMoney, RatesMap } from '../utils/currency'
import { txDisplayTitle } from '../utils/pinned'
import { triggerErrorHaptic, triggerLightHaptic, triggerSuccessHaptic } from '../utils/haptics'
import SheetModal from './SheetModal'
import TxRow from './TxRow'
import Icon from './Icon'

const DAY = 864e5
const MAX_CANDIDATES = 12

interface Props {
  /** The transaction to turn into a transfer (null = closed) */
  tx: Transaction | null
  cards: Card[]
  hidden?: boolean
  onClose: () => void
  /** A transfer was made: the screen reloads */
  onDone: () => void
}

/**
 * «Зробити переказом»: an existing transaction becomes a transfer between your accounts, so it
 * leaves the statistics. Either pair it with the other side that's already there (money out on one
 * card, in on another), or create the missing side on the account it went to / came from.
 */
export default function TransferFromTxSheet({ tx, cards, hidden, onClose, onDone }: Props) {
  // Keep showing it while the sheet slides out
  const last = useRef<Transaction | null>(null)
  if (tx) last.current = tx
  const t = last.current

  const [candidates, setCandidates] = useState<Transaction[] | null>(null)
  const [rates, setRates] = useState<RatesMap | null>(null)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const cardsById = useMemo(() => Object.fromEntries(cards.map(c => [c.id, c])), [cards])
  const currencyOf = (x: Transaction) => x.currency || (x.card_id && cardsById[x.card_id]?.currency) || 'UAH'
  const isOutgoing = !!t && Number(t.amount) < 0
  const ownCard = t?.card_id ? cardsById[t.card_id] : undefined
  const otherCards = useMemo(() => cards.filter(c => c.id !== t?.card_id), [cards, t?.card_id])
  const target = targetId ? cardsById[targetId] : undefined

  useEffect(() => {
    if (!tx) return
    setCandidates(null)
    setTargetId(null)
    setAmount('')
    fetchExchangeRates().then(setRates).catch(() => {})
    listTransferCandidates(tx)
      .then(setCandidates)
      .catch(() => setCandidates([]))
  }, [tx?.id])

  // The other side, most likely first: the same amount (in one currency, or converted), then the closest date
  const ranked = useMemo(() => {
    if (!t || !candidates) return []
    const amountAbs = Math.abs(Number(t.amount))
    const cur = currencyOf(t)
    const at = new Date(t.created_at).getTime()
    return candidates
      .map(c => {
        const theirs = Math.abs(Number(c.amount))
        const inOurs = Math.abs(convertCurrency(theirs, currencyOf(c), cur, rates))
        const off = amountAbs ? Math.abs(inOurs - amountAbs) / amountAbs : 1
        const exact = currencyOf(c) === cur && Math.abs(theirs - amountAbs) < 0.005
        const days = Math.abs(new Date(c.created_at).getTime() - at) / DAY
        // Exact amount, then within 3% after conversion, then everything else; by date inside
        const tier = exact ? 0 : off <= 0.03 ? 1 : off <= 0.15 ? 2 : 3
        return { c, tier, days }
      })
      .filter(x => x.tier < 3)
      .sort((a, b) => a.tier - b.tier || a.days - b.days)
      .slice(0, MAX_CANDIDATES)
      .map(x => x.c)
  }, [candidates, t, rates, cardsById])

  // The amount for a new leg: ours, converted when the other account has another currency
  useEffect(() => {
    if (!t || !target) return
    const v = Math.abs(convertCurrency(Math.abs(Number(t.amount)), currencyOf(t), target.currency || 'UAH', rates))
    setAmount(String(Math.round(v * 100) / 100).replace('.', ','))
  }, [targetId, rates])

  if (!t) return null

  const pair = (other: Transaction) => {
    const fromId = isOutgoing ? t.id : other.id
    const toId = isOutgoing ? other.id : t.id
    Alert.alert(
      'Об’єднати в переказ?',
      `«${txDisplayTitle(t)}» і «${txDisplayTitle(other)}» стануть одним переказом між рахунками й вийдуть зі статистики.`,
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Об’єднати',
          onPress: async () => {
            setBusy(true)
            try {
              await markExistingAsTransfer(fromId, toId)
              triggerSuccessHaptic()
              Toast.show({ type: 'success', text1: 'Переказ готовий', text2: 'Обидві транзакції вийшли зі статистики' })
              onDone()
              onClose()
            } catch (e: any) {
              triggerErrorHaptic()
              Toast.show({ type: 'error', text1: 'Не вдалося', text2: e?.message })
            } finally {
              setBusy(false)
            }
          },
        },
      ]
    )
  }

  const parsed = parseFloat(amount.replace(',', '.').replace(/\s/g, ''))
  const canCreate = !!target && Number.isFinite(parsed) && parsed > 0 && !busy

  const create = async () => {
    if (!target || !canCreate) return
    triggerLightHaptic()
    setBusy(true)
    try {
      await transferFromExisting(t.id, target.id, parsed)
      triggerSuccessHaptic()
      Toast.show({
        type: 'success',
        text1: 'Переказ готовий',
        text2: `${isOutgoing ? 'На' : 'З'} «${target.name}» ${isOutgoing ? 'додано' : 'списано'} ${formatMoney(parsed, target.currency || 'UAH')}`,
      })
      onDone()
      onClose()
    } catch (e: any) {
      triggerErrorHaptic()
      Toast.show({ type: 'error', text1: 'Не вдалося', text2: e?.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SheetModal visible={!!tx} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.header}>
        <Icon name="transfer" size={20} color={Colors.orange} strokeWidth={2.2} />
        <Text style={styles.title}>Зробити переказом</Text>
        <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}>
          <Icon name="close" size={15} color={Colors.white80} strokeWidth={2.6} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.source}>
          <TxRow tx={t} card={ownCard} hidden={hidden} showDate last swipeEnabled={false} />
        </View>
        <Text style={styles.lead}>
          {isOutgoing
            ? `Гроші пішли ${ownCard ? `з «${ownCard.name}»` : 'з готівки'}. Куди вони прийшли?`
            : `Гроші прийшли ${ownCard ? `на «${ownCard.name}»` : 'в готівку'}. Звідки?`}
        </Text>

        {/* The other side is already there */}
        <Text style={styles.sectionLabel}>ДРУГА ЧАСТИНА ВЖЕ Є</Text>
        {candidates === null ? (
          <ActivityIndicator color={Colors.orange} style={{ marginVertical: 14 }} />
        ) : ranked.length === 0 ? (
          <Text style={styles.empty}>
            Схожої транзакції {isOutgoing ? 'надходження' : 'списання'} на інших рахунках за тиждень поруч немає — створи її нижче.
          </Text>
        ) : (
          <View style={styles.list}>
            {ranked.map((c, i) => (
              <TxRow
                key={c.id}
                tx={c}
                card={c.card_id ? cardsById[c.card_id] : undefined}
                hidden={hidden}
                showDate
                last={i === ranked.length - 1}
                swipeEnabled={false}
                onPress={busy ? undefined : pair}
              />
            ))}
          </View>
        )}

        {/* Create the missing side */}
        <Text style={[styles.sectionLabel, { marginTop: 18 }]}>
          {isOutgoing ? 'ДРУГОЇ ЧАСТИНИ НЕМАЄ — КУДИ ПРИЙШЛИ?' : 'ДРУГОЇ ЧАСТИНИ НЕМАЄ — ЗВІДКИ?'}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
          {otherCards.map(c => {
            const active = c.id === targetId
            return (
              <Pressable
                key={c.id}
                onPress={() => {
                  triggerLightHaptic()
                  setTargetId(active ? null : c.id)
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
        {target && (
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>{isOutgoing ? 'Прийшло на рахунок' : 'Списалось з рахунку'}</Text>
            <TextInput
              style={styles.amountInput}
              value={hidden ? '••••' : amount}
              editable={!hidden}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              selectTextOnFocus
            />
            <Text style={styles.amountCur}>{target.currency}</Text>
          </View>
        )}
        <Pressable onPress={create} disabled={!canCreate} style={({ pressed }) => [styles.createBtn, !canCreate && styles.createOff, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.createText}>{target ? 'Створити переказ' : 'Оберіть рахунок'}</Text>}
        </Pressable>
        <Text style={styles.hint}>
          Переказ не рахується ні витратою, ні доходом. Скасувати можна з меню транзакції: «Скасувати переказ».
        </Text>
      </ScrollView>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  sheet: { maxHeight: '88%', backgroundColor: '#121216', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingBottom: 10 },
  title: { flex: 1, fontSize: 19, fontWeight: '800', color: Colors.white },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  pressed: { opacity: 0.6 },
  content: { paddingHorizontal: 16, paddingBottom: 36 },
  source: { borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,107,0,0.45)' },
  lead: { fontSize: 15, lineHeight: 21, color: Colors.white, marginTop: 12, marginBottom: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  empty: { fontSize: 13.5, lineHeight: 19, color: Colors.white60, paddingHorizontal: 4 },
  list: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#1A1A1E', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  cardsRow: { gap: 8, paddingVertical: 2 },
  cardPill: {
    minWidth: 110,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardPillActive: { backgroundColor: 'rgba(255,107,0,0.18)', borderColor: 'rgba(255,107,0,0.55)' },
  cardBank: { fontSize: 11, fontWeight: '700', color: Colors.white40 },
  cardName: { fontSize: 14, fontWeight: '700', color: Colors.white80, marginTop: 2 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  amountLabel: { flex: 1, fontSize: 13.5, color: Colors.white60 },
  amountInput: { minWidth: 90, textAlign: 'right', fontSize: 20, fontWeight: '800', color: Colors.white, fontVariant: ['tabular-nums'] },
  amountCur: { fontSize: 14, fontWeight: '700', color: Colors.white60 },
  createBtn: { marginTop: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 16, backgroundColor: Colors.orange },
  createOff: { opacity: 0.4 },
  createText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  hint: { fontSize: 12, lineHeight: 17, color: Colors.white40, marginTop: 12, paddingHorizontal: 4 },
})
