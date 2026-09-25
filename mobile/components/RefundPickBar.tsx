import React, { useEffect, useRef } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import { Colors } from '../constants/theme'
import { Transaction } from '../api/transactions'
import { txDisplayTitle } from '../utils/pinned'
import { triggerLightHaptic } from '../utils/haptics'
import { GlassSurface } from './LiquidGlass'
import Icon from './Icon'
import { fmtMoney } from './TxRow'

interface Props {
  expense: Transaction | null
  currency?: string
  hidden?: boolean
  onCancel: () => void
}

/**
 * Floating bar while picking a refund: always visible (the list can be scrolled far away from its
 * top), says what to do and for which expense, and cancels.
 */
export default function RefundPickBar({ expense, currency, hidden, onCancel }: Props) {
  const slide = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0)).current
  const last = useRef<Transaction | null>(null)
  if (expense) last.current = expense

  useEffect(() => {
    Animated.spring(slide, { toValue: expense ? 1 : 0, useNativeDriver: true, speed: 14, bounciness: expense ? 8 : 0 }).start()
  }, [!!expense])

  useEffect(() => {
    if (!expense) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [!!expense])

  const tx = last.current
  if (!tx) return null

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [160, 0] })
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] })
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] })
  const amount = hidden ? '••••' : `−${fmtMoney(Number(tx.amount), currency)}`

  return (
    <Animated.View
      pointerEvents={expense ? 'box-none' : 'none'}
      style={[styles.wrap, { opacity: slide, transform: [{ translateY }] }]}
    >
      <View style={styles.bar}>
        <GlassSurface borderRadius={24} tintColor="rgba(40, 18, 4, 0.55)" />
        <View style={styles.iconWrap}>
          <Animated.View style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
          <View style={styles.icon}>
            <Icon name="undo" size={20} color="#fff" strokeWidth={2.6} />
          </View>
        </View>
        <View style={styles.texts}>
          <Text style={styles.title}>Торкніться доходу-повернення</Text>
          <Text style={styles.sub} numberOfLines={1}>
            для «{txDisplayTitle(tx)}» · {amount}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            triggerLightHaptic()
            onCancel()
          }}
          hitSlop={10}
          style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}
        >
          <Icon name="close" size={16} color="#fff" strokeWidth={2.6} />
        </Pressable>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 112, // above the tab dock
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(30, 16, 6, 0.80)',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 26, 0.55)',
    shadowColor: Colors.orange,
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  iconWrap: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.orange,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.white,
  },
  sub: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  cancel: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
