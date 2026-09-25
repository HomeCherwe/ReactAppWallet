import React, { useRef, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  Dimensions,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { GlassView } from 'expo-glass-effect'
import { LinearGradient } from 'expo-linear-gradient'
import { Colors, Radius, Typography } from '../constants/theme'

export interface NavTabItem {
  id: string
  icon: string
  label: string
}

export const NAV_TABS: NavTabItem[] = [
  { id: 'home', icon: '🏠', label: 'Головна' },
  { id: 'analytics', icon: '📊', label: 'Аналітика' },
  { id: 'cards', icon: '💳', label: 'Картки' },
  { id: 'settings', icon: '⚙️', label: 'Налаштування' },
]

interface LiquidGlassBottomNavProps {
  activeTab: string
  onTabChange: (tabId: string) => void
}

const INITIAL_WIDTH = Dimensions.get('window').width - 32

/**
 * Liquid Glass Bottom Navigation Dock:
 * Crafted in the authentic Black & Orange palette of the app.
 * Features:
 * - Deep dark liquid glass dock container (never white/gray)
 * - Animated sliding orange liquid glass pill indicator that smoothly glides between tabs
 * - Vertical icon + label layout where text NEVER truncates (no "..." anywhere)
 * - Specular reflection highlights, crisp rim borders and warm ambient glow
 */
export default function LiquidGlassBottomNav({
  activeTab,
  onTabChange,
}: LiquidGlassBottomNavProps) {
  const [dockWidth, setDockWidth] = useState(INITIAL_WIDTH)
  const activeIndex = Math.max(0, NAV_TABS.findIndex((t) => t.id === activeTab))

  const tabWidth = (dockWidth - 8) / NAV_TABS.length
  const pillWidth = tabWidth - 4

  const slideAnim = useRef(new Animated.Value(activeIndex * tabWidth)).current
  const pillScale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: activeIndex * tabWidth,
        tension: 90,
        friction: 9,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(pillScale, {
          toValue: 0.94,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.spring(pillScale, {
          toValue: 1,
          tension: 100,
          friction: 6,
          useNativeDriver: true,
        }),
      ]),
    ]).start()
  }, [activeIndex, tabWidth])

  return (
    <View style={styles.bottomNavOuter} pointerEvents="box-none">
      <View
        style={styles.dockContainer}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width
          if (w > 100 && Math.abs(w - dockWidth) > 2) {
            setDockWidth(w)
          }
        }}
      >
        {/* 1. Deep Black Liquid Glass Dock Base */}
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

        {/* 2. Native Glass Refraction Layer */}
        <GlassView
          style={StyleSheet.absoluteFill}
          glassEffectStyle="regular"
          colorScheme="dark"
          tintColor="rgba(255, 107, 0, 0.04)"
        />

        {/* 3. Subtle specular gradient over dock */}
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.09)', 'rgba(255, 255, 255, 0.01)']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
        />

        {/* 4. Top specular highlight rim line */}
        <View style={styles.dockSpecular} pointerEvents="none" />

        {/* 5. Crisp 1px glass dock border */}
        <View style={styles.dockBorder} pointerEvents="none" />

        {/* 6. Ambient warm orange glow */}
        <View style={styles.dockGlow} pointerEvents="none" />

        {/* 7. Animated Liquid Glass Orange Sliding Pill */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.slidingPill,
            {
              width: pillWidth,
              transform: [
                { translateX: slideAnim },
                { scale: pillScale },
              ],
            },
          ]}
        >
          <View style={styles.pillInner}>
            <BlurView intensity={45} tint="light" style={StyleSheet.absoluteFill} />
            <GlassView
              style={StyleSheet.absoluteFill}
              glassEffectStyle="regular"
              colorScheme="dark"
              tintColor="rgba(255, 107, 0, 0.40)"
              isInteractive
            />
            <LinearGradient
              colors={['rgba(255, 125, 20, 0.95)', 'rgba(255, 60, 0, 0.88)']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
            />
            {/* Pill specular reflection and border */}
            <View style={styles.pillSpecular} />
            <View style={styles.pillBorder} />
          </View>
        </Animated.View>

        {/* 8. Tab Buttons (Vertically stacked Icon + Label — Never Truncates) */}
        <View style={styles.tabsRow}>
          {NAV_TABS.map((tab, index) => {
            const isActive = index === activeIndex
            const isLongText = tab.label.length > 9

            return (
              <TouchableOpacity
                key={tab.id}
                style={styles.tabBtn}
                activeOpacity={0.75}
                onPress={() => onTabChange(tab.id)}
              >
                <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>
                  {tab.icon}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.tabLabel,
                    isLongText && styles.tabLabelCompact,
                    isActive && styles.tabLabelActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bottomNavOuter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 26 : 14,
    paddingHorizontal: 16,
    zIndex: 100,
  },
  dockContainer: {
    width: '100%',
    maxWidth: 420,
    height: 66,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(12, 12, 16, 0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 12,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  dockSpecular: {
    position: 'absolute',
    top: 0,
    left: '12%',
    right: '12%',
    height: 1.2,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 1,
  },
  dockBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  dockGlow: {
    position: 'absolute',
    bottom: -15,
    alignSelf: 'center',
    width: 160,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 107, 0, 0.22)',
  },
  slidingPill: {
    position: 'absolute',
    left: 6,
    top: 6,
    bottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  pillInner: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.50,
    shadowRadius: 10,
    elevation: 8,
  },
  pillSpecular: {
    position: 'absolute',
    top: 0,
    left: 8,
    right: 8,
    height: 1.2,
    backgroundColor: 'rgba(255, 220, 180, 0.65)',
    borderRadius: 1,
  },
  pillBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 180, 100, 0.55)',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    zIndex: 2,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    height: '100%',
  },
  tabIcon: {
    fontSize: 20,
    opacity: 0.55,
    marginBottom: 2,
  },
  tabIconActive: {
    opacity: 1,
    transform: [{ scale: 1.08 }],
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.55)',
    letterSpacing: -0.2,
  },
  tabLabelCompact: {
    fontSize: 10,
    letterSpacing: -0.3,
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
})
