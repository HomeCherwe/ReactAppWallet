import React from 'react'
import {
  View,
  StyleSheet,
  ViewStyle,
  StyleProp,
  Platform,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { GlassView } from 'expo-glass-effect'
import { HAS_LIQUID_GLASS } from './LiquidGlass'
import { LinearGradient } from 'expo-linear-gradient'
import { Colors, Radius } from '../constants/theme'

interface GlassCardProps {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  intensity?: 'light' | 'medium' | 'strong'
  orange?: boolean
  radius?: number
  padding?: number
  isInteractive?: boolean
}

export default function GlassCard({
  children,
  style,
  intensity = 'medium',
  orange = false,
  radius = Radius.xl,
  padding = 20,
  isInteractive = false,
}: GlassCardProps) {
  // Specular colors & tints
  const tintColor = orange
    ? 'rgba(255, 107, 0, 0.28)'
    : intensity === 'light'
    ? 'rgba(255, 255, 255, 0.05)'
    : intensity === 'strong'
    ? 'rgba(255, 255, 255, 0.14)'
    : 'rgba(255, 255, 255, 0.08)'

  const borderColor = orange
    ? 'rgba(255, 115, 0, 0.45)'
    : 'rgba(255, 255, 255, 0.16)'

  const blurIntensity = orange ? 55 : intensity === 'strong' ? 70 : 60

  return (
    <View
      style={[
        styles.wrapper,
        {
          borderRadius: radius,
          borderColor,
          backgroundColor: HAS_LIQUID_GLASS
            ? 'transparent'
            : orange ? 'rgba(28, 14, 4, 0.38)' : 'rgba(20, 20, 26, 0.40)',
        },
        style,
      ]}
    >
      {/* 1. Hardware-accelerated Apple BlurView */}
      {!HAS_LIQUID_GLASS && (
        <BlurView
          intensity={blurIntensity}
          tint="dark"
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
      )}

      {/* 2. Native iOS GlassView UIVisualEffectView */}
      <GlassView
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        glassEffectStyle="regular"
        colorScheme="dark"
        tintColor={tintColor}
        isInteractive={isInteractive}
      />

      {/* 3. Liquid Glass Specular Gradient (top-left light refraction) */}
      <LinearGradient
        colors={
          orange
            ? ['rgba(255, 125, 20, 0.26)', 'rgba(255, 60, 0, 0.04)', 'transparent']
            : ['rgba(255, 255, 255, 0.14)', 'rgba(255, 255, 255, 0.02)', 'transparent']
        }
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        pointerEvents="none"
      />

      {/* 4. Crisp Inner Rim Highlight */}
      <View
        style={[
          styles.innerRim,
          {
            borderRadius: radius,
            borderColor: orange ? 'rgba(255, 150, 50, 0.35)' : 'rgba(255, 255, 255, 0.18)',
          },
        ]}
        pointerEvents="none"
      />

      {/* Content */}
      <View style={{ padding, borderRadius: radius }}>
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  innerRim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    borderTopWidth: 1,
  },
})
