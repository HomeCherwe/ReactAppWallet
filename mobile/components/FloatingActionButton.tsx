import React, { useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native'
import { Host, Menu, Button, Section, Image } from '@expo/ui/swift-ui'
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  frame,
  menuIndicator,
  menuStyle,
  shadow,
  tint,
} from '@expo/ui/swift-ui/modifiers'
import { BlurView } from 'expo-blur'
import { GlassView } from 'expo-glass-effect'
import { HAS_LIQUID_GLASS } from './LiquidGlass'
import { LinearGradient } from 'expo-linear-gradient'
import { Colors } from '../constants/theme'
import { triggerLightHaptic } from '../utils/haptics'

const FAB_SIZE = 64
// Label size inside the circular button; the button's own padding brings it to ~FAB_SIZE
const PLUS_BOX = 38

interface FloatingActionButtonProps {
  onPress: () => void
  onAddCard?: () => void
  onTransfer?: () => void
  onAddGoal?: () => void
  onScan?: () => void
  onLongPress?: () => void
  onLongPressFallback?: () => void
  /** Hidden without unmounting (the native menu host is costly to re-create) */
  hidden?: boolean
}

/**
 * Pinned Floating Action Button (Big Liquid Glass Orange Plus):
 * Sits pinned in the bottom right corner above the bottom navigation dock.
 * - Single Tap: Opens Add Transaction modal
 * - iOS: native SwiftUI Menu — tap adds a transaction, long-press opens the actions menu
 * - Long Press on Android/Web: Opens Liquid Glass quick actions popup
 * - Trigger appearance: 100% authentic Liquid Glass Black & Orange design with glowing radiant gradient
 */
export default function FloatingActionButton({
  onPress,
  onAddCard = () => {},
  onTransfer = () => {},
  onAddGoal = () => {},
  onScan = () => {},
  onLongPress,
  onLongPressFallback,
  hidden = false,
}: FloatingActionButtonProps) {
  const scale = useRef(new Animated.Value(1)).current

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.90,
      tension: 140,
      friction: 6,
      useNativeDriver: true,
    }).start()
  }

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      tension: 100,
      friction: 7,
      useNativeDriver: true,
    }).start()
  }

  const handleFallbackLongPress = () => {
    if (onLongPress) {
      onLongPress()
    } else if (onLongPressFallback) {
      onLongPressFallback()
    }
  }

  // Liquid Glass Button Component (Android/Web)
  const renderLiquidGlassButton = () => (
    <Animated.View style={{ transform: [{ scale }], backgroundColor: 'transparent' }}>
      <TouchableOpacity
        onPress={onPress}
        onLongPress={handleFallbackLongPress}
        delayLongPress={280}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.88}
        style={styles.fabBtn}
        accessibilityLabel="Додати транзакцію або відкрити меню"
        accessibilityRole="button"
      >
        {/* 1. Hardware Blur */}
        {!HAS_LIQUID_GLASS && <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />}

        {/* 2. Glass Refraction Effect */}
        <GlassView
          style={StyleSheet.absoluteFill}
          glassEffectStyle="regular"
          colorScheme="dark"
          tintColor={HAS_LIQUID_GLASS ? 'rgba(255, 107, 0, 0.85)' : 'rgba(255, 107, 0, 0.40)'}
          isInteractive
        />

        {/* 3. Radiant Orange Gradient (fallback only — would hide native Liquid Glass) */}
        {!HAS_LIQUID_GLASS && (
          <LinearGradient
            colors={['#FF7A00', '#FF3D00']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        )}

        {/* 4. Top Specular Reflection Line */}
        <View style={styles.topSpecular} pointerEvents="none" />

        {/* 5. Glowing Rim Border */}
        <View style={styles.rimBorder} pointerEvents="none" />

        {/* 6. Big Bold Crisp White Plus */}
        <Text style={styles.plusIcon}>+</Text>
      </TouchableOpacity>
    </Animated.View>
  )

  // 1. iOS: fully native SwiftUI Menu — tap = new transaction, long-press = actions menu.
  // No RN views inside SwiftUI, so touches and the glass press animation run natively.
  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.fabWrapper, hidden && styles.hidden]} pointerEvents={hidden ? 'none' : 'box-none'}>
        <Host style={styles.host} seedColor={Colors.orange} colorScheme="dark">
          <Menu
            label={
              <Image
                systemName="plus"
                size={26}
                color={Colors.orange}
                modifiers={[frame({ width: PLUS_BOX, height: PLUS_BOX })]}
              />
            }
            onPrimaryAction={() => {
              triggerLightHaptic()
              onPress()
            }}
            modifiers={[
              // The glass lives on the Menu's own button (not on the label), so the
              // iOS menu open/close morph keeps the circle instead of snapping to a square.
              menuStyle('button'),
              // Clear Liquid Glass so the content underneath shows through; orange lives on the plus
              buttonStyle(HAS_LIQUID_GLASS ? 'glass' : 'bordered'),
              buttonBorderShape('circle'),
              tint(Colors.orange),
              controlSize('large'),
              menuIndicator('hidden'),
              shadow({ radius: 12, y: 4, color: 'rgba(0, 0, 0, 0.35)' }),
            ]}
          >
            <Section>
              <Button label="Нова транзакція" systemImage="plus.circle.fill" onPress={onPress} />
            </Section>
            <Section title="Рахунки та операції">
              <Button
                label="Створити рахунок чи картку"
                systemImage="plus.rectangle.on.rectangle"
                onPress={onAddCard}
              />
              <Button
                label="Переказ між рахунками"
                systemImage="arrow.left.arrow.right"
                onPress={onTransfer}
              />
            </Section>
            <Section title="Скарбничка та інше">
              <Button label="Створити скарбничку" systemImage="archivebox.fill" onPress={onAddGoal} />
              <Button label="Сканувати QR або чек" systemImage="qrcode.viewfinder" onPress={onScan} />
            </Section>
          </Menu>
        </Host>
      </View>
    )
  }

  // 2. Cross-platform fallback for Android & Web
  return (
    <View style={[styles.fabWrapper, hidden && styles.hidden]} pointerEvents={hidden ? 'none' : 'box-none'}>
      <View style={styles.fabGlowContainer}>
        {renderLiquidGlassButton()}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  hidden: {
    opacity: 0,
  },
  fabWrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 90 : 90,
    right: Platform.OS === 'ios' ? 8 : 20,
    zIndex: 999,
  },
  fabGlowContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.65,
    shadowRadius: 18,
    elevation: 14,
  },
  host: {
    width: FAB_SIZE + 24,
    height: FAB_SIZE + 24,
  },
  fabBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B00',
  },
  topSpecular: {
    position: 'absolute',
    top: 0,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: 'rgba(255, 220, 180, 0.75)',
    borderRadius: 1,
  },
  rimBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 200, 140, 0.65)',
  },
  plusIcon: {
    fontSize: 34,
    fontWeight: '300',
    color: '#FFFFFF',
    marginTop: -2,
    zIndex: 2,
  },
})
