import React, { useState, useEffect, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator, Platform } from 'react-native'
import { Colors, Typography } from '../constants/theme'
import { fetchBalanceHistory } from '../api/totals'
import { fetchExchangeRates, convertCurrency, formatMoney, RatesMap } from '../utils/currency'
import { LineChart } from 'react-native-gifted-charts'
import { triggerLightHaptic } from '../utils/haptics'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const PERIODS = [
  { key: 'day',   label: 'Дні'    },
  { key: 'week',  label: 'Тижні'  },
  { key: 'month', label: 'Місяці' },
  { key: 'year',  label: 'Роки'   },
]

export default function BalanceHistoryModal({
  visible, onClose, bucket = 'all', sectionTitle, initialCurrency = 'UAH', totals = {}
}: any) {
  const [period, setPeriod] = useState('month')
  const [activeCurrency, setActiveCurrency] = useState(initialCurrency)
  const [referenceDate, setReferenceDate] = useState(() => new Date())
  
  const [changes, setChanges] = useState<any[]>([])
  const [futureChanges, setFutureChanges] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [rates, setRates] = useState<RatesMap | null>(null)

  useEffect(() => {
    fetchExchangeRates().then(setRates)
  }, [])

  useEffect(() => {
    if (visible) {
      setActiveCurrency(initialCurrency)
      setReferenceDate(new Date())
    }
  }, [visible, initialCurrency])

  const dateRange = useMemo(() => {
    const end = new Date(referenceDate)
    const start = new Date(referenceDate)
    
    if (period === 'day') start.setDate(start.getDate() - 30)
    else if (period === 'week') start.setDate(start.getDate() - 12 * 7)
    else if (period === 'year') start.setFullYear(start.getFullYear() - 5)
    else start.setMonth(start.getMonth() - 12)
    
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { start: fmt(start), end: fmt(end) }
  }, [period, referenceDate])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setLoading(true)
    fetchBalanceHistory({ bucket, period, currency: activeCurrency, start: dateRange.start, end: dateRange.end })
      .then(res => {
        if (!cancelled) {
          setChanges(res.changes || [])
          setFutureChanges(res.futureChanges || [])
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [visible, bucket, period, activeCurrency, dateRange])

  const currentBalance = useMemo(() => totals[activeCurrency] ?? 0, [totals, activeCurrency])

  const chartData = useMemo(() => {
    if (!changes.length) return []
    const dateMap: any = {}
    for (const item of changes) {
      if (bucket !== 'all' && item.currency !== activeCurrency) continue
      const convertedIncome = convertCurrency(item.income || 0, item.currency, activeCurrency, rates)
      const convertedExpense = convertCurrency(item.expense || 0, item.currency, activeCurrency, rates)
      if (!dateMap[item.date]) dateMap[item.date] = { income: 0, expense: 0 }
      dateMap[item.date].income += convertedIncome
      dateMap[item.date].expense += convertedExpense
    }

    const windowStart = new Date(dateRange.start)
    const windowEnd = new Date(dateRange.end)
    const allPeriods: string[] = []
    const cursor = new Date(windowStart)
    while (cursor <= windowEnd) {
      let key = ''
      if (period === 'day') key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
      else if (period === 'week') {
        const day = cursor.getDay() === 0 ? 7 : cursor.getDay()
        const monday = new Date(cursor)
        monday.setDate(cursor.getDate() - day + 1)
        key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
      } else if (period === 'year') key = `${cursor.getFullYear()}-01-01`
      else key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01`
      
      allPeriods.push(key)
      if (period === 'day') cursor.setDate(cursor.getDate() + 1)
      else if (period === 'week') cursor.setDate(cursor.getDate() + 7)
      else if (period === 'year') cursor.setFullYear(cursor.getFullYear() + 1)
      else cursor.setMonth(cursor.getMonth() + 1)
    }

    const uniquePeriods = [...new Set(allPeriods)]
    const periodChanges = uniquePeriods.map(p => {
      const dayData = dateMap[p] || { income: 0, expense: 0 }
      return { date: p, change: dayData.income + dayData.expense }
    })

    let futureChangesSum = 0
    if (futureChanges) {
      for (const fc of futureChanges) {
        if (bucket !== 'all' && fc.currency !== activeCurrency) continue
        futureChangesSum += convertCurrency(fc.change || 0, fc.currency, activeCurrency, rates)
      }
    }

    const balanceAtEnd = currentBalance - futureChangesSum
    const sumOfChangesInWindow = periodChanges.reduce((s, p) => s + p.change, 0)
    const startingBalance = balanceAtEnd - sumOfChangesInWindow
    let running = startingBalance

    return periodChanges.map(p => {
      running += p.change
      const d = new Date(p.date)
      let label = ''
      if (period === 'day') label = `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}`
      else if (period === 'year') label = `${d.getFullYear()}`
      else label = `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}`
      
      return { value: running, label, date: p.date, change: p.change }
    })
  }, [changes, futureChanges, currentBalance, activeCurrency, rates, period, dateRange])

  const stats = useMemo(() => {
    if (!chartData.length) return null
    const first = chartData[0].value
    const last  = chartData[chartData.length - 1].value
    const diff  = last - first
    const pct   = first !== 0 ? (diff / Math.abs(first)) * 100 : 0
    return { first, last, diff, pct }
  }, [chartData])

  const trend = !stats ? 'flat' : stats.diff > 0 ? 'up' : stats.diff < 0 ? 'down' : 'flat'

  return (
    <SheetModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{sectionTitle || 'Історія балансу'}</Text>
          <GlassPressable onPress={() => { triggerLightHaptic(); onClose(); }} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </GlassPressable>
        </View>

        <View style={styles.tabs}>
          {PERIODS.map(p => {
            const isActive = period === p.key
            return (
              <GlassPressable
                key={p.key}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                onPress={() => { triggerLightHaptic(); setPeriod(p.key); setReferenceDate(new Date()) }}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{p.label}</Text>
              </GlassPressable>
            )
          })}
        </View>

        <View style={styles.stats}>
          <Text style={styles.balance}>{formatMoney(currentBalance, activeCurrency)}</Text>
          {stats && (
            <View style={[styles.badge, trend === 'up' ? styles.badgeUp : trend === 'down' ? styles.badgeDown : styles.badgeFlat]}>
              <Text style={[styles.badgeText, trend === 'up' ? {color: '#10b981'} : trend === 'down' ? {color: '#ef4444'} : {color: '#9ca3af'}]}>
                {stats.diff >= 0 ? '+' : ''}{formatMoney(stats.diff, activeCurrency, { hideCents: true })} ({stats.pct > 0 ? '+' : ''}{stats.pct.toFixed(1)}%)
              </Text>
            </View>
          )}
        </View>

        <View style={styles.chartContainer}>
          {loading ? (
            <ActivityIndicator size="large" color={Colors.orange} style={{ marginTop: 60 }} />
          ) : chartData.length > 0 ? (
            <LineChart
              data={chartData}
              width={SCREEN_WIDTH - 60}
              height={220}
              spacing={Math.max(20, (SCREEN_WIDTH - 80) / chartData.length)}
              initialSpacing={10}
              color={Colors.orange}
              thickness={3}
              startFillColor="rgba(255, 107, 0, 0.3)"
              endFillColor="rgba(255, 107, 0, 0.01)"
              startOpacity={0.9}
              endOpacity={0.2}
              noOfSections={4}
              yAxisTextStyle={{ color: Colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: Colors.textMuted, fontSize: 10 }}
              rulesColor="rgba(255,255,255,0.05)"
              yAxisColor="transparent"
              xAxisColor="rgba(255,255,255,0.1)"
              pointerConfig={{
                pointerStripHeight: 160,
                pointerStripColor: 'rgba(255,255,255,0.2)',
                pointerStripWidth: 2,
                pointerColor: Colors.white,
                radius: 4,
                pointerLabelWidth: 100,
                pointerLabelHeight: 90,
                activatePointersOnLongPress: true,
                autoAdjustPointerLabelPosition: true,
                pointerLabelComponent: (items: any) => {
                  const item = items[0]
                  triggerLightHaptic()
                  return (
                    <View style={styles.tooltip}>
                      <Text style={styles.tooltipDate}>{item.label}</Text>
                      <Text style={styles.tooltipValue}>{formatMoney(item.value, activeCurrency, { hideCents: true })}</Text>
                    </View>
                  )
                },
              }}
              hideDataPoints
              isAnimated
              areaChart
            />
          ) : (
            <Text style={styles.emptyText}>Немає даних</Text>
          )}
        </View>
      </View>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  container: {
    paddingHorizontal: 20, paddingTop: 4,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { ...Typography.h3, color: Colors.white },
  closeBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20 },
  closeText: { color: Colors.white80, fontSize: 14, fontWeight: 'bold' },
  tabs: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 4, marginBottom: 20 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: 'rgba(255,107,0,0.15)' },
  tabText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: Colors.orange, fontWeight: 'bold' },
  stats: { marginBottom: 20, alignItems: 'center' },
  balance: { ...Typography.h1, color: Colors.white, marginBottom: 8 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  badgeUp: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  badgeDown: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
  badgeFlat: { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  badgeText: { fontSize: 13, fontWeight: '700' },
  chartContainer: { height: 250, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: Colors.textMuted, fontSize: 14 },
  tooltip: {
    backgroundColor: 'rgba(20,20,20,0.9)',
    padding: 8, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center'
  },
  tooltipDate: { color: Colors.textMuted, fontSize: 10, marginBottom: 4 },
  tooltipValue: { color: Colors.white, fontSize: 13, fontWeight: 'bold' },
})
