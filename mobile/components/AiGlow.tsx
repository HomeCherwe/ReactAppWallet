import React, { useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg'

// The AI's colors: a "living" contour that keeps running around (like the iOS Siri glow)
export const AI_COLORS = ['#FF6B00', '#FF3D7F', '#A259FF', '#3D7BFF', '#FF6B00'] as const
export const AI_ACCENT = '#C77DFF'

/** A value that turns 0 → 1 forever (one full turn per `ms`), on the native thread */
function useSpin(ms: number) {
  const spin = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [ms])
  return spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
}

/** Breathing 0.35 ↔ 0.9 (for the soft halo) */
function useBreath(ms: number) {
  const v = useRef(new Animated.Value(0.35)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.9, duration: ms / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.35, duration: ms / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [ms])
  return v
}

let ringIds = 0

/**
 * A glowing ring that runs around a round button (the + on Home): a thin colorful contour plus a
 * soft breathing halo. Transparent inside, so the button above it stays as it is.
 */
export function AiGlowRing({ size, thickness = 2.5, style }: { size: number; thickness?: number; style?: StyleProp<ViewStyle> }) {
  const rotate = useSpin(3200)
  const breath = useBreath(2600)
  const id = useRef(`aiRing${++ringIds}`).current
  const pad = 8 // room for the halo
  const box = size + pad * 2
  const c = box / 2
  const ring = (stroke: number, r: number, opacity = 1) => (
    <Svg width={box} height={box}>
      <Defs>
        <SvgGradient id={id} x1="0" y1="0" x2="1" y2="1">
          {AI_COLORS.map((col, i) => (
            <Stop key={i} offset={i / (AI_COLORS.length - 1)} stopColor={col} />
          ))}
        </SvgGradient>
      </Defs>
      <Circle cx={c} cy={c} r={r} stroke={`url(#${id})`} strokeWidth={stroke} strokeOpacity={opacity} fill="none" />
    </Svg>
  )
  return (
    <View pointerEvents="none" style={[{ width: box, height: box, margin: -pad }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: breath, transform: [{ rotate }] }]}>
        {ring(thickness * 3.2, size / 2, 0.45)}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
        {ring(thickness, size / 2 - thickness / 2)}
      </Animated.View>
    </View>
  )
}

/**
 * A rounded box with the AI's running contour (the «Запитати AI» item, the chat's input): the
 * colors sweep around the border. `background` fills the inside.
 */
export function AiGlowBorder({
  radius,
  thickness = 1.5,
  background,
  style,
  children,
}: {
  radius: number
  thickness?: number
  background: string
  style?: StyleProp<ViewStyle>
  children?: React.ReactNode
}) {
  const rotate = useSpin(3600)
  const [size, setSize] = useState({ w: 0, h: 0 })
  // A square big enough to cover the box while it turns
  const d = Math.ceil(Math.hypot(size.w, size.h)) + 4
  return (
    <View
      style={[{ borderRadius: radius, overflow: 'hidden' }, style]}
      onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {size.w > 0 && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: d,
            height: d,
            left: (size.w - d) / 2,
            top: (size.h - d) / 2,
            transform: [{ rotate }],
          }}
        >
          <LinearGradient colors={AI_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: thickness,
          right: thickness,
          top: thickness,
          bottom: thickness,
          borderRadius: Math.max(0, radius - thickness),
          backgroundColor: background,
        }}
      />
      {children}
    </View>
  )
}
