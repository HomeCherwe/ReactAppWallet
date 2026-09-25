import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Platform, Dimensions
} from "react-native"
import { checkForAppUpdate } from '../utils/appUpdate'
import { Colors, Typography, Radius } from "../constants/theme"
import { listTransactions, Transaction } from "../api/transactions"
import { listCards, Card } from "../api/cards"
import { fetchTotalsByBucket, TotalsData } from "../api/totals"
import { fmtAmount } from "../utils/format"
import Toast from "react-native-toast-message"
import { GlassPressable } from "../components/LiquidGlass"
import { useExcludedCardIds } from "../utils/cardExclusion"

const { width: SCREEN_W } = Dimensions.get("window")

const MONTHS_UA = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"
]

const CATEGORY_COLORS = [
  "#FF6B00", "#FF8C38", "#E55A00", "#FFB347", "#FF4500",
  "#FF69B4", "#FFD700", "#32CD32", "#00CED1", "#9370DB",
  "#FF6347", "#40E0D0", "#EE82EE", "#F0E68C", "#87CEEB",
]

type CategoryStat = {
  category: string
  amount: number
  count: number
  color: string
  percent: number
}

type MonthOption = { label: string; year: number; month: number }

function generateMonthOptions(): MonthOption[] {
  const options: MonthOption[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    options.push({
      label: `${MONTHS_UA[d.getMonth()]} ${d.getFullYear()}`,
      year: d.getFullYear(),
      month: d.getMonth() + 1
    })
  }
  return options
}

