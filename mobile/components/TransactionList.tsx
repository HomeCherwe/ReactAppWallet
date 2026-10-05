import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Animated, LayoutAnimation } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Toast from 'react-native-toast-message'
import { Colors, Radius } from '../constants/theme'
import { Transaction } from '../api/transactions'
import { Card } from '../api/cards'
import { FeedSearch, TxFilter } from '../hooks/useTransactionFeed'
import { triggerErrorHaptic, triggerLightHaptic, triggerMediumHaptic, triggerSuccessHaptic } from '../utils/haptics'
import { TransactionRowsSkeleton } from './Skeleton'
import BankSyncIndicator from './BankSyncIndicator'
import TxSearchBar from './TxSearchBar'
import PossibleDuplicates from './PossibleDuplicates'
import TxRow, { RowMode, closeSwipedRow, fmtMoney } from './TxRow'
import { MenuAction, MenuFrame, openMenu as openMenuOverlay } from '../store/useMenuOverlay'
import { pinStateOf, txDisplayTitle } from '../utils/pinned'
import { isSyncCategory } from '../utils/cardExclusion'
import { useExcludedCategories } from '../utils/statsCategories'

const PINNED_COLLAPSED_KEY = 'pinned_collapsed'
// Rows inside the pinned block sit on a warm surface, so the block stands apart from the list
const PINNED_SURFACE = '#1D140C'

function pluralTx(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'транзакція'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'транзакції'
  return 'транзакцій'
}

