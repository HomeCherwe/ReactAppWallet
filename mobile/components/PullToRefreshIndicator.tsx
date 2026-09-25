import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { Colors } from '../constants/theme'
import { triggerLightHaptic, triggerSuccessHaptic } from '../utils/haptics'
import { GlassSurface } from './LiquidGlass'
import Icon from './Icon'

// Pull further than this (px) and release to refresh (matches iOS RefreshControl)
const THRESHOLD = 72
const DONE_VISIBLE_MS = 700
const PILL_H = 36
// Gap between the pill and the content it sits above
const PILL_GAP = 10

type Phase = 'idle' | 'pull' | 'release' | 'refreshing' | 'done'

/**
 * Pull-to-refresh status pill (the native spinner is hidden), like Telegram: it comes out of the
 * gap that opens above the content and moves with it — "Потягніть…" → "Відпустіть…" past the
 * threshold → "Оновлюємо…" while the content stays pulled down → hides as it springs back.
 * `scrollY` is the list's contentOffset.y (negative while pulling); `top` is where the list's
 * content starts on screen.
 */
export default function PullToRefreshIndicator({
  scrollY,
  refreshing,
  top = 0,
}: {
  scrollY: Animated.Value
  refreshing: boolean
  top?: number
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const phaseRef = useRef<Phase>('idle')
  const status = useRef(new Animated.Value(0)).current // 1 while refreshing / done
  const spin = useRef(new Animated.Value(0)).current

  const set = (p: Phase) => {
    if (phaseRef.current === p) return
    phaseRef.current = p
    setPhase(p)
  }

  // Pull → release as the finger crosses the threshold
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      const p = phaseRef.current
      if (p === 'refreshing' || p === 'done') return
      if (value < -THRESHOLD) {
        if (p !== 'release') triggerLightHaptic()
        set('release')
      } else if (value < -6) {
        set('pull')
      } else {
        set('idle')
      }
    })
    return () => scrollY.removeListener(id)
  }, [scrollY])

  useEffect(() => {
    if (refreshing) {
      set('refreshing')
      Animated.spring(status, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 6 }).start()
      return
    }
    if (phaseRef.current !== 'refreshing') return
    set('done')
    triggerSuccessHaptic()
    const t = setTimeout(() => {
      Animated.timing(status, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() =>
        set('idle')
      )
    }, DONE_VISIBLE_MS)
    return () => clearTimeout(t)
  }, [refreshing])

  // Arrow turns as you pull; pill fades/slides in with the pull
  const arrowRotate = scrollY.interpolate({
    inputRange: [-THRESHOLD, -THRESHOLD * 0.6, 0],
    outputRange: ['180deg', '0deg', '0deg'],
    extrapolate: 'clamp',
  })
  const pullOpacity = scrollY.interpolate({ inputRange: [-40, -8, 0], outputRange: [1, 0, 0], extrapolate: 'clamp' })
  // Slides down from the top edge with the pull and stops there (never drifts down the screen)
  const follow = scrollY.interpolate({
    inputRange: [-(PILL_H + PILL_GAP * 2), 0],
    outputRange: [PILL_GAP, -PILL_H - PILL_GAP],
    extrapolate: 'clamp',
  })
  const pullScale = scrollY.interpolate({ inputRange: [-THRESHOLD - 20, -THRESHOLD, 0], outputRange: [1.05, 1, 0.85], extrapolate: 'clamp' })

  const busy = phase === 'refreshing' || phase === 'done'
  if (phase === 'idle') return null

  return (
    <View style={[styles.wrap, { top }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.pill,
          phase === 'release' && styles.pillReady,
          phase === 'done' && styles.pillDone,
          busy
            ? { opacity: status, transform: [{ translateY: follow }] }
            : { opacity: pullOpacity, transform: [{ translateY: follow }, { scale: pullScale }] },
        ]}
      >
        <GlassSurface borderRadius={20} />
        {phase === 'refreshing' ? (
          <ActivityIndicator size="small" color={Colors.orange} />
        ) : phase === 'done' ? (
          <Icon name="check" size={15} color={Colors.green} strokeWidth={3} />
        ) : (
          <Animated.View style={{ transform: [{ rotate: arrowRotate }] }}>
            <Text style={[styles.arrow, phase === 'release' && { color: Colors.orange }]}>↓</Text>
          </Animated.View>
        )}
        <Text style={[styles.text, phase === 'done' && { color: Colors.green }]}>
          {phase === 'pull'
            ? 'Потягніть, щоб оновити'
            : phase === 'release'
              ? 'Відпустіть, щоб оновити'
              : phase === 'refreshing'
                ? 'Оновлюємо…'
                : 'Оновлено'}
        </Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Clips the pill to the list area, so it slides out from under the content's top edge
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 260,
    overflow: 'hidden',
    alignItems: 'center',
    zIndex: 50,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: PILL_H,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(30, 30, 34, 0.75)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  pillReady: {
    borderColor: 'rgba(255, 122, 26, 0.6)',
  },
  pillDone: {
    borderColor: 'rgba(34, 197, 94, 0.5)',
  },
  arrow: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.white80,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white,
  },
})
