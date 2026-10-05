import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { Colors } from '../constants/theme'
import { Card } from '../api/cards'
import { Transaction } from '../api/transactions'
import {
  DetectedSubscription,
  detectSubscriptions,
  listSubscriptionCharges,
  listSubscriptions,
  monthlyCost,
  updateSubscription,
} from '../api/insights'
import { convertCurrency, formatMoney, RatesMap } from '../utils/currency'
import { getCategoryIcon } from '../utils/categoryIcon'
import { scheduleSubscriptionReminders, SUBSCRIPTION_REMIND_PATH } from '../utils/reminders'
import { useSettingsStore } from '../store/useSettingsStore'
import { triggerLightHaptic, triggerSuccessHaptic } from '../utils/haptics'
import { txBus } from '../utils/txBus'
import SheetModal from './SheetModal'
import TxRow from './TxRow'

const FREQ: Record<DetectedSubscription['frequency'], string> = { weekly: 'щотижня', monthly: 'щомісяця', yearly: 'щороку' }
const DAY = 864e5

function dueLabel(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date().setHours(0, 0, 0, 0)) / DAY)
  if (days === 0) return 'сьогодні'
  if (days === 1) return 'завтра'
  if (days > 1 && days <= 6) return `через ${days} ${days < 5 ? 'дні' : 'днів'}`
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
}

const chargeText = (s: DetectedSubscription, currency?: string | null) => {
  const per = Math.max(1, s.charges_per_period || 1)
  const cur = s.currency || currency || 'UAH'
  return per > 1 ? `${per} × ${formatMoney(Number(s.amount), cur)}` : formatMoney(Number(s.amount), cur)
}

interface Props {
  cards: Card[]
  rates: RatesMap | null
  currency: string
  hidden?: boolean
  title?: string
  /** Bumped by pull-to-refresh: look for subscriptions again right away */
  refreshKey?: number
  /** Loaded (e.g. to stop the pull-to-refresh spinner) */
  onLoaded?: () => void
}

/**
 * Subscriptions the bank's charges show (Netflix, rent, the phone…): just for information — the
 * charges come from the bank, the app only finds them. Tap one to see every charge.
 */
