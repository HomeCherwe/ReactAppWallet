import React, { useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ViewStyle,
  StyleProp,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { GlassView } from 'expo-glass-effect'
import { HAS_LIQUID_GLASS } from './LiquidGlass'
import { Colors, Radius, Typography } from '../constants/theme'

interface QuickActionButtonProps {
  icon: string
  label: string
  onPress: () => void
  accent?: boolean
  style?: StyleProp<ViewStyle>
}

export default function QuickActionButton({
  icon,
  label,
  onPress,
  accent = false,
  style,
}: QuickActionButtonProps) {
  const scale = useRef(new Animated.Value(1)).current

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.9,
      useNativeDriver: true,
      speed: 30,
      bounciness: 5,
    }).start()
  }

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start()
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      style={[styles.wrapper, style]}
    >
      <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
        <View style={styles.iconBoxOuter}>
          {/* Hardware blur */}
          {!HAS_LIQUID_GLASS && (
            <BlurView
              intensity={accent ? 40 : 55}
              tint={accent ? 'light' : 'dark'}
              style={StyleSheet.absoluteFill}
            />
          )}
          {/* Native Glass Refraction */}
          <GlassView
            style={StyleSheet.absoluteFill}
            glassEffectStyle="regular"
            colorScheme="dark"
            tintColor={accent ? (HAS_LIQUID_GLASS ? 'rgba(255, 107, 0, 0.80)' : 'rgba(255, 107, 0, 0.40)') : 'rgba(255, 255, 255, 0.06)'}
            isInteractive
          />
          {/* Specular Gradient */}
          {!HAS_LIQUID_GLASS && <LinearGradient
            colors={
              accent
                ? ['rgba(255, 125, 20, 0.95)', 'rgba(255, 60, 0, 0.90)']
                : ['rgba(255, 255, 255, 0.16)', 'rgba(255, 255, 255, 0.03)']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />}
          {/* Specular top rim line */}
          <View style={styles.specularTop} pointerEvents="none" />
          {/* Rim border */}
          <View
            style={[
              styles.rimBorder,
              accent ? styles.accentBorder : styles.glassBorder,
            ]}
            pointerEvents="none"
          />
          <Text style={styles.iconText}>{icon}</Text>
        </View>
        <Text style={[styles.label, accent && styles.accentLabel]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  iconBoxOuter: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  specularTop: {
    position: 'absolute',
    top: 0,
    left: '15%',
    right: '15%',
    height: 1.2,
    backgroundColor: 'rgba(255, 255, 255, 0.50)',
    borderRadius: 1,
  },
  rimBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  glassBorder: {
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  accentBorder: {
    borderColor: 'rgba(255, 200, 150, 0.50)',
  },
  iconText: {
    fontSize: 22,
    zIndex: 2,
  },
  label: {
    ...Typography.caption,
    color: Colors.textSub,
    fontWeight: '500',
  },
  accentLabel: {
    color: Colors.white,
    fontWeight: '600',
  },
})
