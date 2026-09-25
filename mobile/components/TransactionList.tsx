import React, { useMemo } from 'react'
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native'
import { Colors, Radius } from '../constants/theme'
import { Transaction } from '../api/transactions'
import { Card } from '../api/cards'
import { TxFilter } from '../hooks/useTransactionFeed'
import { triggerLightHaptic } from '../utils/haptics'
import { getCategoryIcon } from '../utils/categoryIcon'
import { TransactionRowsSkeleton } from './Skeleton'
import BankSyncIndicator from './BankSyncIndicator'

const CURRENCY_SYMBOLS: Record<string, string> = { UAH: '₴', USD: '$', EUR: '€', GBP: '£', PLN: 'zł' }

function fmtMoney(amount: number, currency?: string): string {
  const abs = Math.abs(amount).toLocaleString('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (!currency) return abs
  return `${abs} ${CURRENCY_SYMBOLS[currency] ?? currency}`
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(d: Date): string {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (dayKey(d) === dayKey(now)) return 'Сьогодні'
  if (dayKey(d) === dayKey(yesterday)) return 'Вчора'
  return d.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  })
}

interface DayGroup {
  key: string
  label: string
  items: Transaction[]
  /** Net sum per currency for the day */
  totals: Record<string, number>
}

const FILTERS: { id: TxFilter; label: string }[] = [
  { id: 'all', label: 'Всі' },
  { id: 'expense', label: 'Витрати' },
  { id: 'income', label: 'Доходи' },
]

interface TransactionListProps {
  transactions: Transaction[]
  cards?: Card[]
  loading?: boolean
  loadingMore?: boolean
  hasMore?: boolean
  error?: boolean
  hidden?: boolean
  filter?: TxFilter
  onFilterChange?: (filter: TxFilter) => void
  onRetry?: () => void
  onPressTx?: (tx: Transaction) => void
}

export default React.memo(TransactionList)

function TransactionList({
  transactions,
  cards = [],
  loading,
  loadingMore,
  hasMore,
  error,
  hidden,
  filter = 'all',
  onFilterChange,
  onRetry,
  onPressTx,
}: TransactionListProps) {
  const cardsById = useMemo(() => {
    const map: Record<string, Card> = {}
    for (const c of cards) map[c.id] = c
    return map
  }, [cards])

  const groups = useMemo(() => {
    const out: DayGroup[] = []
    for (const tx of transactions) {
      const d = new Date(tx.created_at)
      const key = dayKey(d)
      let g = out[out.length - 1]
      if (!g || g.key !== key) {
        g = { key, label: dayLabel(d), items: [], totals: {} }
        out.push(g)
      }
      g.items.push(tx)
      if (!tx.exclude_from_stats) {
        const cur = tx.currency || (tx.card_id && cardsById[tx.card_id]?.currency) || ''
        g.totals[cur] = (g.totals[cur] || 0) + Number(tx.amount)
      }
    }
    return out
  }, [transactions, cardsById])

  const mask = (s: string) => (hidden ? '••••' : s)

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Транзакції</Text>
        <BankSyncIndicator />
      </View>

      {onFilterChange && (
        <View style={styles.segment}>
          {FILTERS.map(f => {
            const active = f.id === filter
            return (
              <Pressable
                key={f.id}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => {
                  if (!active) triggerLightHaptic()
                  onFilterChange(f.id)
                }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{f.label}</Text>
              </Pressable>
            )
          })}
        </View>
      )}

      {loading ? (
        <TransactionRowsSkeleton />
      ) : transactions.length === 0 ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateEmoji}>{error ? '⚠️' : '🧾'}</Text>
          <Text style={styles.stateText}>
            {error ? 'Не вдалося завантажити транзакції' : 'Транзакцій поки немає'}
          </Text>
          {error && onRetry && (
            <Pressable onPress={onRetry} style={styles.retryBtn}>
              <Text style={styles.retryText}>Спробувати ще раз</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <>
          {groups.map(group => (
            <View key={group.key}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>{group.label}</Text>
                <Text style={styles.dayTotal}>
                  {mask(
                    Object.entries(group.totals)
                      .filter(([, v]) => v !== 0)
                      .map(([cur, v]) => `${v > 0 ? '+' : '−'}${fmtMoney(v, cur)}`)
                      .join('  ')
                  )}
                </Text>
              </View>

              {group.items.map((tx, i) => {
                const amount = Number(tx.amount)
                const isIncome = amount > 0
                const card = tx.card_id ? cardsById[tx.card_id] : undefined
                const currency = tx.currency || card?.currency
                const title = tx.note || tx.merchant_name || tx.category || (isIncome ? 'Дохід' : 'Витрата')
                const time = new Date(tx.created_at).toLocaleTimeString('uk-UA', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
                const meta = [tx.category && tx.category !== title ? tx.category : null, card?.name, time]
                  .filter(Boolean)
                  .join(' · ')

                return (
                  <Pressable
                    key={tx.id}
                    onPress={() => onPressTx?.(tx)}
                    style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                  >
                    <View style={[styles.iconWrap, isIncome && styles.iconWrapGreen]}>
                      <Text style={styles.iconEmoji}>{getCategoryIcon(tx.category ?? null, amount)}</Text>
                    </View>

                    <View style={[styles.info, i < group.items.length - 1 && styles.infoBorder]}>
                      <View style={styles.infoText}>
                        <Text style={styles.txTitle} numberOfLines={1}>{title}</Text>
                        <Text style={styles.txMeta} numberOfLines={1}>{meta}</Text>
                      </View>
                      <Text
                        style={[
                          styles.amount,
                          isIncome && styles.amountGreen,
                          tx.exclude_from_stats && styles.amountMuted,
                        ]}
                      >
                        {mask(`${isIncome ? '+' : '−'}${fmtMoney(amount, currency)}`)}
                      </Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          ))}

          <View style={styles.footer}>
            {loadingMore ? (
              <ActivityIndicator color={Colors.orange} />
            ) : error && onRetry ? (
              <Pressable onPress={onRetry} style={styles.retryBtn}>
                <Text style={styles.retryText}>Не вдалося завантажити · Повторити</Text>
              </Pressable>
            ) : !hasMore ? (
              <Text style={styles.footerText}>Це всі транзакції</Text>
            ) : null}
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // Solid surface (no glass): a long list over glass re-tints as content moves behind it
  card: {
    backgroundColor: '#141416',
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    overflow: 'hidden',
    paddingBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: -0.3,
  },
  segment: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 6,
    padding: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.18)',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSub,
  },
  segmentTextActive: {
    color: Colors.orange,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
    gap: 12,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white60,
  },
  dayTotal: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    gap: 12,
  },
  itemPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapGreen: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  iconEmoji: {
    fontSize: 19,
  },
  info: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 16,
    gap: 10,
  },
  infoBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  infoText: {
    flex: 1,
  },
  txTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
  txMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
    fontVariant: ['tabular-nums'],
  },
  amountGreen: {
    color: Colors.green,
  },
  amountMuted: {
    opacity: 0.45,
  },
  stateWrap: {
    paddingVertical: 36,
    alignItems: 'center',
    gap: 8,
  },
  stateEmoji: {
    fontSize: 28,
  },
  stateText: {
    fontSize: 14,
    color: Colors.textSub,
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.orange,
  },
  footer: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
})