export default function SubscriptionsCard({ cards, rates, currency, hidden, title = 'Підписки', refreshKey = 0, onLoaded }: Props) {
  const [subs, setSubs] = useState<DetectedSubscription[] | null>(null)
  const [open, setOpen] = useState<DetectedSubscription | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [showOld, setShowOld] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const remind = useSettingsStore(s => s.getNestedSetting<boolean>(SUBSCRIPTION_REMIND_PATH, true))
  const updateNestedSetting = useSettingsStore(s => s.updateNestedSetting)
  const loadId = useRef(0)

  const onLoadedRef = useRef(onLoaded)
  onLoadedRef.current = onLoaded
  const load = useCallback(async (detect: boolean, force = false) => {
    const id = ++loadId.current
    try {
      if (detect) await detectSubscriptions(force).catch(() => null)
      const list = await listSubscriptions()
      if (id !== loadId.current) return
      setSubs(list)
      scheduleSubscriptionReminders(list, useSettingsStore.getState().getNestedSetting<boolean>(SUBSCRIPTION_REMIND_PATH, true))
    } catch (e) {
      if (id === loadId.current) setSubs(prev => prev ?? [])
    } finally {
      if (id === loadId.current) onLoadedRef.current?.()
    }
  }, [])

  useEffect(() => {
    load(true)
  }, [load])
  useEffect(() => {
    if (refreshKey) load(true, true)
  }, [refreshKey])
  useEffect(() => txBus.subscribe(ev => ev?.type === 'SYNCED' && load(false)), [load])

  const cardCurrency = (id?: string | null) => cards.find(c => c.id === id)?.currency || null
  const toMain = (s: DetectedSubscription) =>
    convertCurrency(monthlyCost(s), (s.currency || cardCurrency(s.card_id) || 'UAH').toUpperCase(), currency, rates)

  const groups = useMemo(() => {
    const list = subs ?? []
    const detected = list.filter(s => s.source === 'detected' && !s.hidden)
    const byDue = (a: DetectedSubscription, b: DetectedSubscription) =>
      (a.next_execution_at || '').localeCompare(b.next_execution_at || '')
    return {
      active: detected.filter(s => s.is_active).sort(byDue),
      inactive: detected.filter(s => !s.is_active).sort((a, b) => (b.last_executed_at || '').localeCompare(a.last_executed_at || '')),
      old: list.filter(s => s.source !== 'detected' && !s.hidden),
      hiddenOnes: list.filter(s => s.hidden),
    }
  }, [subs])
  const monthly = groups.active.reduce((sum, s) => sum + toMain(s), 0)

  const toggleRemind = (on: boolean) => {
    triggerLightHaptic()
    updateNestedSetting(SUBSCRIPTION_REMIND_PATH, on)
    scheduleSubscriptionReminders(subs ?? [], on)
  }

  const row = (s: DetectedSubscription, i: number, list: DetectedSubscription[], muted = false) => (
    <Pressable
      key={s.id}
      onPress={() => {
        triggerLightHaptic()
        setOpen(s)
      }}
      style={({ pressed }) => [styles.row, i < list.length - 1 && styles.rowBorder, pressed && styles.pressed]}
    >
      <View style={[styles.icon, muted && styles.iconMuted]}>
        <Text style={styles.iconEmoji}>{getCategoryIcon(s.category ?? 'Підписки', -1)}</Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.name, muted && styles.nameMuted]} numberOfLines={1}>{s.name}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {s.hidden
            ? 'прихована — не підписка'
            : s.source !== 'detected'
            ? 'додана вручну'
            : s.is_active
              ? `${FREQ[s.frequency]} · наступне ${dueLabel(s.next_execution_at)}`
              : `не списується з ${s.last_executed_at ? new Date(s.last_executed_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }) : '—'}`}
        </Text>
      </View>
      <Text style={[styles.amount, muted && styles.nameMuted]}>{hidden ? '••••' : chargeText(s, cardCurrency(s.card_id))}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {groups.active.length > 0 && (
          <Text style={styles.total}>{hidden ? '••••' : `≈ ${formatMoney(monthly, currency, { hideCents: true })}/міс`}</Text>
        )}
      </View>

      {subs === null ? (
        <ActivityIndicator color={Colors.orange} style={{ marginVertical: 14 }} />
      ) : groups.active.length === 0 && groups.inactive.length === 0 ? (
        <Text style={styles.empty}>
          Регулярних списань поки не видно. Коли банк кілька разів спише ту саму суму щомісяця — вона з’явиться тут.
        </Text>
      ) : (
        groups.active.map((s, i, list) => row(s, i, list))
      )}

      {groups.inactive.length > 0 && (
        <>
          <Pressable onPress={() => setShowInactive(v => !v)} style={styles.toggle}>
            <Text style={styles.toggleText}>
              {showInactive ? '▾' : '▸'} Більше не списуються ({groups.inactive.length})
            </Text>
          </Pressable>
          {showInactive && groups.inactive.map((s, i, list) => row(s, i, list, true))}
        </>
      )}
      {groups.old.length > 0 && (
        <>
          <Pressable onPress={() => setShowOld(v => !v)} style={styles.toggle}>
            <Text style={styles.toggleText}>
              {showOld ? '▾' : '▸'} Додані вручну раніше ({groups.old.length})
            </Text>
          </Pressable>
          {showOld && groups.old.map((s, i, list) => row(s, i, list, true))}
        </>
      )}
      {groups.hiddenOnes.length > 0 && (
        <>
          <Pressable onPress={() => setShowHidden(v => !v)} style={styles.toggle}>
            <Text style={styles.toggleText}>
              {showHidden ? '▾' : '▸'} Приховані ({groups.hiddenOnes.length})
            </Text>
          </Pressable>
          {showHidden && groups.hiddenOnes.map((s, i, list) => row(s, i, list, true))}
        </>
      )}

      <View style={styles.remindRow}>
        <Text style={styles.remindText}>🔔 Нагадувати за день до списання</Text>
        <Switch value={remind} onValueChange={toggleRemind} trackColor={{ true: Colors.orange }} />
      </View>
      <Text style={styles.foot}>
        Знайдено в списаннях банку — нічого не створюється. Помилка? Відкрийте й натисніть «Це не підписка».
      </Text>

      <SubscriptionSheet
        sub={open}
        cards={cards}
        hidden={hidden}
        onClose={() => setOpen(null)}
        onChanged={() => {
          setOpen(null)
          load(false)
        }}
      />
    </View>
  )
}

