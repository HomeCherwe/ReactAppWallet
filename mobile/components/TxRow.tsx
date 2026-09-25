import React, { useEffect, useRef } from 'react'
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { Colors } from '../constants/theme'
import { Transaction } from '../api/transactions'
import { Card } from '../api/cards'
import { getCategoryIcon } from '../utils/categoryIcon'
import { txDisplayTitle } from '../utils/pinned'
import { triggerLightHaptic } from '../utils/haptics'

const CURRENCY_SYMBOLS: Record<string, string> = { UAH: '₴', USD: '$', EUR: '€', GBP: '£', PLN: 'zł' }

export function fmtMoney(amount: number, currency?: string): string {
  const abs = Math.abs(amount).toLocaleString('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (!currency) return abs
  return `${abs} ${CURRENCY_SYMBOLS[currency] ?? currency}`
}

const ACTION_W = 78
const ACTIONS_W = ACTION_W * 2

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

  // Actions fade in as the row slides
  const actionsOpacity = x.interpolate({ inputRange: [-ACTIONS_W, -24, 0], outputRange: [1, 0.4, 0], extrapolate: 'clamp' })

  return (
    <View style={styles.wrap}>
      {canSwipe && (
        <Animated.View style={[styles.actions, { opacity: actionsOpacity }]}>
          <Pressable
            onPress={() => {
              close()
              onRefund?.(tx)
            }}
            style={({ pressed }) => [styles.action, styles.actionRefund, pressed && styles.actionPressed]}
          >
            <Text style={styles.actionIcon}>{isRefund ? '⤺' : '↩︎'}</Text>
            <Text style={styles.actionText}>{isRefund ? 'Скасувати' : 'Повернення'}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              close()
              onDelete?.(tx)
            }}
            style={({ pressed }) => [styles.action, styles.actionDelete, pressed && styles.actionPressed]}
          >
            <Text style={styles.actionIcon}>🗑</Text>
            <Text style={styles.actionText}>Видалити</Text>
          </Pressable>
        </Animated.View>
      )}

      <Animated.View style={{ transform: [{ translateX: x }] }} {...(canSwipe ? pan.panHandlers : {})}>
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
              {mode === 'pickable' && <Text style={styles.pickHint}>Обрати</Text>}
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
  },
  action: {
    width: ACTION_W,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  actionRefund: {
    backgroundColor: '#FF7A1A',
  },
  actionDelete: {
    backgroundColor: '#E5484D',
  },
  actionPressed: {
    opacity: 0.8,
  },
  actionIcon: {
    fontSize: 17,
    color: Colors.white,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.white,
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
    backgroundColor: 'rgba(34, 197, 94, 0.07)',
  },
  itemTarget: {
    backgroundColor: 'rgba(255, 107, 0, 0.10)',
  },
  itemDimmed: {
    opacity: 0.35,
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
