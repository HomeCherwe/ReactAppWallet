import React from 'react'
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
  Platform,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { GlassView } from 'expo-glass-effect'
import { HAS_LIQUID_GLASS } from './LiquidGlass'
import { Host, Button as SwiftUIButton } from '@expo/ui/swift-ui'
import { buttonStyle, tint, controlSize, buttonBorderShape } from '@expo/ui/swift-ui/modifiers'
import { Colors, Radius, Typography } from '../constants/theme'

export interface GlassButtonProps {
  label?: string
  onPress?: () => void
  variant?: 'primary' | 'glass' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
  icon?: React.ReactNode
  systemImage?: string
  children?: React.ReactNode
}

/**
 * Universal Liquid Glass Button:
 * Uses native SwiftUI glass / glassProminent buttons on iOS when systemImage or simple labels are used,
 * and high-fidelity layered Liquid Glass (BlurView + GlassView + Specular reflection + rim border)
 * across all other components and custom compositions.
 */
export default function GlassButton({
  label,
  onPress = () => {},
  variant = 'glass',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  textStyle,
  icon,
  systemImage,
  children,
}: GlassButtonProps) {
  const isPrimary = variant === 'primary'
  const isGlass = variant === 'glass'
  const isDestructive = variant === 'destructive'

  const sizeConfig = {
    sm: { height: 34, paddingHorizontal: 10, fontSize: 12, iconSize: 13 },
    md: { height: 46, paddingHorizontal: 20, fontSize: 15, iconSize: 16 },
    lg: { height: 54, paddingHorizontal: 28, fontSize: 16, iconSize: 18 },
  }[size]

  // Native SwiftUI Liquid Glass rendering on iOS for clean system buttons
  if (Platform.OS === 'ios' && !loading && !icon && !children && label) {
    const swiftSize = size === 'sm' ? 'small' : size === 'lg' ? 'large' : 'regular'
    const swiftStyle = isPrimary
      ? 'glassProminent'
      : isGlass
      ? 'glass'
      : isDestructive
      ? 'bordered'
      : 'borderless'

    const swiftTint = isPrimary
      ? Colors.orange
      : isDestructive
      ? Colors.red
      : '#FFFFFF'

    return (
      <Host style={[{ height: sizeConfig.height, minWidth: 60 }, style]} seedColor={swiftTint} colorScheme="dark">
        <SwiftUIButton
          label={label}
          systemImage={systemImage as any}
          modifiers={[
            buttonStyle(swiftStyle as any),
            tint(swiftTint),
            buttonBorderShape('capsule'),
            controlSize(swiftSize),
          ]}
          onPress={onPress}
        />
      </Host>
    )
  }

  // Multi-layered Liquid Glass for custom children, primary gradients, loading, or other platforms
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.base,
        {
          height: sizeConfig.height,
          paddingHorizontal: sizeConfig.paddingHorizontal,
        },
        isPrimary && styles.primaryBase,
        isDestructive && styles.destructiveBase,
        HAS_LIQUID_GLASS && styles.nativeGlassBase,
        style,
      ]}
    >
      {/* 1. Backdrop blur */}
      {!HAS_LIQUID_GLASS && (
        <BlurView
          intensity={isPrimary ? 40 : 60}
          tint={isPrimary ? 'light' : 'dark'}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* 2. Native Glass Refraction */}
      <GlassView
        style={StyleSheet.absoluteFill}
        glassEffectStyle="regular"
        colorScheme="dark"
        tintColor={
          isPrimary
            ? HAS_LIQUID_GLASS ? 'rgba(255, 107, 0, 0.80)' : 'rgba(255, 107, 0, 0.40)'
            : isDestructive
            ? 'rgba(239, 68, 68, 0.20)'
            : 'rgba(255, 255, 255, 0.08)'
        }
        isInteractive
      />

      {/* 3. Specular and Color Gradient */}
      {!HAS_LIQUID_GLASS && <LinearGradient
        colors={
          isPrimary
            ? ['rgba(255, 125, 20, 0.95)', 'rgba(255, 60, 0, 0.90)']
            : isDestructive
            ? ['rgba(239, 68, 68, 0.25)', 'rgba(185, 28, 28, 0.15)']
            : ['rgba(255, 255, 255, 0.16)', 'rgba(255, 255, 255, 0.03)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />}

      {/* 4. Specular Top Highlight Light Reflection */}
      <View style={styles.topSpecular} pointerEvents="none" />

      {/* 5. Crisp Glass Rim Border */}
      <View
        style={[
          styles.rimBorder,
          isPrimary && styles.primaryRimBorder,
          isDestructive && styles.destructiveRimBorder,
        ]}
        pointerEvents="none"
      />

      {/* Content */}
      {loading ? (
        <ActivityIndicator
          color={isPrimary ? Colors.white : Colors.orange}
          size="small"
        />
      ) : children ? (
        children
      ) : (
        <View style={styles.contentRow}>
          {icon}
          {label ? (
            <Text
              style={[
                styles.label,
                { fontSize: sizeConfig.fontSize },
                isPrimary && styles.primaryLabel,
                isDestructive && styles.destructiveLabel,
                textStyle,
              ]}
            >
              {label}
            </Text>
          ) : null}
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14, 14, 18, 0.70)',
  },
  primaryBase: {
    backgroundColor: 'rgba(255, 107, 0, 0.40)',
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  destructiveBase: {
    backgroundColor: 'rgba(239, 68, 68, 0.10)',
  },
  nativeGlassBase: {
    backgroundColor: 'transparent',
  },
  topSpecular: {
    position: 'absolute',
    top: 0,
    left: '10%',
    right: '10%',
    height: 1.2,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 1,
  },
  rimBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  primaryRimBorder: {
    borderColor: 'rgba(255, 200, 150, 0.50)',
  },
  destructiveRimBorder: {
    borderColor: 'rgba(239, 68, 68, 0.40)',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 2,
  },
  label: {
    ...Typography.body,
    fontWeight: '600',
    color: Colors.white,
    letterSpacing: -0.2,
  },
  primaryLabel: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  destructiveLabel: {
    fontWeight: '700',
    color: '#FF6B6B',
  },
})
