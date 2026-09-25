import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Animated, LayoutAnimation } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Toast from 'react-native-toast-message'
import { Colors, Radius } from '../constants/theme'
import { Transaction } from '../api/transactions'
import { Card } from '../api/cards'
import { TxFilter } from '../hooks/useTransactionFeed'
import { triggerErrorHaptic, triggerLightHaptic, triggerMediumHaptic, triggerSuccessHaptic } from '../utils/haptics'
import { TransactionRowsSkeleton } from './Skeleton'
import BankSyncIndicator from './BankSyncIndicator'
import TxRow, { RowMode, closeSwipedRow, fmtMoney } from './TxRow'
import { pinStateOf, txDisplayTitle } from '../utils/pinned'

const PINNED_COLLAPSED_KEY = 'pinned_collapsed'

function pluralTx(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'транзакція'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'транзакції'
  return 'транзакцій'
}

/** Can this transaction be picked as the refund of an expense? */
function canBeRefund(t: Transaction): boolean {
  return Number(t.amount) > 0 && !t.refund_for && !t.is_transfer && !t.archives
}

const smoothLayout = () =>
  LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity))

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
  /** Long press: pin / unpin */
  onLongPressTx?: (tx: Transaction) => void
  /** Swipe → Видалити (the screen confirms) */
  onDeleteTx?: (tx: Transaction) => void
  /** Links `refund` (income) as a refund of `expense` */
  onLinkRefund?: (expense: Transaction, refund: Transaction) => Promise<void>
  /** Unlinks a refund: it counts as regular income again */
  onUnlinkRefund?: (refund: Transaction) => Promise<void>
  pinned?: Transaction[]
  pinnedCategories?: string[]
  /** Refund picking is controlled by the screen, which shows the floating hint bar */
  refundFor: Transaction | null
  onRefundForChange: (tx: Transaction | null) => void
  /** Refunds of loaded expenses, by expense id: shown nested under the expense */
  refunds?: Record<string, Transaction[]>
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
  onLongPressTx,
  onDeleteTx,
  onLinkRefund,
  onUnlinkRefund,
  pinned = [],
  pinnedCategories = [],
  refundFor,
  onRefundForChange,
  refunds = {},
}: TransactionListProps) {
  // ---- Pinned section: collapsible, remembered between launches ----
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false)
  const chevron = useRef(new Animated.Value(1)).current
  useEffect(() => {
    AsyncStorage.getItem(PINNED_COLLAPSED_KEY).then(v => {
      if (v === '1') {
        setPinnedCollapsed(true)
        chevron.setValue(0)
      }
    })
  }, [])
  const togglePinned = () => {
    triggerLightHaptic()
    closeSwipedRow()
    smoothLayout()
    const next = !pinnedCollapsed
    setPinnedCollapsed(next)
    Animated.timing(chevron, { toValue: next ? 0 : 1, duration: 220, useNativeDriver: true }).start()
    AsyncStorage.setItem(PINNED_COLLAPSED_KEY, next ? '1' : '0').catch(() => {})
  }
  const chevronRotate = chevron.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] })

  // ---- Refund picking (like the web): swipe an expense → "Повернення" → tap the income ----
  const setRefundFor = (tx: Transaction | null) => onRefundForChange(tx)
  const [linking, setLinking] = useState(false)

  // Pickable rows jiggle while picking (one shared native-driven value)
  const wiggle = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!refundFor) {
      wiggle.stopAnimation()
      wiggle.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wiggle, { toValue: 1, duration: 110, useNativeDriver: true }),
        Animated.timing(wiggle, { toValue: -1, duration: 220, useNativeDriver: true }),
        Animated.timing(wiggle, { toValue: 0, duration: 110, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [refundFor])

  const cancelRefundPick = useCallback(() => {
    setRefundFor(null)
  }, [])

  const startRefund = useCallback(
    (tx: Transaction) => {
      if (tx.refund_for) {
        // Already a refund: offer to unlink it
        Alert.alert(
          'Скасувати повернення?',
          `«${txDisplayTitle(tx)}» знову рахуватиметься як звичайний дохід у статистиці.`,
          [
            { text: 'Ні', style: 'cancel' },
            {
              text: 'Скасувати повернення',
              style: 'destructive',
              onPress: async () => {
                try {
                  await onUnlinkRefund?.(tx)
                  triggerSuccessHaptic()
                  Toast.show({ type: 'success', text1: 'Повернення скасовано', text2: 'Транзакція знову враховується як дохід' })
                } catch (e: any) {
                  triggerErrorHaptic()
                  Toast.show({ type: 'error', text1: 'Не вдалося скасувати повернення', text2: e?.message })
                }
              },
            },
          ]
        )
        return
      }
      if (Number(tx.amount) >= 0) {
        triggerErrorHaptic()
        Toast.show({
          type: 'info',
          text1: 'Повернення — тільки для витрат',
          text2: 'Потягніть уліво витрату (−), а потім оберіть дохід, яким її повернули',
          visibilityTime: 4500,
        })
        return
      }
      if (tx.is_transfer) {
        triggerErrorHaptic()
        Toast.show({ type: 'info', text1: 'Переказ не може мати повернення', text2: 'Оберіть звичайну витрату' })
        return
      }
      triggerMediumHaptic()
      setTimeout(() => setRefundFor(tx), 180)
    },
    [onUnlinkRefund]
  )

  const pickRefund = useCallback(
    async (refund: Transaction) => {
      const expense = refundFor
      if (!expense || linking) return
      if (refund.id === expense.id) return
      if (!canBeRefund(refund)) {
        triggerErrorHaptic()
        Toast.show({
          type: 'error',
          text1: refund.refund_for ? 'Це вже повернення іншої витрати' : 'Оберіть дохід (+)',
          text2: refund.refund_for
            ? 'Спершу скасуйте його повернення свайпом уліво'
            : 'Повернення — це гроші, що прийшли назад: від магазину, сервісу чи друга',
          visibilityTime: 4000,
        })
        return
      }
      setLinking(true)
      try {
        await onLinkRefund?.(expense, refund)
        triggerSuccessHaptic()
        setRefundFor(null)
        const refundAmount = Number(refund.amount)
        const left = Math.abs(Number(expense.amount)) - refundAmount
        Toast.show({
          type: 'success',
          text1: 'Повернення прив’язано',
          text2:
            left > 0.005
              ? `«${txDisplayTitle(expense)}»: у статистиці тепер −${fmtMoney(left)}`
              : `«${txDisplayTitle(expense)}» повністю повернено`,
        })
      } catch (e: any) {
        triggerErrorHaptic()
        Toast.show({ type: 'error', text1: 'Не вдалося прив’язати повернення', text2: e?.message })
      } finally {
        setLinking(false)
      }
    },
    [refundFor, linking, onLinkRefund]
  )

  const modeFor = (t: Transaction): RowMode => {
    if (!refundFor) return 'normal'
    if (t.id === refundFor.id) return 'target'
    return canBeRefund(t) ? 'pickable' : 'dimmed'
  }

  const handlePress = useCallback(
    (tx: Transaction) => {
      if (refundFor) pickRefund(tx)
      else onPressTx?.(tx)
    },
    [refundFor, pickRefund, onPressTx]
  )

  const swipeProps = {
    onRefund: onLinkRefund ? startRefund : undefined,
    onDelete: onDeleteTx,
  }

  const cardsById = useMemo(() => {
    const map: Record<string, Card> = {}
    for (const c of cards) map[c.id] = c
    return map
  }, [cards])

  // Pinned ones live only in their section (like the web); they join the list once categorized
  const pinnedTop = useMemo(() => {
    const ids = new Set(pinned.map(t => t.id))
    return pinned.filter(t => !(t.refund_for && ids.has(t.refund_for)))
  }, [pinned])

  // A refund whose expense is loaded shows only under that expense (no duplicate row)
  const regular = useMemo(() => {
    const loaded = new Set(transactions.map(t => t.id))
    return transactions.filter(
      t => pinStateOf(t, pinnedCategories) === 'none' && !(t.refund_for && (loaded.has(t.refund_for) || refunds[t.refund_for]))
    )
  }, [transactions, pinnedCategories, refunds])

  const groups = useMemo(() => {
    const out: DayGroup[] = []
    for (const tx of regular) {
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
        // amount_stat: an expense minus its refunds
        g.totals[cur] = (g.totals[cur] || 0) + Number(tx.amount_stat ?? tx.amount)
      }
    }
    return out
  }, [regular, cardsById])

  const mask = (s: string) => (hidden ? '••••' : s)

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Транзакції</Text>
        <BankSyncIndicator />
      </View>

      {!loading && pinnedTop.length > 0 && (
        <View style={styles.pinnedWrap}>
          <Pressable onPress={togglePinned} style={({ pressed }) => [styles.pinnedHeader, pressed && styles.pinnedHeaderPressed]}>
            <Text style={styles.pinnedEmoji}>📌</Text>
            <View style={styles.pinnedTitleWrap}>
              <Text style={styles.pinnedTitle}>Закріплені</Text>
              {pinnedCollapsed && (
                <Text style={styles.pinnedSub}>
                  {pinnedTop.length} {pluralTx(pinnedTop.length)} · натисніть, щоб розгорнути
                </Text>
              )}
            </View>
            <View style={styles.pinnedBadge}>
              <Text style={styles.pinnedBadgeText}>{pinnedTop.length}</Text>
            </View>
            <Animated.Text style={[styles.pinnedChevron, { transform: [{ rotate: chevronRotate }] }]}>⌄</Animated.Text>
          </Pressable>
          {!pinnedCollapsed &&
            pinnedTop.map((tx, i) => {
              const kids = Number(tx.amount) < 0 ? refunds[tx.id] ?? [] : []
              const lastRow = i === pinnedTop.length - 1
              return (
                <React.Fragment key={`pin-${tx.id}`}>
                  <TxRow
                    tx={tx}
                    card={tx.card_id ? cardsById[tx.card_id] : undefined}
                    hidden={hidden}
                    showDate
                    last={lastRow || kids.length > 0}
                    mode={modeFor(tx)}
                    wiggle={wiggle}
                    wiggleDir={i % 2 ? 1 : -1}
                    onPress={handlePress}
                    onLongPress={onLongPressTx}
                    {...swipeProps}
                  />
                  {kids.map((r, k) => (
                    <TxRow
                      key={`pin-${r.id}`}
                      tx={r}
                      card={r.card_id ? cardsById[r.card_id] : undefined}
                      hidden={hidden}
                      nested
                      showDate
                      last={lastRow && k === kids.length - 1}
                      mode={refundFor ? 'dimmed' : 'normal'}
                      onPress={handlePress}
                      onLongPress={onLongPressTx}
                      {...swipeProps}
                    />
                  ))}
                </React.Fragment>
              )
            })}
        </View>
      )}

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
      ) : regular.length === 0 && (pinned.length === 0 || !hasMore) ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateEmoji}>{error ? '⚠️' : '🧾'}</Text>
          <Text style={styles.stateText}>
            {error
              ? 'Не вдалося завантажити транзакції'
              : pinned.length > 0
                ? 'Усі транзакції — у закріплених'
                : 'Транзакцій поки немає'}
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
                const kids = Number(tx.amount) < 0 ? refunds[tx.id] ?? [] : []
                const lastInDay = i === group.items.length - 1
                return (
                  <React.Fragment key={tx.id}>
                    <TxRow
                      tx={tx}
                      card={tx.card_id ? cardsById[tx.card_id] : undefined}
                      hidden={hidden}
                      last={lastInDay || kids.length > 0}
                      mode={modeFor(tx)}
                      wiggle={wiggle}
                      wiggleDir={i % 2 ? 1 : -1}
                      onPress={handlePress}
                      onLongPress={onLongPressTx}
                      {...swipeProps}
                    />
                    {kids.map((r, k) => (
                      <TxRow
                        key={r.id}
                        tx={r}
                        card={r.card_id ? cardsById[r.card_id] : undefined}
                        hidden={hidden}
                        nested
                        showDate={new Date(r.created_at).toDateString() !== new Date(tx.created_at).toDateString()}
                        last={lastInDay && k === kids.length - 1}
                        mode={refundFor ? 'dimmed' : 'normal'}
                        onPress={handlePress}
                        onLongPress={onLongPressTx}
                        {...swipeProps}
                      />
                    ))}
                  </React.Fragment>
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
  pickBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.45)',
  },
  pickIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickIconText: {
    fontSize: 17,
    color: Colors.white,
    fontWeight: '800',
  },
  pickTextWrap: {
    flex: 1,
  },
  pickTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  pickSub: {
    fontSize: 12,
    color: Colors.white60,
    marginTop: 2,
  },
  pickCancel: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  pickCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white,
  },
  pinnedWrap: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  pinnedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pinnedHeaderPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  pinnedEmoji: {
    fontSize: 15,
  },
  pinnedTitleWrap: {
    flex: 1,
  },
  pinnedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  pinnedSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  pinnedBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 107, 0, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinnedBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.orange,
  },
  pinnedChevron: {
    fontSize: 18,
    lineHeight: 20,
    color: Colors.white60,
    fontWeight: '700',
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