function pluralHint(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'підказка'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'підказки'
  return 'підказок'
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
  /** Long-press menu: pin / unpin */
  onTogglePin?: (tx: Transaction) => void
  /** Long-press menu: split into parts */
  onSplitTx?: (tx: Transaction) => void
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
  /** Search field + period/card/category filters over the list */
  search?: FeedSearch
  /** Selection mode (long press → «Вибрати»): the selected ids, null when not selecting */
  selectedIds?: Set<string> | null
  onStartSelect?: (tx: Transaction) => void
  onToggleSelect?: (tx: Transaction) => void
  /** Pinned bank imports with a suggested category: ✓ on a row, or «Підтвердити всі» */
  onAcceptSuggestions?: (txs: Transaction[]) => Promise<void>
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
  onTogglePin,
  onSplitTx,
  onDeleteTx,
  onLinkRefund,
  onUnlinkRefund,
  pinned = [],
  pinnedCategories = [],
  refundFor,
  onRefundForChange,
  refunds = {},
  search,
  selectedIds = null,
  onStartSelect,
  onToggleSelect,
  onAcceptSuggestions,
}: TransactionListProps) {
  // Selection mode: rows show a check circle and a tap selects instead of opening
  const sel = (t: Transaction) => (selectedIds ? selectedIds.has(t.id) : undefined)
  // Searching: every match is in the list (pinned ones too), the pinned block steps aside
  const searching = !!search?.active
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
      if (selectedIds) onToggleSelect?.(tx)
      else if (refundFor) pickRefund(tx)
      else onPressTx?.(tx)
    },
    [selectedIds, onToggleSelect, refundFor, pickRefund, onPressTx]
  )

  // ---- Long press: the row lifts and a glass menu offers everything you can do with it ----
  const openMenu = (tx: Transaction, frame: MenuFrame) => {
    closeSwipedRow()
    openMenuOverlay({
      frame,
      actions: menuActions(tx),
      previewStyle: styles.menuPreview,
      preview: (
        <TxRow
          tx={tx}
          card={tx.card_id ? cardsById[tx.card_id] : undefined}
          hidden={hidden}
          last
          swipeEnabled={false}
          nested={!!tx.refund_for && Number(tx.amount) > 0}
        />
      ),
    })
  }

  const menuActions = (tx: Transaction): MenuAction[] => {
    const out: MenuAction[] = []
    if (onStartSelect) out.push({ label: 'Вибрати', icon: 'check', onPress: () => onStartSelect(tx) })
    const pin = pinStateOf(tx, pinnedCategories)
    if (pin === 'category') {
      out.push({ label: 'Обрати категорію', icon: 'tag', onPress: () => onPressTx?.(tx) })
    } else if (onTogglePin) {
      out.push({ label: pin === 'tag' ? 'Відкріпити' : 'Закріпити', icon: pin === 'tag' ? 'pinOff' : 'pin', onPress: () => onTogglePin(tx) })
    }
    if (onSplitTx && !tx.refund_for) out.push({ label: 'Розділити', icon: 'split', onPress: () => onSplitTx(tx) })
    if (onLinkRefund && Number(tx.amount) < 0 && !tx.is_transfer) {
      out.push({ label: 'Прив’язати повернення', icon: 'undo', onPress: () => startRefund(tx) })
    }
    if (onUnlinkRefund && tx.refund_for) out.push({ label: 'Скасувати повернення', icon: 'close', onPress: () => startRefund(tx) })
    if (onDeleteTx) out.push({ label: 'Видалити', icon: 'trash', destructive: true, onPress: () => onDeleteTx(tx) })
    return out
  }

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

  // Waiting bank imports the rules have a category for
  const suggested = useMemo(
    () => pinnedTop.filter(t => t.suggested_category && isSyncCategory(t.category || '')),
    [pinnedTop]
  )
  const [accepting, setAccepting] = useState(false)
  const acceptSuggestions = useCallback(
    async (txs: Transaction[]) => {
      if (!onAcceptSuggestions || accepting || txs.length === 0) return
      setAccepting(true)
      try {
        await onAcceptSuggestions(txs)
      } finally {
        setAccepting(false)
      }
    },
    [onAcceptSuggestions, accepting]
  )
  const acceptOne = useCallback((tx: Transaction) => acceptSuggestions([tx]), [acceptSuggestions])

  // A refund whose expense is loaded shows only under that expense (no duplicate row)
  const regular = useMemo(() => {
    const loaded = new Set(transactions.map(t => t.id))
    return transactions.filter(
      t =>
        (searching || pinStateOf(t, pinnedCategories) === 'none') &&
        !(t.refund_for && (loaded.has(t.refund_for) || refunds[t.refund_for]))
    )
  }, [transactions, pinnedCategories, refunds, searching])

  const excludedCats = useExcludedCategories()
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
      if (!tx.exclude_from_stats && !(tx.category && excludedCats.includes(tx.category))) {
        const cur = tx.currency || (tx.card_id && cardsById[tx.card_id]?.currency) || ''
        // amount_stat: an expense minus its refunds
        g.totals[cur] = (g.totals[cur] || 0) + Number(tx.amount_stat ?? tx.amount)
      }
    }
    return out
  }, [regular, cardsById, excludedCats])

  const mask = (s: string) => (hidden ? '••••' : s)

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Транзакції</Text>
        <BankSyncIndicator />
      </View>

      <PossibleDuplicates hidden={hidden} />

      {search && <TxSearchBar search={search} cards={cards} />}

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


      {!loading && !searching && pinnedTop.length > 0 && (
        // Outer view carries the orange glow (iOS draws no shadow on a view that clips)
        <View style={styles.pinnedGlow}>
        <View style={styles.pinnedWrap}>
          <Pressable
            onPress={togglePinned}
            style={({ pressed }) => [styles.pinnedHeader, !pinnedCollapsed && styles.pinnedHeaderOpen, pressed && styles.pinnedHeaderPressed]}
          >
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
          {!pinnedCollapsed && onAcceptSuggestions && suggested.length > 0 && !selectedIds && !refundFor && (
            <View style={styles.suggestBar}>
              <Text style={styles.suggestBarText} numberOfLines={2}>
                ✨ {suggested.length === 1 ? 'Є підказка' : `${suggested.length} ${pluralHint(suggested.length)}`} — натисніть ✓ біля суми
              </Text>
              {suggested.length > 1 && (
                <Pressable
                  disabled={accepting}
                  onPress={() => {
                    triggerLightHaptic()
                    acceptSuggestions(suggested)
                  }}
                  style={({ pressed }) => [styles.suggestAllBtn, (pressed || accepting) && styles.suggestAllBtnPressed]}
                >
                  {accepting ? (
                    <ActivityIndicator size="small" color="#1D140C" />
                  ) : (
                    <Text style={styles.suggestAllText}>Підтвердити всі</Text>
                  )}
                </Pressable>
              )}
            </View>
          )}
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
                    onLongPress={openMenu}
                    selected={sel(tx)}
                    surface={PINNED_SURFACE}
                    onAcceptSuggestion={onAcceptSuggestions ? acceptOne : undefined}
                    {...swipeProps}
                  />
                  {kids.map((r, k) => (
                    <TxRow
                      key={`pin-${r.id}`}
                      selected={sel(r)}
                      surface={PINNED_SURFACE}
                      tx={r}
                      card={r.card_id ? cardsById[r.card_id] : undefined}
                      hidden={hidden}
                      nested
                      showDate
                      last={lastRow && k === kids.length - 1}
                      mode={refundFor ? 'dimmed' : 'normal'}
                      onPress={handlePress}
                      onLongPress={openMenu}
                      {...swipeProps}
                    />
                  ))}
                </React.Fragment>
              )
            })}
        </View>
        </View>
      )}

      {loading ? (
        <TransactionRowsSkeleton />
      ) : regular.length === 0 && (searching || pinned.length === 0 || !hasMore) ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateEmoji}>{error ? '⚠️' : searching ? '🔍' : '🧾'}</Text>
          <Text style={styles.stateText}>
            {error
              ? 'Не вдалося завантажити транзакції'
              : searching
                ? 'Нічого не знайдено'
                : pinned.length > 0
                  ? 'Усі транзакції — у закріплених'
                  : 'Транзакцій поки немає'}
          </Text>
          {error && onRetry ? (
            <Pressable onPress={onRetry} style={styles.retryBtn}>
              <Text style={styles.retryText}>Спробувати ще раз</Text>
            </Pressable>
          ) : searching && search ? (
            <Pressable onPress={search.reset} style={styles.retryBtn}>
              <Text style={styles.retryText}>Скинути пошук і фільтри</Text>
            </Pressable>
          ) : null}
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
                      onLongPress={openMenu}
                      selected={sel(tx)}
                      {...swipeProps}
                    />
                    {kids.map((r, k) => (
                      <TxRow
                        key={r.id}
                        selected={sel(r)}
                        tx={r}
                        card={r.card_id ? cardsById[r.card_id] : undefined}
                        hidden={hidden}
                        nested
                        showDate={new Date(r.created_at).toDateString() !== new Date(tx.created_at).toDateString()}
                        last={lastInDay && k === kids.length - 1}
                        mode={refundFor ? 'dimmed' : 'normal'}
                        onPress={handlePress}
                        onLongPress={openMenu}
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
              <Text style={styles.footerText}>{searching ? 'Це все, що знайдено' : 'Це всі транзакції'}</Text>
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
  menuPreview: {
    backgroundColor: '#141416',
  },
  pinnedGlow: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 18,
    backgroundColor: PINNED_SURFACE,
    shadowColor: Colors.orange,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  pinnedWrap: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: PINNED_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 26, 0.55)',
  },
  pinnedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
  },
  // A line under the header only when the rows are shown
  pinnedHeaderOpen: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 122, 26, 0.35)',
  },
  suggestBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: PINNED_SURFACE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 122, 26, 0.25)',
  },
  suggestBarText: {
    flex: 1,
    fontSize: 12.5,
    color: Colors.white60,
  },
  suggestAllBtn: {
    minWidth: 120,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: '#FFB25C',
  },
  suggestAllBtnPressed: {
    opacity: 0.6,
  },
  suggestAllText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1D140C',
  },
  pinnedHeaderPressed: {
    backgroundColor: 'rgba(255, 107, 0, 0.2)',
  },
  pinnedEmoji: {
    fontSize: 15,
  },
  pinnedTitleWrap: {
    flex: 1,
  },
  pinnedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.orangeLight,
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
