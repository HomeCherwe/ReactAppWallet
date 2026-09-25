import React, { useEffect, useRef } from 'react'
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { Colors } from '../constants/theme'
import { Transaction } from '../api/transactions'
import { Card } from '../api/cards'
import { getCategoryIcon } from '../utils/categoryIcon'
import { txDisplayTitle } from '../utils/pinned'
import { triggerLightHaptic, triggerMediumHaptic, triggerSelectionHaptic } from '../utils/haptics'
import Icon from './Icon'
import { menuDragHandlers, useMenuOverlay } from '../store/useMenuOverlay'

const CURRENCY_SYMBOLS: Record<string, string> = { UAH: '₴', USD: '$', EUR: '€', GBP: '£', PLN: 'zł' }

export function fmtMoney(amount: number, currency?: string): string {
  const abs = Math.abs(amount).toLocaleString('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (!currency) return abs
  return `${abs} ${CURRENCY_SYMBOLS[currency] ?? currency}`
}

// Minimal icon buttons revealed by the swipe
const SLOT_W = 56
const BTN = 42
const REFUND_COLOR = '#FFA53A'

// Only one row is open at a time: opening another closes the previous one
let closeOpenRow: (() => void) | null = null

export function closeSwipedRow() {
  closeOpenRow?.()
}

export type RowMode = 'normal' | 'pickable' | 'dimmed' | 'target'

interface TxRowProps {
  tx: Transaction
  card?: Card
  hidden?: boolean
  isPinned?: boolean
  showDate?: boolean
  last?: boolean
  mode?: RowMode
  swipeEnabled?: boolean
  onPress?: (tx: Transaction) => void
  /** Long press, with the row's position on screen (for the lifted menu) */
  onLongPress?: (tx: Transaction, frame: { x: number; y: number; w: number; h: number }) => void
  onRefund?: (tx: Transaction) => void
  onDelete?: (tx: Transaction) => void
  /** Refund picking: shared -1…1 driver that makes pickable rows jiggle (like iOS edit mode) */
  wiggle?: Animated.Value
  /** Alternate direction per row so the list doesn't sway as one block */
  wiggleDir?: 1 | -1
  /** A refund shown under its expense */
  nested?: boolean
}

/**
 * One transaction row. Swipe left reveals icon buttons: refund (expenses only; "unlink" on a
 * linked refund) and delete.
 */
function TxRow({
  tx,
  card,
  hidden,
  isPinned,
  showDate,
  last,
  mode = 'normal',
  swipeEnabled = true,
  onPress,
  onLongPress,
  onRefund,
  onDelete,
  wiggle,
  wiggleDir = 1,
  nested = false,
}: TxRowProps) {
  const x = useRef(new Animated.Value(0)).current
  const openRef = useRef(false)
  const rowRef = useRef<View>(null)

  const amount = Number(tx.amount)
  const isRefund = !!tx.refund_for
  // Refund only for expenses (and "unlink" on an income that already is a refund)
  const showRefund = !!onRefund && (amount < 0 || isRefund)
  const actionCount = (showRefund ? 1 : 0) + (onDelete ? 1 : 0)
  const actionsW = actionCount * SLOT_W + 6
  const actionsWRef = useRef(actionsW)
  actionsWRef.current = actionsW
  // Past the "open" point during the drag (for the haptic tick when crossing it)
  const pastRef = useRef(false)

  const canSwipe = swipeEnabled && mode === 'normal' && actionCount > 0
  const canSwipeRef = useRef(canSwipe)
  canSwipeRef.current = canSwipe

  // Stable for the row's lifetime: its identity marks "the open row"
  const ctl = useRef<{ animateTo: (to: number) => void; close: () => void } | null>(null)
  if (!ctl.current) {
    const animateTo = (to: number) => {
      openRef.current = to !== 0
      if (to !== 0) {
        if (closeOpenRow && closeOpenRow !== close) closeOpenRow()
        closeOpenRow = close
      } else if (closeOpenRow === close) {
        closeOpenRow = null
      }
      Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0, speed: 18 }).start()
    }
    const close = () => animateTo(0)
    ctl.current = { animateTo, close }
  }
  const { animateTo, close } = ctl.current

  // Leaving swipe mode (e.g. refund picking started) closes the row
  useEffect(() => {
    if (!canSwipe && openRef.current) close()
  }, [canSwipe])

  useEffect(() => () => {
    if (closeOpenRow === close) closeOpenRow = null
  }, [])

  const pan = useRef(
    PanResponder.create({
      // Clearly horizontal drags only, so the page still scrolls vertically
      onMoveShouldSetPanResponder: (_, g) =>
        canSwipeRef.current &&
        !useMenuOverlay.getState().menu && // the finger is sliding over the long-press menu
        Math.abs(g.dx) > 10 &&
        Math.abs(g.dx) > Math.abs(g.dy) * 1.6 &&
        (g.dx < 0 || openRef.current),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        x.stopAnimation()
        pastRef.current = openRef.current
      },
      onPanResponderMove: (_, g) => {
        const w = actionsWRef.current
        const base = openRef.current ? -w : 0
        let next = base + g.dx
        if (next > 0) next = 0
        // Rubber band past the buttons
        if (next < -w) next = -w + (next + w) * 0.3
        x.setValue(next)
        // Tick each time the drag crosses the point where the buttons stay open
        const past = next < -w / 2
        if (past !== pastRef.current) {
          pastRef.current = past
          triggerSelectionHaptic()
        }
      },
      onPanResponderRelease: (_, g) => {
        const w = actionsWRef.current
        const base = openRef.current ? -w : 0
        const pos = base + g.dx
        const open = g.vx < -0.4 || (pos < -w / 2 && g.vx < 0.4)
        animateTo(open ? -w : 0)
      },
      onPanResponderTerminate: () => animateTo(openRef.current ? -actionsWRef.current : 0),
    })
  ).current

  const isIncome = amount > 0
  const currency = tx.currency || card?.currency
  // Expense with refunds: amount_stat = amount + refunds (what it really cost)
  const stat = tx.amount_stat == null ? null : Number(tx.amount_stat)
  const netAmount = !isIncome && stat != null && Math.abs(stat - amount) > 0.004 ? stat : null
  const fullyRefunded = netAmount != null && Math.abs(netAmount) < 0.005
  const title = txDisplayTitle(tx)
  const d = new Date(tx.created_at)
  const time = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
  const when = showDate ? `${d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}, ${time}` : time
  const meta = [
    isRefund ? '↩︎ Повернення' : tx.category && tx.category !== title ? tx.category : null,
    card?.name,
    when,
  ]
    .filter(Boolean)
    .join(' · ')

  const handlePress = () => {
    if (openRef.current) {
      close()
      return
    }
    if (closeOpenRow) {
      closeOpenRow()
      return
    }
    onPress?.(tx)
  }

  // Buttons pop in one after another as the row slides
  const btnAnim = (from: number) => ({
    opacity: x.interpolate({ inputRange: [-actionsW, -from, 0], outputRange: [1, 0, 0], extrapolate: 'clamp' }),
    transform: [{ scale: x.interpolate({ inputRange: [-actionsW, -from, 0], outputRange: [1, 0.5, 0.5], extrapolate: 'clamp' }) }],
  })

  const jiggle =
    mode === 'pickable' && wiggle
      ? [{ rotate: wiggle.interpolate({ inputRange: [-1, 1], outputRange: wiggleDir === 1 ? ['-0.45deg', '0.45deg'] : ['0.45deg', '-0.45deg'] }) }]
      : []

  return (
    <View style={styles.wrap} ref={rowRef} {...menuDragHandlers}>
      {canSwipe && (
        <View style={[styles.actions, { width: actionsW }]}>
          {showRefund && (
            <Animated.View style={[styles.slot, btnAnim(actionsW - 8)]}>
              <Pressable
                accessibilityLabel={isRefund ? 'Скасувати повернення' : 'Повернення'}
                onPress={() => {
                  triggerLightHaptic()
                  close()
                  onRefund?.(tx)
                }}
                style={({ pressed }) => [styles.btn, isRefund ? styles.btnMuted : styles.btnRefund, pressed && styles.btnPressed]}
              >
                <Icon name={isRefund ? 'close' : 'undo'} size={19} color={isRefund ? Colors.white80 : REFUND_COLOR} strokeWidth={2.4} />
              </Pressable>
            </Animated.View>
          )}
          {onDelete && (
            <Animated.View style={[styles.slot, btnAnim(showRefund ? SLOT_W / 2 : actionsW - 8)]}>
              <Pressable
                accessibilityLabel="Видалити"
                onPress={() => {
                  triggerLightHaptic()
                  close()
                  onDelete(tx)
                }}
                style={({ pressed }) => [styles.btn, styles.btnDelete, pressed && styles.btnPressed]}
              >
                <Icon name="trash" size={19} color="#FF6B6B" strokeWidth={2.2} />
              </Pressable>
            </Animated.View>
          )}
        </View>
      )}

      <Animated.View style={{ transform: [{ translateX: x }, ...jiggle] }} {...(canSwipe ? pan.panHandlers : {})}>
        <Pressable
          onPress={handlePress}
          onLongPress={
            mode === 'normal' && onLongPress
              ? () => {
                  triggerMediumHaptic() // right as the long press registers
                  rowRef.current?.measureInWindow((fx, fy, w, h) => onLongPress(tx, { x: fx, y: fy, w, h }))
                }
              : undefined
          }
          delayLongPress={350}
          style={({ pressed }) => [
            styles.item,
            nested && styles.itemNested,
            mode === 'pickable' && styles.itemPickable,
            mode === 'target' && styles.itemTarget,
            mode === 'dimmed' && styles.itemDimmed,
            pressed && styles.itemPressed,
          ]}
        >
          {nested && <View style={styles.nestLine} />}
          <View style={[styles.iconWrap, isIncome && styles.iconWrapGreen, nested && styles.iconWrapNested]}>
            {nested ? (
              <Icon name="undo" size={15} color={Colors.green} strokeWidth={2.4} />
            ) : (
              <Text style={styles.iconEmoji}>{getCategoryIcon(tx.category ?? null, amount)}</Text>
            )}
          </View>

          <View style={[styles.info, !last && styles.infoBorder]}>
            <View style={styles.infoText}>
              <Text style={styles.txTitle} numberOfLines={1}>
                {isPinned && <Text style={styles.pinMark}>📌 </Text>}
                {title}
              </Text>
              <Text style={[styles.txMeta, isRefund && styles.txMetaRefund]} numberOfLines={1}>
                {meta}
              </Text>
            </View>
            <View style={styles.amountCol}>
              {netAmount != null ? (
                <>
                  {fullyRefunded ? (
                    <Text style={[styles.amount, styles.amountGreen]}>Повернено</Text>
                  ) : (
                    <Text style={styles.amount}>{hidden ? '••••' : `−${fmtMoney(netAmount, currency)}`}</Text>
                  )}
                  <Text style={styles.amountOriginal}>{hidden ? '••••' : `−${fmtMoney(amount, currency)}`}</Text>
                </>
              ) : (
                <Text
                  style={[
                    styles.amount,
                    nested && styles.amountNested,
                    isIncome && styles.amountGreen,
                    tx.exclude_from_stats && !nested && styles.amountMuted,
                  ]}
                >
                  {hidden ? '••••' : `${isIncome ? '+' : '−'}${fmtMoney(amount, currency)}`}
                </Text>
              )}
              {mode === 'pickable' && (
                <View style={styles.pickPill}>
                  <Icon name="plus" size={12} color="#0B2E17" strokeWidth={3} />
                  <Text style={styles.pickPillText}>Обрати</Text>
                </View>
              )}
              {mode === 'target' && (
                <View style={styles.targetPill}>
                  <Icon name="undo" size={12} color="#fff" strokeWidth={2.6} />
                  <Text style={styles.targetPillText}>Повертаємо</Text>
                </View>
              )}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  )
}

