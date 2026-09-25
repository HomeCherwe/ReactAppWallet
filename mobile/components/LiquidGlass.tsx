import React, { createContext, useContext, useRef } from 'react'
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  ColorValue,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'

/** True on iOS 26+ where the native UIGlassEffect (Liquid Glass) is available. */
export const HAS_LIQUID_GLASS = isLiquidGlassAvailable()

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * True inside a surface that is already glass (e.g. a sheet). Buttons there use a light
 * translucent fill instead of nesting more glass layers — cheaper, and glass-on-glass
 * is what Apple's guidelines advise against.
 */
export const InsideGlassContext = createContext(false)

interface GlassSurfaceProps {
  style?: StyleProp<ViewStyle>
  tintColor?: ColorValue
  interactive?: boolean
  glassStyle?: 'regular' | 'clear'
  borderRadius?: number
}

/**
 * Absolute-fill glass background layer.
 * iOS 26+: pure native Liquid Glass (no overlays, so refraction stays visible).
 * Older iOS / Android / web: blur + tint + rim fallback.
 */
export function GlassSurface({
  style,
  tintColor,
  interactive = false,
  glassStyle = 'regular',
  borderRadius,
}: GlassSurfaceProps) {
  const radiusStyle = borderRadius != null ? { borderRadius } : null

  if (HAS_LIQUID_GLASS) {
    return (
      <GlassView
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, radiusStyle, style]}
        glassEffectStyle={glassStyle}
        colorScheme="dark"
        tintColor={tintColor}
        isInteractive={interactive}
      />
    )
  }

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.fallback, radiusStyle, style]}
    >
      <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: tintColor ?? 'rgba(255,255,255,0.06)' },
        ]}
      />
      <View style={[StyleSheet.absoluteFill, styles.fallbackRim, radiusStyle]} />
    </View>
  )
}

export interface GlassPressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>
  /** Glass tint. Defaults to the backgroundColor from `style`, if any. */
  tintColor?: ColorValue
  glassStyle?: 'regular' | 'clear'
  children?: React.ReactNode
}

/**
 * Drop-in replacement for TouchableOpacity that renders the button on Liquid Glass.
 * The style's backgroundColor is moved into the glass tint so the glass stays see-through.
 */
export function GlassPressable({
  style,
  tintColor,
  glassStyle = 'regular',
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: GlassPressableProps) {
  const scale = useRef(new Animated.Value(1)).current
  const insideGlass = useContext(InsideGlassContext)
  const { backgroundColor, ...flat } = StyleSheet.flatten(style) ?? {}
  const radius = typeof flat.borderRadius === 'number' ? flat.borderRadius : 100

  const animateTo = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 40, bounciness: 8 }).start()

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => { animateTo(0.95); onPressIn?.(e) }}
      onPressOut={(e) => { animateTo(1); onPressOut?.(e) }}
      style={[
        flat,
        { borderRadius: radius, overflow: 'hidden', transform: [{ scale }] },
        disabled && { opacity: 0.5 },
      ]}
    >
      {insideGlass ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.lite,
            { borderRadius: radius, backgroundColor: tintColor ?? backgroundColor ?? 'rgba(255,255,255,0.07)' },
          ]}
        />
      ) : (
        <GlassSurface
          tintColor={tintColor ?? (backgroundColor as ColorValue | undefined)}
          glassStyle={glassStyle}
          borderRadius={radius}
          interactive
        />
      )}
      {children}
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  lite: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  fallback: {
    overflow: 'hidden',
    backgroundColor: 'rgba(20,20,26,0.55)',
  },
  fallbackRim: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
})
