import React, { useState, useEffect, useMemo } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native'
import { Colors } from '../constants/theme'
import { fetchBalanceHistory } from '../api/totals'
import { fetchExchangeRates, convertCurrency, formatMoney, RatesMap } from '../utils/currency'
import { LineChart } from 'react-native-gifted-charts'
import { triggerLightHaptic } from '../utils/haptics'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'

type Period = 'day' | 'week' | 'month' | 'year'

const PERIODS: { key: Period; label: string; span: string }[] = [
  { key: 'day', label: 'Дні', span: 'за 30 днів' },
  { key: 'week', label: 'Тижні', span: 'за 12 тижнів' },
  { key: 'month', label: 'Місяці', span: 'за 12 місяців' },
  { key: 'year', label: 'Роки', span: 'за 5 років' },
]

const Y_LABEL_WIDTH = 50
const CHART_HEIGHT = 200
const SECTIONS = 4
// At most this many dates under the chart, so they never run into each other
const MAX_X_LABELS = 5

// Home counts USDT as dollars
const normCurrency = (c: string) => (String(c || 'UAH').toUpperCase() === 'USDT' ? 'USD' : String(c || 'UAH').toUpperCase())

const pad2 = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

// 1, 2, 2.5, 5 × 10^k at or above the value
function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p
  return 10 * p
}

// 123456 → "123 тис.", 1500000 → "1,5 млн"
function compact(v: number): string {
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (a >= 1e6) return `${sign}${(a / 1e6).toLocaleString('uk-UA', { maximumFractionDigits: 1 })} млн`
  if (a >= 1e4) return `${sign}${Math.round(a / 1e3).toLocaleString('uk-UA')} тис.`
  if (a >= 1e3) return `${sign}${(a / 1e3).toLocaleString('uk-UA', { maximumFractionDigits: 1 })} тис.`
  return `${sign}${Math.round(a)}`
}

function axisLabel(d: Date, period: Period): string {
  if (period === 'year') return String(d.getFullYear())
  if (period === 'month') return d.toLocaleDateString('uk-UA', { month: 'short' }).replace('.', '')
  return `${d.getDate()}.${pad2(d.getMonth() + 1)}`
}

function fullLabel(d: Date, period: Period): string {
  if (period === 'year') return String(d.getFullYear())
  if (period === 'month') return d.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })
  if (period === 'week') return `тиждень з ${d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}`
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })
}

