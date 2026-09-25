import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Colors } from '../constants/theme'
import { Card } from '../api/cards'
import { CardPeriod, getCardPeriodTotals, listCardTransactions, Transaction } from '../api/transactions'
import { triggerLightHaptic } from '../utils/haptics'
import SheetModal from './SheetModal'
import { GlassPressable } from './LiquidGlass'
import TxRow, { fmtMoney } from './TxRow'

type PeriodId = 'week' | 'month' | '3m' | 'year' | 'all'

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'week', label: 'Тиждень' },
  { id: 'month', label: 'Місяць' },
  { id: '3m', label: '3 місяці' },
  { id: 'year', label: 'Рік' },
  { id: 'all', label: 'Весь час' },
]

const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень']
const PAGE = 50
const INCLUDE_ALL_KEY = 'card_tx_include_all'
const GRADIENTS: [string, string][] = [
  ['#FF7A1A', '#B83A00'],
  ['#6D5DFC', '#2A1E9C'],
  ['#1FB6A6', '#0B5E63'],
  ['#E0457B', '#7A1540'],
]

/** Period bounds; `offset` steps back in weeks/months/years (0 = current). */
function periodRange(id: PeriodId, offset: number): { start: Date | null; end: Date | null; label: string } {
  const now = new Date()
  if (id === 'week') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7) // Monday
    const end = new Date(start)
    end.setDate(start.getDate() + 7)
    end.setMilliseconds(-1)
    const f = (d: Date) => d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
    return { start, end, label: offset === 0 ? `Цей тиждень · ${f(start)} – ${f(end)}` : `${f(start)} – ${f(end)}` }
  }
  if (id === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    end.setMilliseconds(-1)
    return { start, end, label: `${MONTHS[start.getMonth()]} ${start.getFullYear()}` }
  }
  if (id === '3m') {
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    return { start, end: null, label: `${MONTHS[start.getMonth()]} – ${MONTHS[now.getMonth()]}` }
  }
  if (id === 'year') {
    const y = now.getFullYear() + offset
    return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1, 0, 0, 0, -1), label: `${y} рік` }
  }
  return { start: null, end: null, label: 'Весь час' }
}

function dayTitle(d: Date): string {
  const now = new Date()
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, now)) return 'Сьогодні'
  if (same(d, y)) return 'Вчора'
  return d.toLocaleDateString('uk-UA', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  })
}

interface Props {
  card: Card | null
  balance?: number
  hidden?: boolean
  onClose: () => void
  onOpenSettings: (card: Card) => void
}

