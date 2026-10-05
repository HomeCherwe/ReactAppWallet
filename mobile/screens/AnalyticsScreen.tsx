import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { initialWindowMetrics } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import Toast from 'react-native-toast-message'
import PullToRefreshIndicator, { usePullToRefresh } from '../components/PullToRefreshIndicator'
import CategoryTransactionsSheet, { CategoryView } from '../components/CategoryTransactionsSheet'
import MonthlyReportCard from '../components/MonthlyReportCard'
import SubscriptionsCard from '../components/SubscriptionsCard'
import WrappedModal, { defaultWrappedYear } from '../components/WrappedModal'
import { MonthlyReportStats } from '../api/insights'
import { txDisplayTitle } from '../utils/pinned'
import { checkForAppUpdate } from '../utils/appUpdate'
import { Colors } from '../constants/theme'
import { listPeriodTransactions, Transaction } from '../api/transactions'
import { listCards, Card } from '../api/cards'
import { fetchExchangeRates, formatMoney, RatesMap } from '../utils/currency'
import { countedTransactions } from '../utils/statsCount'
import { getStoredPrimaryCurrency } from '../utils/settings'
import { getCategoryIcon } from '../utils/categoryIcon'
import { useExcludedCardIds } from '../utils/cardExclusion'
import { useExcludedCategories } from '../utils/statsCategories'
import { triggerLightHaptic } from '../utils/haptics'
import { txBus } from '../utils/txBus'

// The pull indicator slides out from just under the status bar
const SAFE_TOP = initialWindowMetrics?.insets.top ?? 47
// Months in the trend chart (the chosen one is the last)
const TREND_MONTHS = 6
const TREND_HEIGHT = 110

const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень']
const MONTHS_SHORT = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру']

