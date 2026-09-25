import React, { useEffect } from 'react'
import { Animated, DimensionValue, Easing, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'

// One shared pulse for every skeleton on screen, so all placeholders breathe in sync
const pulse = new Animated.Value(0)
let running = 0
let loop: Animated.CompositeAnimation | null = null

function usePulse() {
  useEffect(() => {
    if (running++ === 0) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      )
      loop.start()
    }
    return () => {
      if (--running === 0) loop?.stop()
    }
  }, [])
}

const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] })

interface SkeletonProps {
  width?: DimensionValue
  height: number
  radius?: number
  style?: StyleProp<ViewStyle>
}

export default function Skeleton({ width = '100%', height, radius = 8, style }: SkeletonProps) {
  usePulse()
  return (
    <Animated.View
      style={[styles.block, { width, height, borderRadius: radius, opacity }, style]}
    />
  )
}

/** Placeholder rows shaped like TransactionList items */
export function TransactionRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View>
      <Skeleton width={90} height={12} style={styles.dayLabel} />
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={40} height={40} radius={12} />
          <View style={styles.rowText}>
            <Skeleton width={i % 2 ? '55%' : '70%'} height={13} />
            <Skeleton width={i % 2 ? '35%' : '45%'} height={10} style={{ marginTop: 7 }} />
          </View>
          <Skeleton width={64} height={14} />
        </View>
      ))}
    </View>
  )
}

/** Placeholder shaped like a bank card in CardCarousel */
export function CardSkeleton({ width, height = 195 }: { width: number; height?: number }) {
  usePulse()
  return (
    <Animated.View style={[styles.card, { width, height, opacity }]}>
      <View style={styles.cardTop}>
        <View>
          <View style={[styles.line, { width: 70, height: 10 }]} />
          <View style={[styles.line, { width: 130, height: 16, marginTop: 8 }]} />
        </View>
        <View style={[styles.line, { width: 44, height: 22, borderRadius: 11 }]} />
      </View>
      <View>
        <View style={[styles.line, { width: 50, height: 10 }]} />
        <View style={[styles.line, { width: 160, height: 26, marginTop: 8 }]} />
      </View>
      <View style={styles.cardBottom}>
        <View style={[styles.line, { width: 110, height: 12 }]} />
        <View style={[styles.line, { width: 36, height: 26, borderRadius: 6 }]} />
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 32,
    padding: 20,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  line: {
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  block: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
  },
  dayLabel: {
    marginLeft: 20,
    marginTop: 16,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
})