/** Tap on a card: its transactions by period with income/expense totals (like the web drawer). */
export default function CardTransactionsSheet({ card, balance, hidden, onClose, onOpenSettings }: Props) {
  // Keep showing the last card while the sheet slides out
  const lastCard = useRef<Card | null>(null)
  if (card) lastCard.current = card
  const c = card ?? lastCard.current

  const [period, setPeriod] = useState<PeriodId>('month')
  const [offset, setOffset] = useState(0)
  const [includeAll, setIncludeAll] = useState(false)
  const [txs, setTxs] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [totals, setTotals] = useState<{ income: number; expense: number; count: number } | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    AsyncStorage.getItem(INCLUDE_ALL_KEY).then(v => setIncludeAll(v === '1'))
  }, [])

  // New card: start from this month
  useEffect(() => {
    if (card) {
      setPeriod('month')
      setOffset(0)
    }
  }, [card?.id])

  const range = useMemo(() => periodRange(period, offset), [period, offset])
  const query: CardPeriod | null = useMemo(
    () => (c ? { cardId: c.id, start: range.start?.toISOString() ?? null, end: range.end?.toISOString() ?? null } : null),
    [c?.id, range]
  )

  // First page + totals whenever the card or period changes
  useEffect(() => {
    if (!card || !query) return
    const id = ++requestId.current
    setLoading(true)
    setTxs([])
    setHasMore(true)
    listCardTransactions(query, 0, PAGE - 1)
      .then(page => {
        if (id !== requestId.current) return
        setTxs(page)
        setHasMore(page.length === PAGE)
      })
      .catch(e => console.warn('[CardTx] load failed:', e))
      .finally(() => id === requestId.current && setLoading(false))
  }, [card, query])

  useEffect(() => {
    if (!card || !query) return
    const id = requestId.current
    setTotals(null)
    getCardPeriodTotals(query, includeAll)
      .then(t => id === requestId.current && setTotals(t))
      .catch(e => console.warn('[CardTx] totals failed:', e))
  }, [card, query, includeAll])

  const loadMore = useCallback(() => {
    if (!query || loading || loadingMore || !hasMore) return
    const id = requestId.current
    setLoadingMore(true)
    listCardTransactions(query, txs.length, txs.length + PAGE - 1)
      .then(page => {
        if (id !== requestId.current) return
        setTxs(prev => {
          const seen = new Set(prev.map(t => t.id))
          return [...prev, ...page.filter(t => !seen.has(t.id))]
        })
        setHasMore(page.length === PAGE)
      })
      .catch(e => console.warn('[CardTx] more failed:', e))
      .finally(() => setLoadingMore(false))
  }, [query, loading, loadingMore, hasMore, txs.length])

  const sections = useMemo(() => {
    const out: { key: string; title: string; total: number; data: Transaction[] }[] = []
    for (const t of txs) {
      const d = new Date(t.created_at)
      const key = d.toDateString()
      let s = out[out.length - 1]
      if (!s || s.key !== key) {
        s = { key, title: dayTitle(d), total: 0, data: [] }
        out.push(s)
      }
      s.data.push(t)
      if (includeAll || !t.exclude_from_stats) s.total += Number(includeAll ? t.amount : t.amount_stat ?? t.amount)
    }
    return out
  }, [txs, includeAll])

  if (!c) return null
  const cur = c.currency
  const mask = (s: string) => (hidden ? '••••' : s)
  const net = totals ? totals.income + totals.expense : 0
  const canNavigate = period === 'week' || period === 'month' || period === 'year'
  const grad = GRADIENTS[(c.id.charCodeAt(0) || 0) % GRADIENTS.length]

  const pickPeriod = (p: PeriodId) => {
    if (p === period) return
    triggerLightHaptic()
    setPeriod(p)
    setOffset(0)
  }

  const toggleIncludeAll = () => {
    triggerLightHaptic()
    const next = !includeAll
    setIncludeAll(next)
    AsyncStorage.setItem(INCLUDE_ALL_KEY, next ? '1' : '0').catch(() => {})
  }

  const header = (
    <View>
      {/* Card */}
      <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardBox}>
        <View style={styles.cardTop}>
          <View style={styles.cardNames}>
            <Text style={styles.cardBank} numberOfLines={1}>{c.bank || 'Рахунок'}</Text>
            <Text style={styles.cardName} numberOfLines={1}>{c.name}</Text>
          </View>
          <Pressable onPress={() => onOpenSettings(c)} hitSlop={8} style={styles.cardSettings}>
            <Text style={styles.cardSettingsText}>⚙︎</Text>
          </Pressable>
        </View>
        <Text style={styles.cardBalanceLabel}>Баланс</Text>
        <Text style={styles.cardBalance}>
          {mask(`${(balance ?? Number(c.initial_balance ?? 0)) < 0 ? '−' : ''}${fmtMoney(balance ?? Number(c.initial_balance ?? 0), cur)}`)}
        </Text>
        {c.exclude_from_stats || c.bank_exclude_from_stats ? (
          <Text style={styles.cardExcluded}>Не враховується в статистиці</Text>
        ) : null}
      </LinearGradient>

      {/* Periods */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periods}>
        {PERIODS.map(p => {
          const active = p.id === period
          return (
            <Pressable key={p.id} onPress={() => pickPeriod(p.id)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {/* Navigator: ‹ Вересень 2026 › */}
      <View style={styles.nav}>
        {canNavigate ? (
          <Pressable
            onPress={() => {
              triggerLightHaptic()
              setOffset(o => o - 1)
            }}
            hitSlop={10}
            style={styles.navBtn}
          >
            <Text style={styles.navArrow}>‹</Text>
          </Pressable>
        ) : (
          <View style={styles.navBtn} />
        )}
        <Text style={styles.navLabel}>{range.label}</Text>
        {canNavigate ? (
          <Pressable
            onPress={() => {
              if (offset >= 0) return
              triggerLightHaptic()
              setOffset(o => o + 1)
            }}
            hitSlop={10}
            style={[styles.navBtn, offset >= 0 && styles.navBtnDisabled]}
          >
            <Text style={styles.navArrow}>›</Text>
          </Pressable>
        ) : (
          <View style={styles.navBtn} />
        )}
      </View>

      {/* Totals */}
      <View style={styles.stats}>
        <View style={[styles.stat, styles.statIncome]}>
          <Text style={styles.statLabel}>Доходи</Text>
          <Text style={[styles.statValue, { color: Colors.green }]} numberOfLines={1} adjustsFontSizeToFit>
            {totals ? mask(`+${fmtMoney(totals.income, cur)}`) : '…'}
          </Text>
        </View>
        <View style={[styles.stat, styles.statExpense]}>
          <Text style={styles.statLabel}>Витрати</Text>
          <Text style={[styles.statValue, { color: '#FF6B6B' }]} numberOfLines={1} adjustsFontSizeToFit>
            {totals ? mask(`−${fmtMoney(totals.expense, cur)}`) : '…'}
          </Text>
        </View>
        <View style={[styles.stat, styles.statNet]}>
          <Text style={styles.statLabel}>Різниця</Text>
          <Text style={[styles.statValue, { color: net >= 0 ? Colors.white : Colors.orange }]} numberOfLines={1} adjustsFontSizeToFit>
            {totals ? mask(`${net >= 0 ? '+' : '−'}${fmtMoney(net, cur)}`) : '…'}
          </Text>
        </View>
      </View>

      <View style={styles.statsFooter}>
        <Text style={styles.countText}>
          {totals ? `${totals.count} ${totals.count % 10 === 1 && totals.count % 100 !== 11 ? 'транзакція' : 'транзакцій'}` : ' '}
        </Text>
        <Pressable onPress={toggleIncludeAll} style={[styles.toggle, includeAll && styles.toggleOn]}>
          <Text style={[styles.toggleText, includeAll && styles.toggleTextOn]}>
            {includeAll ? '👁 Всі транзакції' : '◌ Тільки враховані'}
          </Text>
        </Pressable>
      </View>
    </View>
  )

  return (
    <SheetModal visible={!!card} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Транзакції картки</Text>
        <GlassPressable onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </GlassPressable>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={t => t.id}
        style={styles.list}
        stickySectionHeadersEnabled
        ListHeaderComponent={header}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{section.title}</Text>
            <Text style={[styles.dayTotal, section.total > 0 && { color: Colors.green }]}>
              {section.total !== 0 ? mask(`${section.total > 0 ? '+' : '−'}${fmtMoney(section.total, cur)}`) : ''}
            </Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <TxRow tx={item} card={c} hidden={hidden} swipeEnabled={false} last={index === section.data.length - 1} />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.state}>
              <ActivityIndicator color={Colors.orange} />
            </View>
          ) : (
            <View style={styles.state}>
              <Text style={styles.stateEmoji}>🧾</Text>
              <Text style={styles.stateText}>
                {period === 'all' ? 'По цій картці ще немає транзакцій' : `Немає транзакцій · ${range.label}`}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          txs.length > 0 ? (
            <View style={styles.footer}>
              {loadingMore ? (
                <ActivityIndicator color={Colors.orange} />
              ) : !hasMore ? (
                <Text style={styles.footerText}>Усі транзакції за період · {txs.length}</Text>
              ) : null}
            </View>
          ) : null
        }
      />
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    height: '92%',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: Colors.white80,
    fontSize: 15,
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  cardBox: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 22,
    padding: 18,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardNames: {
    flex: 1,
  },
  cardBank: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.75)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.white,
    marginTop: 2,
  },
  cardSettings: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardSettingsText: {
    fontSize: 17,
    color: Colors.white,
  },
  cardBalanceLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 18,
  },
  cardBalance: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.white,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  cardExcluded: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 6,
  },
  periods: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.18)',
    borderColor: 'rgba(255, 107, 0, 0.5)',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white80,
  },
  chipTextActive: {
    color: Colors.white,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  navBtn: {
    width: 36,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: {
    opacity: 0.25,
  },
  navArrow: {
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '600',
    color: Colors.white,
  },
  navLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  stats: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
  },
  stat: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 4,
  },
  statIncome: {
    backgroundColor: 'rgba(34, 197, 94, 0.10)',
  },
  statExpense: {
    backgroundColor: 'rgba(239, 68, 68, 0.10)',
  },
  statNet: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.white60,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
  },
  countText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  toggle: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  toggleOn: {
    backgroundColor: 'rgba(255, 107, 0, 0.18)',
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.white60,
  },
  toggleTextOn: {
    color: Colors.orange,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
    backgroundColor: '#141418', // sticky header over the rows
  },
  dayTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white60,
  },
  dayTotal: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  state: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  stateEmoji: {
    fontSize: 28,
  },
  stateText: {
    fontSize: 14,
    color: Colors.textSub,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  footer: {
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 30,
  },
  footerText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
})