const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`
const firstOfMonth = (d: Date, shift = 0) => new Date(d.getFullYear(), d.getMonth() + shift, 1)

interface CategoryStat {
  category: string
  amount: number
  count: number
  share: number
  transactions: Transaction[]
}

function byCategory(list: { tx: Transaction; value: number }[], total: number): CategoryStat[] {
  const map = new Map<string, CategoryStat>()
  for (const { tx, value } of list) {
    const cat = tx.category || 'Інше'
    const s = map.get(cat) ?? { category: cat, amount: 0, count: 0, share: 0, transactions: [] }
    s.amount += value
    s.count += 1
    s.transactions.push(tx)
    map.set(cat, s)
  }
  return [...map.values()]
    .map(s => ({ ...s, share: total > 0 ? s.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

/**
 * Analytics: the chosen month's income and expenses together — totals, a 6-month trend and both
 * category lists on one screen. Tap a category to see (and edit) its transactions. Counted the same
 * way as Home: no archived rows, transfers, "not in stats" (transactions, categories, cards) or
 * savings; refunds are taken off their expense; everything in the main currency.
 */
export default function AnalyticsScreen() {
  const [month, setMonth] = useState(() => firstOfMonth(new Date()))
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [rates, setRates] = useState<RatesMap | null>(null)
  const [currency, setCurrency] = useState('UAH')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [openCategory, setOpenCategory] = useState<CategoryView | null>(null)
  const [wrappedOpen, setWrappedOpen] = useState(false)
  const pullY = useRef(new Animated.Value(0)).current
  const requestId = useRef(0)

  const excludedCardIds = useExcludedCardIds(cards)
  const excludedCats = useExcludedCategories()

  const loadData = useCallback(async (quiet = false) => {
    const id = ++requestId.current
    if (!quiet) setLoading(true)
    try {
      const [txs, cardsData, ratesData, cur] = await Promise.all([
        listPeriodTransactions(firstOfMonth(month, -(TREND_MONTHS - 1)), firstOfMonth(month, 1)),
        listCards().catch(() => [] as Card[]),
        fetchExchangeRates().catch(() => null),
        getStoredPrimaryCurrency().catch(() => 'UAH'),
      ])
      if (id !== requestId.current) return
      setTransactions(txs)
      setCards(cardsData)
      setRates(ratesData)
      setCurrency(cur || 'UAH')
    } catch (e: any) {
      if (id === requestId.current) {
        Toast.show({ type: 'error', text1: 'Не вдалося завантажити аналітику', text2: e?.message })
      }
    } finally {
      if (id === requestId.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [month])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Changes made elsewhere (a bank sync, an edit on Home)
  useEffect(() => txBus.subscribe(ev => ev?.type === 'SYNCED' && loadData(true)), [loadData])

  // What counts, in the main currency (expenses as positive numbers)
  const counted = useMemo(
    () =>
      countedTransactions(transactions, { cards, rates, currency, excludedCardIds, excludedCategories: excludedCats }).map(c => ({
        ...c,
        key: monthKey(new Date(c.tx.created_at)),
      })),
    [transactions, cards, rates, currency, excludedCardIds, excludedCats]
  )

  const current = monthKey(month)
  const inMonth = useMemo(() => counted.filter(c => c.key === current), [counted, current])
  const income = inMonth.filter(c => c.income)
  const expenses = inMonth.filter(c => !c.income)
  const incomeTotal = income.reduce((s, c) => s + c.value, 0)
  const expenseTotal = expenses.reduce((s, c) => s + c.value, 0)
  const net = incomeTotal - expenseTotal
  const expenseCats = useMemo(() => byCategory(expenses, expenseTotal), [inMonth])
  const incomeCats = useMemo(() => byCategory(income, incomeTotal), [inMonth])

  const trend = useMemo(() => {
    const months = Array.from({ length: TREND_MONTHS }, (_, i) => firstOfMonth(month, i - (TREND_MONTHS - 1)))
    const sums = months.map(m => {
      const k = monthKey(m)
      let inc = 0
      let exp = 0
      for (const c of counted) if (c.key === k) c.income ? (inc += c.value) : (exp += c.value)
      return { month: m, income: inc, expense: exp }
    })
    const max = Math.max(1, ...sums.flatMap(s => [s.income, s.expense]))
    return { sums, max }
  }, [counted, month])

  const isCurrentMonth = monthKey(month) === monthKey(new Date())
  const periodLabel = `${MONTHS[month.getMonth()]} ${month.getFullYear()}`

  // The numbers GPT writes the month's report from — the same ones this screen shows
  const reportStats = useMemo<MonthlyReportStats>(() => {
    const round = (v: number) => Math.round(v)
    const prevKey = monthKey(firstOfMonth(month, -1))
    const prev = counted.filter(c => c.key === prevKey)
    const prevByCat = new Map<string, number>()
    for (const c of prev) if (!c.income) prevByCat.set(c.tx.category || 'Інше', (prevByCat.get(c.tx.category || 'Інше') || 0) + c.value)
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return {
      income: round(incomeTotal),
      expense: round(expenseTotal),
      previous: {
        income: round(prev.filter(c => c.income).reduce((s, c) => s + c.value, 0)),
        expense: round(prev.filter(c => !c.income).reduce((s, c) => s + c.value, 0)),
      },
      topCategories: expenseCats.slice(0, 8).map(c => ({ name: c.category, amount: round(c.amount), previous: round(prevByCat.get(c.category) || 0) })),
      biggest: [...expenses]
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)
        .map(c => ({ title: txDisplayTitle(c.tx).slice(0, 60), amount: round(c.value), date: c.tx.created_at.slice(0, 10) })),
      transactions: inMonth.length,
      ...(isCurrentMonth && { partial: `${new Date().getDate()} з ${daysInMonth} днів` }),
    }
  }, [counted, month, inMonth, isCurrentMonth])
  const monthId = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  const shift = (by: number) => {
    triggerLightHaptic()
    setMonth(m => firstOfMonth(m, by))
  }

  const pull = usePullToRefresh(() => {
    setRefreshing(true)
    loadData(true)
    checkForAppUpdate()
  }, refreshing)

  const openCat = (stat: CategoryStat, kind: 'expense' | 'income') => {
    triggerLightHaptic()
    setOpenCategory({
      category: stat.category,
      kind,
      total: stat.amount,
      currency,
      periodLabel,
      transactions: [...stat.transactions].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    })
  }

  const renderCategories = (list: CategoryStat[], kind: 'expense' | 'income', total: number) => (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{kind === 'expense' ? 'Витрати' : 'Доходи'}</Text>
        <Text style={[styles.cardTotal, { color: kind === 'expense' ? '#FF6B6B' : Colors.green }]}>
          {kind === 'expense' ? '−' : '+'}
          {formatMoney(total, currency, { hideCents: true })}
        </Text>
      </View>
      {list.length === 0 ? (
        <Text style={styles.emptyLine}>{kind === 'expense' ? 'Витрат за цей місяць немає' : 'Доходів за цей місяць немає'}</Text>
      ) : (
        list.map((s, i) => (
          <Pressable
            key={s.category}
            onPress={() => openCat(s, kind)}
            style={({ pressed }) => [styles.catRow, i < list.length - 1 && styles.catRowBorder, pressed && styles.pressed]}
          >
            <View style={[styles.catIcon, kind === 'income' && styles.catIconIncome]}>
              <Text style={styles.catEmoji}>{getCategoryIcon(s.category, kind === 'income' ? 1 : -1)}</Text>
            </View>
            <View style={styles.catBody}>
              <View style={styles.catTop}>
                <Text style={styles.catName} numberOfLines={1}>{s.category}</Text>
                <Text style={styles.catAmount}>{formatMoney(s.amount, currency, { hideCents: true })}</Text>
              </View>
              <View style={styles.catBottom}>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${Math.max(2, s.share * 100)}%`, backgroundColor: kind === 'expense' ? Colors.orange : Colors.green },
                    ]}
                  />
                </View>
                <Text style={styles.catMeta}>
                  {Math.round(s.share * 100)}% · {s.count}
                </Text>
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))
      )}
    </View>
  )

  return (
    <View style={styles.root}>
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: pullY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={pull.controlRefreshing} tintColor="transparent" onRefresh={pull.onRefresh} />}
        onScrollEndDrag={pull.onScrollEndDrag}
      >
        <Text style={styles.screenTitle}>Аналітика</Text>

        {/* ‹ Жовтень 2026 › */}
        <View style={styles.monthNav}>
          <Pressable onPress={() => shift(-1)} hitSlop={12} style={styles.navBtn}>
            <Text style={styles.navArrow}>‹</Text>
          </Pressable>
          <Text style={styles.monthLabel}>{periodLabel}</Text>
          <Pressable onPress={() => !isCurrentMonth && shift(1)} hitSlop={12} style={[styles.navBtn, isCurrentMonth && styles.navOff]}>
            <Text style={styles.navArrow}>›</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.orange} size="large" style={{ marginTop: 80 }} />
        ) : (
          <>
            {/* Income and expenses together */}
            <View style={styles.summary}>
              <View style={[styles.sumBox, styles.sumIncome]}>
                <Text style={styles.sumLabel}>Доходи</Text>
                <Text style={[styles.sumValue, { color: Colors.green }]} numberOfLines={1} adjustsFontSizeToFit>
                  +{formatMoney(incomeTotal, currency, { hideCents: true })}
                </Text>
              </View>
              <View style={[styles.sumBox, styles.sumExpense]}>
                <Text style={styles.sumLabel}>Витрати</Text>
                <Text style={[styles.sumValue, { color: '#FF6B6B' }]} numberOfLines={1} adjustsFontSizeToFit>
                  −{formatMoney(expenseTotal, currency, { hideCents: true })}
                </Text>
              </View>
            </View>
            <View style={styles.netRow}>
              <Text style={styles.netLabel}>Залишилось за місяць</Text>
              <Text style={[styles.netValue, { color: net >= 0 ? Colors.white : Colors.orange }]}>
                {net >= 0 ? '+' : '−'}
                {formatMoney(Math.abs(net), currency, { hideCents: true })}
              </Text>
            </View>
            {incomeTotal > 0 && (
              <View style={styles.ratioTrack}>
                <View style={[styles.ratioFill, { width: `${Math.min(100, (expenseTotal / incomeTotal) * 100)}%` }]} />
              </View>
            )}
            {incomeTotal > 0 && (
              <Text style={styles.ratioText}>Витрачено {Math.round((expenseTotal / incomeTotal) * 100)}% доходу</Text>
            )}

            <MonthlyReportCard month={monthId} monthLabel={MONTHS[month.getMonth()]} currency={currency} stats={reportStats} />

            {/* 6 months: income vs expenses, tap a month to open it */}
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>Останні {TREND_MONTHS} місяців</Text>
                <View style={styles.legend}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.green }]} />
                  <Text style={styles.legendText}>Доходи</Text>
                  <View style={[styles.legendDot, { backgroundColor: Colors.orange }]} />
                  <Text style={styles.legendText}>Витрати</Text>
                </View>
              </View>
              <View style={styles.trend}>
                {trend.sums.map(s => {
                  const active = monthKey(s.month) === current
                  return (
                    <Pressable
                      key={monthKey(s.month)}
                      style={[styles.trendCol, active && styles.trendColActive]}
                      onPress={() => {
                        if (active) return
                        triggerLightHaptic()
                        setMonth(s.month)
                      }}
                    >
                      <View style={styles.trendBars}>
                        <View style={[styles.bar, { height: Math.max(3, (s.income / trend.max) * TREND_HEIGHT), backgroundColor: Colors.green }]} />
                        <View style={[styles.bar, { height: Math.max(3, (s.expense / trend.max) * TREND_HEIGHT), backgroundColor: Colors.orange }]} />
                      </View>
                      <Text style={[styles.trendLabel, active && styles.trendLabelActive]}>{MONTHS_SHORT[s.month.getMonth()]}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            {renderCategories(expenseCats, 'expense', expenseTotal)}
            {renderCategories(incomeCats, 'income', incomeTotal)}

            <SubscriptionsCard cards={cards} rates={rates} currency={currency} />

            {/* The year as stories */}
            <Pressable
              onPress={() => {
                triggerLightHaptic()
                setWrappedOpen(true)
              }}
              style={({ pressed }) => [styles.wrapped, pressed && styles.pressed]}
            >
              <LinearGradient colors={['#FF6B00', '#7A1FA2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Text style={styles.wrappedEmoji}>🎁</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.wrappedTitle}>MyWallet Wrapped {defaultWrappedYear()}</Text>
                <Text style={styles.wrappedSub}>Твій рік у цифрах: улюблене місце, найдорожчий день, кава…</Text>
              </View>
              <Text style={styles.wrappedArrow}>›</Text>
            </Pressable>

            {excludedCats.length > 0 && (
              <Text style={styles.footnote}>Не враховуються: {excludedCats.join(', ')} (Налаштування → Категорії поза статистикою)</Text>
            )}
          </>
        )}
        <View style={{ height: 130 }} />
      </Animated.ScrollView>
      <PullToRefreshIndicator scrollY={pullY} refreshing={refreshing} top={SAFE_TOP} />

      <WrappedModal visible={wrappedOpen} onClose={() => setWrappedOpen(false)} />

      <CategoryTransactionsSheet
        view={openCategory}
        cards={cards}
        onClose={() => setOpenCategory(null)}
        onChanged={() => {
          setOpenCategory(null)
          loadData(true)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    paddingTop: SAFE_TOP + 12,
    paddingHorizontal: 16,
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -0.5,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 6,
    marginBottom: 14,
  },
  navBtn: {
    width: 40,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  navOff: {
    opacity: 0.25,
  },
  navArrow: {
    fontSize: 26,
    lineHeight: 28,
    color: Colors.white,
    fontWeight: '600',
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  summary: {
    flexDirection: 'row',
    gap: 10,
  },
  sumBox: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
  },
  sumIncome: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderColor: 'rgba(34, 197, 94, 0.25)',
  },
  sumExpense: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  sumLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white60,
    marginBottom: 4,
  },
  sumValue: {
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 4,
    marginTop: 14,
  },
  netLabel: {
    fontSize: 14,
    color: Colors.white60,
  },
  netValue: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  ratioTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.25)',
    marginTop: 10,
    marginHorizontal: 4,
    overflow: 'hidden',
  },
  ratioFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.orange,
  },
  ratioText: {
    fontSize: 12,
    color: Colors.white40,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  card: {
    marginTop: 16,
    borderRadius: 20,
    padding: 14,
    backgroundColor: '#141416',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.white,
  },
  cardTotal: {
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 6,
  },
  legendText: {
    fontSize: 11,
    color: Colors.white60,
  },
  trend: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
  },
  trendCol: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 6,
    borderRadius: 12,
  },
  trendColActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  trendBars: {
    height: TREND_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  bar: {
    width: 9,
    borderRadius: 4,
  },
  trendLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.white40,
    marginTop: 6,
  },
  trendLabelActive: {
    color: Colors.white,
  },
  emptyLine: {
    fontSize: 14,
    color: Colors.white40,
    paddingVertical: 8,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  catRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  pressed: {
    opacity: 0.6,
  },
  catIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catIconIncome: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  catEmoji: {
    fontSize: 18,
  },
  catBody: {
    flex: 1,
    gap: 6,
  },
  catTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  catName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
  catAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
    fontVariant: ['tabular-nums'],
  },
  catBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  track: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  fill: {
    height: 5,
    borderRadius: 3,
  },
  catMeta: {
    fontSize: 11,
    color: Colors.white40,
    minWidth: 52,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  chevron: {
    fontSize: 20,
    color: Colors.white40,
  },
  wrapped: {
    marginTop: 16,
    borderRadius: 20,
    padding: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wrappedEmoji: {
    fontSize: 32,
  },
  wrappedTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
  },
  wrappedSub: {
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 3,
    lineHeight: 17,
  },
  wrappedArrow: {
    fontSize: 26,
    color: '#fff',
  },
  footnote: {
    fontSize: 12,
    color: Colors.white40,
    marginTop: 14,
    paddingHorizontal: 4,
    lineHeight: 17,
  },
})