export default function AnalyticsScreen() {
  const months = useMemo(generateMonthOptions, [])
  const [selectedMonth, setSelectedMonth] = useState(months[0])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [totals, setTotals] = useState<TotalsData>({ cash: {}, cards: {}, savings: {} })
  const [loading, setLoading] = useState(true)
  const [txType, setTxType] = useState<"expense" | "income">("expense")

  const [refreshing, setRefreshing] = useState(false)

  const loadData = useCallback(async (pulled = false) => {
    if (!pulled) setLoading(true)
    try {
      const start = new Date(selectedMonth.year, selectedMonth.month - 1, 1)
      const end = new Date(selectedMonth.year, selectedMonth.month, 0)
      const startDate = start.toISOString().split("T")[0]
      const endDate = end.toISOString().split("T")[0]

      const [txs, cardsData, totalsData] = await Promise.all([
        listTransactions({
          startDate,
          endDate,
          
        }).catch(() => []),
        listCards().catch(() => []),
        fetchTotalsByBucket().catch(() => ({ cash: {}, cards: {}, savings: {} })),
      ])

      setTransactions(txs)
      setCards(cardsData)
      setTotals(totalsData)
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "Помилка завантаження",
        text2: e?.message || "Не вдалося отримати аналітику",
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedMonth])

  useEffect(() => {
    loadData()
  }, [loadData])

  const excludedCardIds = useExcludedCardIds(cards)

  const filteredTxs = useMemo(() => {
    const excluded = new Set(excludedCardIds)
    return transactions.filter(t => {
      // Transfers, archived, "not in stats" and excluded cards don't count
      if (t.is_transfer || t.archives || t.exclude_from_stats) return false
      if (t.card_id && excluded.has(t.card_id)) return false
      const amt = Number(t.amount || 0)
      return txType === "expense" ? amt < 0 : amt > 0
    })
  }, [transactions, txType, excludedCardIds])

  const totalForPeriod = useMemo(() => {
    return filteredTxs.reduce((acc, t) => acc + Math.abs(Number(t.amount || 0)), 0)
  }, [filteredTxs])

  const categoryStats = useMemo<CategoryStat[]>(() => {
    const map: Record<string, { amount: number; count: number }> = {}
    for (const tx of filteredTxs) {
      const cat = tx.category || "Інше"
      const amt = Math.abs(Number(tx.amount || 0))
      if (!map[cat]) map[cat] = { amount: 0, count: 0 }
      map[cat].amount += amt
      map[cat].count += 1
    }

    const arr = Object.entries(map).map(([category, { amount, count }], idx) => ({
      category,
      amount,
      count,
      color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
      percent: totalForPeriod > 0 ? (amount / totalForPeriod) * 100 : 0,
    }))

    return arr.sort((a, b) => b.amount - a.amount)
  }, [filteredTxs, totalForPeriod])

  const chartWidth = SCREEN_W - 40

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.orange} size="large" />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={Colors.orange}
          onRefresh={() => {
            setRefreshing(true)
            loadData(true)
            checkForAppUpdate()
          }}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Аналітика</Text>
        <Text style={styles.headerSub}>{selectedMonth.label}</Text>
      </View>

      {/* Month Selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
        {months.map((m) => (
          <GlassPressable
            key={`${m.year}-${m.month}`}
            style={[
              styles.monthPill,
              selectedMonth.month === m.month && selectedMonth.year === m.year && styles.monthPillActive
            ]}
            onPress={() => setSelectedMonth(m)}
          >
            <Text style={[
              styles.monthPillText,
              selectedMonth.month === m.month && styles.monthPillTextActive
            ]}>
              {m.label}
            </Text>
          </GlassPressable>
        ))}
      </ScrollView>

      {/* Type Switcher */}
      <View style={styles.typeSwitcher}>
        <GlassPressable
          style={[styles.typeBtn, txType === "expense" && styles.typeBtnExpense]}
          onPress={() => setTxType("expense")}
        >
          <Text style={[styles.typeBtnText, txType === "expense" && { color: Colors.red }]}>📉 Витрати</Text>
        </GlassPressable>
        <GlassPressable
          style={[styles.typeBtn, txType === "income" && styles.typeBtnIncome]}
          onPress={() => setTxType("income")}
        >
          <Text style={[styles.typeBtnText, txType === "income" && { color: Colors.green }]}>📈 Доходи</Text>
        </GlassPressable>
      </View>

      {/* Total */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>{txType === "expense" ? "Всього витрат" : "Всього доходів"}</Text>
        <Text style={[styles.totalValue, { color: txType === "expense" ? Colors.red : Colors.green }]}>
          {fmtAmount(totalForPeriod)}
        </Text>
        <Text style={styles.totalSub}>{categoryStats.length} категорій • {filteredTxs.length} транзакцій</Text>
      </View>

      {/* Bar Chart */}
      {categoryStats.length > 0 && (
        <View style={styles.chartSection}>
          <Text style={styles.chartTitle}>Витрати по категоріях</Text>
          {categoryStats.map((stat) => (
            <View key={stat.category} style={styles.barRow}>
              <View style={styles.barMeta}>
                <View style={[styles.barDot, { backgroundColor: stat.color }]} />
                <Text style={styles.barLabel} numberOfLines={1}>{stat.category}</Text>
                <Text style={styles.barPercent}>{stat.percent.toFixed(1)}%</Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: Math.max(4, (stat.percent / 100) * (chartWidth - 40)),
                      backgroundColor: stat.color
                    }
                  ]}
                />
              </View>
              <Text style={styles.barAmount}>{fmtAmount(stat.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Empty */}
      {categoryStats.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyTitle}>Немає даних</Text>
          <Text style={styles.emptyText}>Транзакцій за цей місяць не знайдено</Text>
        </View>
      )}

      {/* Totals Summary */}
      <View style={styles.totalsSection}>
        <Text style={styles.chartTitle}>Загальні залишки</Text>
        {Object.entries(totals).map(([bucket, currencies]) => (
          <View key={bucket} style={styles.bucketCard}>
            <Text style={styles.bucketName}>
              {bucket === "cash" ? "💵 Готівка" : bucket === "cards" ? "💳 Картки" : "💰 Заощадження"}
            </Text>
            {Object.entries(currencies as Record<string, number>).map(([currency, amount]) => (
              <View key={currency} style={styles.bucketRow}>
                <Text style={styles.bucketCurrency}>{currency}</Text>
                <Text style={[styles.bucketAmount, { color: amount < 0 ? Colors.red : Colors.green }]}>
                  {fmtAmount(Math.abs(amount))}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={{ height: 120 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
  content: { paddingBottom: 130 },
  header: { paddingHorizontal: 20, paddingTop: Platform.OS === "ios" ? 60 : 40, paddingBottom: 16 },
  headerTitle: { ...Typography.h2, color: Colors.white },
  headerSub: { ...Typography.caption, color: Colors.textSub },
  monthScroll: { paddingHorizontal: 20, marginBottom: 16 },
  monthPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.pill, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", marginRight: 10 },
  monthPillActive: { backgroundColor: "rgba(255,107,0,0.2)", borderColor: "rgba(255,107,0,0.5)" },
  monthPillText: { color: Colors.textSub, fontSize: 13, fontWeight: "600" },
  monthPillTextActive: { color: Colors.orange, fontWeight: "700" },
  typeSwitcher: { flexDirection: "row", marginHorizontal: 20, marginBottom: 16, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: Radius.lg, padding: 4, gap: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  typeBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: Radius.md },
  typeBtnExpense: { backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" },
  typeBtnIncome: { backgroundColor: "rgba(34,197,94,0.15)", borderWidth: 1, borderColor: "rgba(34,197,94,0.3)" },
  typeBtnText: { color: Colors.textSub, fontWeight: "600", fontSize: 14 },
  totalCard: { marginHorizontal: 20, marginBottom: 20, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center" },
  totalLabel: { ...Typography.caption, color: Colors.textSub, marginBottom: 8 },
  totalValue: { fontSize: 36, fontWeight: "800", letterSpacing: -1 },
  totalSub: { ...Typography.caption, color: Colors.textMuted, marginTop: 8 },
  chartSection: { marginHorizontal: 20, marginBottom: 20, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  chartTitle: { ...Typography.h3, color: Colors.white, marginBottom: 16 },
  barRow: { marginBottom: 16 },
  barMeta: { flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 8 },
  barDot: { width: 10, height: 10, borderRadius: 5 },
  barLabel: { flex: 1, color: Colors.white, fontSize: 13, fontWeight: "600" },
  barPercent: { color: Colors.textSub, fontSize: 12 },
  barTrack: { height: 8, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 4, marginBottom: 4 },
  barFill: { height: 8, borderRadius: 4 },
  barAmount: { ...Typography.caption, color: Colors.textSub },
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { ...Typography.h3, color: Colors.white, marginBottom: 8 },
  emptyText: { ...Typography.body, color: Colors.textSub },
  totalsSection: { marginHorizontal: 20 },
  bucketCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  bucketName: { ...Typography.body, color: Colors.white, fontWeight: "700", marginBottom: 12 },
  bucketRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  bucketCurrency: { ...Typography.body, color: Colors.textSub },
  bucketAmount: { ...Typography.body, fontWeight: "700" },
})