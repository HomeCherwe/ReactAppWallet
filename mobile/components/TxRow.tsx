import React, { useEffect, useRef } from 'react'
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { Colors } from '../constants/theme'
import { Transaction } from '../api/transactions'
import { Card } from '../api/cards'
import { getCategoryIcon } from '../utils/categoryIcon'
import { txDisplayTitle } from '../utils/pinned'
import { triggerLightHaptic } from '../utils/haptics'
import { LinearGradient } from 'expo-linear-gradient'
import Icon from './Icon'

const CURRENCY_SYMBOLS: Record<string, string> = { UAH: '₴', USD: '$', EUR: '€', GBP: '£', PLN: 'zł' }

export function fmtMoney(amount: number, currency?: string): string {
  const abs = Math.abs(amount).toLocaleString('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (!currency) return abs
  return `${abs} ${CURRENCY_SYMBOLS[currency] ?? currency}`
}

const ACTION_W = 72
const ACTION_GAP = 8
const ACTIONS_W = ACTION_W * 2 + ACTION_GAP * 3

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
  onLongPress?: (tx: Transaction) => void
  onRefund?: (tx: Transaction) => void
  onDelete?: (tx: Transaction) => void
  /** Refund picking: shared -1…1 driver that makes pickable rows jiggle (like iOS edit mode) */
  wiggle?: Animated.Value
  /** Alternate direction per row so the list doesn't sway as one block */
  wiggleDir?: 1 | -1
}

/**
 * One transaction row. Swipe left reveals "Повернення" (or "Скасувати" for a linked refund)
 * and "Видалити", like the web app.
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
}: TxRowProps) {
  const x = useRef(new Animated.Value(0)).current
  const openRef = useRef(false)
  const canSwipe = swipeEnabled && mode === 'normal' && (!!onRefund || !!onDelete)
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
        Math.abs(g.dx) > 10 &&
        Math.abs(g.dx) > Math.abs(g.dy) * 1.6 &&
        (g.dx < 0 || openRef.current),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        x.stopAnimation()
      },
      onPanResponderMove: (_, g) => {
        const base = openRef.current ? -ACTIONS_W : 0
        let next = base + g.dx
        if (next > 0) next = 0
        // Rubber band past the buttons
        if (next < -ACTIONS_W) next = -ACTIONS_W + (next + ACTIONS_W) * 0.3
        x.setValue(next)
      },
      onPanResponderRelease: (_, g) => {
        const base = openRef.current ? -ACTIONS_W : 0
        const pos = base + g.dx
        const open = g.vx < -0.4 || (pos < -ACTIONS_W / 2 && g.vx < 0.4)
        if (open && !openRef.current) triggerLightHaptic()
        animateTo(open ? -ACTIONS_W : 0)
      },
      onPanResponderTerminate: () => animateTo(openRef.current ? -ACTIONS_W : 0),
    })
  ).current

  const amount = Number(tx.amount)
  const isIncome = amount > 0
  const currency = tx.currency || card?.currency
  const title = txDisplayTitle(tx)
  const isRefund = !!tx.refund_for
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

  // Buttons grow in one after another as the row slides
  const btnAnim = (from: number) => ({
    opacity: x.interpolate({ inputRange: [-ACTIONS_W, -from, 0], outputRange: [1, 0, 0], extrapolate: 'clamp' }),
    transform: [{ scale: x.interpolate({ inputRange: [-ACTIONS_W, -from, 0], outputRange: [1, 0.6, 0.6], extrapolate: 'clamp' }) }],
  })

  const jiggle =
    mode === 'pickable' && wiggle
      ? [{ rotate: wiggle.interpolate({ inputRange: [-1, 1], outputRange: wiggleDir === 1 ? ['-0.45deg', '0.45deg'] : ['0.45deg', '-0.45deg'] }) }]
      : []

  return (
    <View style={styles.wrap}>
      {canSwipe && (
        <View style={styles.actions}>
          <Animated.View style={[styles.actionSlot, btnAnim(ACTION_W * 0.9)]}>
            <Pressable
              onPress={() => {
                close()
                onRefund?.(tx)
              }}
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
            >
              <LinearGradient
                colors={isRefund ? ['#5B5B66', '#3A3A44'] : ['#FF8A2A', '#FF5A00']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Icon name={isRefund ? 'close' : 'undo'} size={20} color="#fff" strokeWidth={2.4} />
              <Text style={styles.actionText}>{isRefund ? 'Скасувати' : 'Повернення'}</Text>
            </Pressable>
          </Animated.View>
          <Animated.View style={[styles.actionSlot, btnAnim(ACTION_W * 0.3)]}>
            <Pressable
              onPress={() => {
                close()
                onDelete?.(tx)
              }}
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
            >
              <LinearGradient
                colors={['#FF5F5F', '#D92D3A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Icon name="trash" size={20} color="#fff" strokeWidth={2.2} />
              <Text style={styles.actionText}>Видалити</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}

      <Animated.View style={{ transform: [{ translateX: x }, ...jiggle] }} {...(canSwipe ? pan.panHandlers : {})}>
        <Pressable
          onPress={handlePress}
          onLongPress={mode === 'normal' ? () => onLongPress?.(tx) : undefined}
          delayLongPress={350}
          style={({ pressed }) => [
            styles.item,
            mode === 'pickable' && styles.itemPickable,
            mode === 'target' && styles.itemTarget,
            mode === 'dimmed' && styles.itemDimmed,
            pressed && styles.itemPressed,
          ]}
        >
          <View style={[styles.iconWrap, isIncome && styles.iconWrapGreen]}>
            <Text style={styles.iconEmoji}>{getCategoryIcon(tx.category ?? null, amount)}</Text>
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
              <Text style={[styles.amount, isIncome && styles.amountGreen, tx.exclude_from_stats && styles.amountMuted]}>
                {hidden ? '••••' : `${isIncome ? '+' : '−'}${fmtMoney(amount, currency)}`}
              </Text>
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
    width: ACTIONS_W,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 6,
    paddingHorizontal: ACTION_GAP / 2,
    gap: ACTION_GAP,
    paddingRight: ACTION_GAP,
  },
  actionSlot: {
    width: ACTION_W,
  },
  action: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  actionText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: 0.1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    gap: 12,
    backgroundColor: '#141416', // covers the actions until the row slides
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