export default function BalanceHistoryModal({
  visible, onClose, bucket = 'all', sectionTitle, initialCurrency = 'UAH', totals = {}
}: any) {
  const [period, setPeriod] = useState<Period>('month')
  const [activeCurrency, setActiveCurrency] = useState(initialCurrency)
  const [changes, setChanges] = useState<any[]>([])
  const [futureChanges, setFutureChanges] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [rates, setRates] = useState<RatesMap | null>(null)
  const [chartWidth, setChartWidth] = useState(0)

  useEffect(() => {
    fetchExchangeRates().then(setRates)
  }, [])

  useEffect(() => {
    if (visible) setActiveCurrency(initialCurrency)
  }, [visible, initialCurrency])

  const dateRange = useMemo(() => {
    const end = new Date()
    const start = new Date(end)
    if (period === 'day') start.setDate(start.getDate() - 30)
    else if (period === 'week') start.setDate(start.getDate() - 12 * 7)
    else if (period === 'year') start.setFullYear(start.getFullYear() - 5)
    else start.setMonth(start.getMonth() - 12)
    return { start: keyOf(start), end: keyOf(end) }
  }, [period, visible])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setLoading(true)
    fetchBalanceHistory({ bucket, period, currency: activeCurrency, start: dateRange.start, end: dateRange.end })
      .then(res => {
        if (cancelled) return
        setChanges(res.changes || [])
        setFutureChanges(res.futureChanges || [])
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [visible, bucket, period, activeCurrency, dateRange])

  // The balance Home shows for this section: every currency in it, in the chosen one.
  // (totals is { cash, cards, savings } → currency → amount)
  const currentBalance = useMemo(() => {
    const sections = bucket === 'all' ? [totals.cash, totals.cards, totals.savings] : [totals[bucket]]
    let sum = 0
    for (const section of sections) {
      for (const [cur, amount] of Object.entries(section || {})) {
        sum += convertCurrency(Number(amount) || 0, normCurrency(cur), activeCurrency, rates)
      }
    }
    return sum
  }, [totals, bucket, activeCurrency, rates])

  // Balance at the end of each day / week / month / year of the window
  const points = useMemo(() => {
    if (!changes.length) return []
    const byDate: Record<string, number> = {}
    // All of the section's currencies, like the balance it ends at
    for (const item of changes) {
      const income = convertCurrency(item.income || 0, normCurrency(item.currency), activeCurrency, rates)
      const expense = convertCurrency(item.expense || 0, normCurrency(item.currency), activeCurrency, rates)
      byDate[item.date] = (byDate[item.date] || 0) + income + expense
    }

    const keys: string[] = []
    const cursor = new Date(dateRange.start)
    const end = new Date(dateRange.end)
    while (cursor <= end) {
      let key: string
      if (period === 'day') key = keyOf(cursor)
      else if (period === 'week') {
        const monday = new Date(cursor)
        monday.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7))
        key = keyOf(monday)
      } else if (period === 'year') key = `${cursor.getFullYear()}-01-01`
      else key = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}-01`
      if (keys[keys.length - 1] !== key) keys.push(key)
      if (period === 'day') cursor.setDate(cursor.getDate() + 1)
      else if (period === 'week') cursor.setDate(cursor.getDate() + 7)
      else if (period === 'year') cursor.setFullYear(cursor.getFullYear() + 1)
      else cursor.setMonth(cursor.getMonth() + 1)
    }

    let future = 0
    for (const fc of futureChanges || []) {
      future += convertCurrency(fc.change || 0, normCurrency(fc.currency), activeCurrency, rates)
    }
    const deltas = keys.map(k => byDate[k] || 0)
    let running = currentBalance - future - deltas.reduce((s, x) => s + x, 0)
    return keys.map((k, i) => {
      running += deltas[i]
      return { date: new Date(k), balance: running }
    })
  }, [changes, futureChanges, currentBalance, activeCurrency, rates, period, dateRange, bucket])

  // The y axis spans the balances (not from zero, which flattens the line); round steps
  const axis = useMemo(() => {
    if (!points.length) return null
    const values = points.map(p => p.balance)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || Math.max(Math.abs(max) * 0.1, 10)
    let step = niceStep((range * 1.25) / SECTIONS)
    let base = Math.floor((min - range * 0.08) / step) * step
    while (base + step * SECTIONS < max) {
      step = niceStep(step * 1.01)
      base = Math.floor((min - range * 0.08) / step) * step
    }
    return { base, step }
  }, [points])

  const chartData = useMemo(() => {
    if (!axis) return []
    const last = points.length - 1
    const every = Math.max(1, Math.ceil(last / (MAX_X_LABELS - 1)))
    return points.map((p, i) => {
      // Every few points plus the last one; a regular one too close to the last steps aside
      const show = i === last || (i % every === 0 && last - i >= every * 0.6)
      return {
        value: p.balance - axis.base,
        label: show ? axisLabel(p.date, period) : '',
        balance: p.balance,
        when: fullLabel(p.date, period),
      }
    })
  }, [points, axis, period])

  const stats = useMemo(() => {
    if (points.length < 2) return null
    const first = points[0].balance
    const last = points[points.length - 1].balance
    const diff = last - first
    return { diff, pct: first !== 0 ? (diff / Math.abs(first)) * 100 : 0 }
  }, [points])

  const trend = !stats ? 'flat' : stats.diff > 0.5 ? 'up' : stats.diff < -0.5 ? 'down' : 'flat'
  const trendColor = trend === 'up' ? Colors.green : trend === 'down' ? '#FF6B6B' : Colors.white60
  const periodInfo = PERIODS.find(p => p.key === period)!
  const plotWidth = Math.max(0, chartWidth - Y_LABEL_WIDTH - 12)

  return (
    <SheetModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{sectionTitle || 'Історія балансу'}</Text>
          <GlassPressable onPress={() => { triggerLightHaptic(); onClose() }} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </GlassPressable>
        </View>

        <View style={styles.summary}>
          <Text style={styles.balance} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(currentBalance, activeCurrency)}
          </Text>
          {stats && (
            <View style={styles.changeRow}>
              <View style={[styles.badge, { backgroundColor: trend === 'flat' ? 'rgba(255,255,255,0.08)' : `${trendColor}22` }]}>
                <Text style={[styles.badgeText, { color: trendColor }]}>
                  {stats.diff >= 0 ? '+' : '−'}
                  {formatMoney(Math.abs(stats.diff), activeCurrency, { hideCents: true })}
                  {Math.abs(stats.pct) >= 0.1 ? `  ${stats.pct > 0 ? '+' : '−'}${Math.abs(stats.pct).toFixed(1)}%` : ''}
                </Text>
              </View>
              <Text style={styles.span}>{periodInfo.span}</Text>
            </View>
          )}
        </View>

        <View style={styles.tabs}>
          {PERIODS.map(p => {
            const active = period === p.key
            return (
              <Pressable
                key={p.key}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => {
                  if (active) return
                  triggerLightHaptic()
                  setPeriod(p.key)
                }}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{p.label}</Text>
              </Pressable>
            )
          })}
        </View>

        <View style={styles.chartCard} onLayout={e => setChartWidth(e.nativeEvent.layout.width)}>
          {loading ? (
            <ActivityIndicator size="large" color={Colors.orange} />
          ) : chartData.length > 1 && axis && plotWidth > 0 ? (
            <LineChart
              key={`${period}-${activeCurrency}-${chartData.length}`}
              data={chartData}
              width={plotWidth}
              height={CHART_HEIGHT}
              adjustToWidth
              disableScroll
              initialSpacing={6}
              endSpacing={6}
              maxValue={axis.step * SECTIONS}
              stepValue={axis.step}
              noOfSections={SECTIONS}
              yAxisLabelWidth={Y_LABEL_WIDTH}
              formatYLabel={(label: string) => compact(Number(label) + axis.base)}
              yAxisTextStyle={styles.axisText}
              xAxisLabelTextStyle={[styles.axisText, styles.xLabel]}
              xAxisLabelsHeight={18}
              color={Colors.orange}
              thickness={2.5}
              curved
              areaChart
              startFillColor="rgba(255, 107, 0, 0.32)"
              endFillColor="rgba(255, 107, 0, 0.02)"
              startOpacity={0.9}
              endOpacity={0.1}
              hideDataPoints
              rulesType="solid"
              rulesColor="rgba(255,255,255,0.06)"
              yAxisColor="transparent"
              xAxisColor="rgba(255,255,255,0.12)"
              pointerConfig={{
                pointerStripHeight: CHART_HEIGHT,
                pointerStripColor: 'rgba(255,255,255,0.25)',
                pointerStripWidth: 1.5,
                pointerColor: Colors.white,
                radius: 5,
                pointerLabelWidth: 130,
                pointerLabelHeight: 56,
                activatePointersOnLongPress: true,
                autoAdjustPointerLabelPosition: true,
                pointerLabelComponent: (items: any[]) => {
                  const item = items[0]
                  return (
                    <View style={styles.tooltip}>
                      <Text style={styles.tooltipDate} numberOfLines={1}>{item.when}</Text>
                      <Text style={styles.tooltipValue} numberOfLines={1}>
                        {formatMoney(item.balance, activeCurrency, { hideCents: true })}
                      </Text>
                    </View>
                  )
                },
              }}
            />
          ) : (
            <Text style={styles.emptyText}>Немає даних за цей період</Text>
          )}
        </View>
        <Text style={styles.hint}>Утримуйте палець на графіку, щоб побачити баланс на дату</Text>
      </View>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: 'rgba(14, 14, 18, 0.97)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    paddingTop: 8,
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.white,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: Colors.white80,
    fontSize: 15,
  },
  summary: {
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  balance: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  span: {
    fontSize: 13,
    color: Colors.white40,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 3,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  tabText: {
    fontSize: 13,
    color: Colors.white60,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.white,
  },
  chartCard: {
    height: CHART_HEIGHT + 48,
    borderRadius: 20,
    paddingTop: 14,
    paddingRight: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  axisText: {
    color: Colors.white40,
    fontSize: 10,
  },
  xLabel: {
    width: 44,
    textAlign: 'center',
  },
  emptyText: {
    color: Colors.white40,
    fontSize: 14,
  },
  hint: {
    fontSize: 12,
    color: Colors.white40,
    textAlign: 'center',
    marginTop: 10,
  },
  tooltip: {
    backgroundColor: 'rgba(28,28,32,0.95)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  tooltipDate: {
    color: Colors.white60,
    fontSize: 11,
    marginBottom: 2,
  },
  tooltipValue: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
})