export default React.memo(TxRow)

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  actions: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 6,
  },
  slot: {
    width: SLOT_W,
    alignItems: 'center',
  },
  btn: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  // Warm amber-orange, so it never reads as the red delete button next to it
  btnRefund: {
    backgroundColor: 'rgba(255, 159, 28, 0.20)',
    borderColor: 'rgba(255, 170, 60, 0.60)',
  },
  btnMuted: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  btnDelete: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  btnPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    gap: 12,
    backgroundColor: '#141416', // covers the actions until the row slides
  },
  // Refund under its expense: indented, with a connecting line
  itemNested: {
    paddingLeft: 44,
  },
  nestLine: {
    position: 'absolute',
    left: 35,
    top: 0,
    bottom: 0,
    width: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(34, 197, 94, 0.35)',
  },
  iconWrapNested: {
    width: 30,
    height: 30,
    borderRadius: 10,
  },
  amountNested: {
    fontSize: 14,
  },
  amountOriginal: {
    fontSize: 12,
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  itemPressed: {
    backgroundColor: '#1C1C1F',
  },
  itemPickable: {
    backgroundColor: '#15201A',
  },
  itemTarget: {
    backgroundColor: '#2A1709',
    borderLeftWidth: 3,
    borderLeftColor: Colors.orange,
    paddingLeft: 13,
  },
  itemDimmed: {
    opacity: 0.28,
  },
  pickPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    backgroundColor: Colors.green,
  },
  pickPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0B2E17',
  },
  targetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    backgroundColor: Colors.orange,
  },
  targetPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.white,
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
  pinMark: {
    fontSize: 12,
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
  txMetaRefund: {
    color: 'rgba(255, 140, 58, 0.85)',
  },
  amountCol: {
    alignItems: 'flex-end',
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
  pickHint: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.green,
    marginTop: 2,
  },
})