/** One subscription: every charge the bank made for it */
function SubscriptionSheet({
  sub,
  cards,
  hidden,
  onClose,
  onChanged,
}: {
  sub: DetectedSubscription | null
  cards: Card[]
  hidden?: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const last = useRef<DetectedSubscription | null>(null)
  if (sub) last.current = sub
  const s = sub ?? last.current
  const [charges, setCharges] = useState<Transaction[] | null>(null)

  useEffect(() => {
    if (!sub) return
    setCharges(null)
    listSubscriptionCharges(sub.id)
      .then(setCharges)
      .catch(() => setCharges([]))
  }, [sub?.id])

  if (!s) return null
  const cardsById = Object.fromEntries(cards.map(c => [c.id, c]))
  const cur = s.currency || cards.find(c => c.id === s.card_id)?.currency || 'UAH'
  // Charges can be in different currencies (another card): sum per currency
  const totals = new Map<string, number>()
  for (const t of charges ?? []) {
    const c = t.currency || (t.card_id && cardsById[t.card_id]?.currency) || cur
    totals.set(c, (totals.get(c) || 0) + Math.abs(Number(t.amount)))
  }
  const totalText = [...totals.entries()].map(([c, v]) => formatMoney(v, c)).join(' + ')

  const hide = () =>
    Alert.alert('Це не підписка?', `«${s.name}» зникне зі списку, і MyWallet більше не вважатиме ці списання підпискою.`, [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Не підписка',
        style: 'destructive',
        onPress: async () => {
          try {
            await updateSubscription(s.id, { hidden: true })
            triggerSuccessHaptic()
            onChanged()
          } catch (e: any) {
            Toast.show({ type: 'error', text1: 'Не вдалося', text2: e?.message })
          }
        },
      },
    ])

  const unhide = async () => {
    try {
      await updateSubscription(s.id, { hidden: false })
      triggerSuccessHaptic()
      onChanged()
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Не вдалося', text2: e?.message })
    }
  }

  const rename = () =>
    Alert.prompt(
      'Назва підписки',
      undefined,
      async name => {
        const clean = String(name || '').trim()
        if (!clean || clean === s.name) return
        try {
          await updateSubscription(s.id, { name: clean })
          onChanged()
        } catch (e: any) {
          Toast.show({ type: 'error', text1: 'Не вдалося', text2: e?.message })
        }
      },
      'plain-text',
      s.name
    )

  return (
    <SheetModal visible={!!sub} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.sheetHead}>
        <View style={styles.sheetIcon}>
          <Text style={{ fontSize: 24 }}>{getCategoryIcon(s.category ?? 'Підписки', -1)}</Text>
        </View>
        <Pressable onPress={rename} style={{ flex: 1 }}>
          <Text style={styles.sheetTitle} numberOfLines={1}>{s.name}</Text>
          <Text style={styles.sheetSub}>
            {hidden ? '••••' : chargeText(s, cur)} · {FREQ[s.frequency]}
            {s.source === 'detected' && s.is_active && s.next_execution_at ? ` · наступне ${dueLabel(s.next_execution_at)}` : ''}
          </Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{charges ? charges.length : '…'}</Text>
          <Text style={styles.statLabel}>списань</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{charges ? (hidden ? '••••' : totalText || '—') : '…'}</Text>
          <Text style={styles.statLabel}>разом</Text>
        </View>
      </View>

      <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 12 }}>
        {charges === null ? (
          <ActivityIndicator color={Colors.orange} style={{ marginVertical: 20 }} />
        ) : charges.length === 0 ? (
          <Text style={styles.empty}>Списань ще немає</Text>
        ) : (
          charges.map((t, i) => (
            <TxRow key={t.id} tx={t} card={t.card_id ? cardsById[t.card_id] : undefined} hidden={hidden} showDate last={i === charges.length - 1} swipeEnabled={false} />
          ))
        )}
      </ScrollView>

      <View style={styles.sheetActions}>
        <Pressable onPress={rename} style={({ pressed }) => [styles.sheetBtn, pressed && styles.pressed]}>
          <Text style={styles.sheetBtnText}>Перейменувати</Text>
        </Pressable>
        {s.hidden ? (
          <Pressable onPress={unhide} style={({ pressed }) => [styles.sheetBtn, pressed && styles.pressed]}>
            <Text style={styles.sheetBtnText}>Повернути в підписки</Text>
          </Pressable>
        ) : s.source === 'detected' ? (
          <Pressable onPress={hide} style={({ pressed }) => [styles.sheetBtn, pressed && styles.pressed]}>
            <Text style={[styles.sheetBtnText, { color: '#FF6B6B' }]}>Це не підписка</Text>
          </Pressable>
        ) : null}
      </View>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    borderRadius: 20,
    padding: 14,
    backgroundColor: '#141416',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontSize: 17, fontWeight: '800', color: Colors.white },
  total: { fontSize: 14, fontWeight: '800', color: Colors.orangeLight, fontVariant: ['tabular-nums'] },
  empty: { fontSize: 13.5, color: Colors.white40, paddingVertical: 8, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  pressed: { opacity: 0.6 },
  icon: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255, 107, 0, 0.12)', alignItems: 'center', justifyContent: 'center' },
  iconMuted: { backgroundColor: 'rgba(255,255,255,0.06)' },
  iconEmoji: { fontSize: 18 },
  body: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: Colors.white },
  nameMuted: { color: Colors.white60 },
  meta: { fontSize: 12, color: Colors.white40, marginTop: 2 },
  amount: { fontSize: 14.5, fontWeight: '700', color: Colors.white, fontVariant: ['tabular-nums'] },
  chevron: { fontSize: 20, color: Colors.white40 },
  toggle: { paddingVertical: 10 },
  toggleText: { fontSize: 13, fontWeight: '700', color: Colors.white60 },
  remindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  remindText: { fontSize: 14, color: Colors.white80, flex: 1 },
  foot: { fontSize: 11.5, color: Colors.white40, marginTop: 8, lineHeight: 16 },

  sheet: { maxHeight: '88%', backgroundColor: '#121216', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingHorizontal: 16 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  sheetIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255, 107, 0, 0.14)', alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: Colors.white },
  sheetSub: { fontSize: 13, color: Colors.white60, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 10, marginVertical: 10 },
  stat: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)' },
  statValue: { fontSize: 18, fontWeight: '800', color: Colors.white, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 12, color: Colors.white40, marginTop: 2 },
  sheetActions: { flexDirection: 'row', gap: 10, paddingVertical: 12, paddingBottom: 28 },
  sheetBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)' },
  sheetBtnText: { fontSize: 14.5, fontWeight: '700', color: Colors.orange },
})
