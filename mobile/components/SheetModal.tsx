import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native'
import { initialWindowMetrics } from 'react-native-safe-area-context'
import { InsideGlassContext } from './LiquidGlass'

interface SheetModalProps {
  visible: boolean
  onClose: () => void
  sheetStyle?: StyleProp<ViewStyle>
  /** Called once the slide-in finishes (e.g. to focus an input without fighting the animation) */
  onOpened?: () => void
  children: React.ReactNode
}

/**
 * Bottom sheet on a transparent Modal.
 * The backdrop fades while only the sheet slides (native-driver animations),
 * and the sheet has a solid background (stable while the keyboard animates).
 * Dragging the grab handle at the top moves the whole sheet; pulling it far enough closes it.
 */

// Release further than this (px) or faster than this (px/ms) to dismiss
const DISMISS_DISTANCE = 120
const DISMISS_VELOCITY = 0.8

// Sheets never reach into the status bar / Dynamic Island area, where iOS swallows
// touches — otherwise the grab handle of a tall sheet can't be grabbed
const TOP_INSET = Platform.OS === 'ios' ? initialWindowMetrics?.insets.top ?? 47 : 24
const TOP_CLEARANCE = TOP_INSET + 16

function resolveMaxHeight(value: unknown, screenHeight: number): number {
  const cap = screenHeight - TOP_CLEARANCE
  if (typeof value === 'number') return Math.min(value, cap)
  if (typeof value === 'string' && value.endsWith('%')) {
    return Math.min((parseFloat(value) / 100) * screenHeight, cap)
  }
  return cap
}
export default function SheetModal({
  visible,
  onClose,
  sheetStyle,
  onOpened,
  children,
}: SheetModalProps) {
  const { height } = useWindowDimensions()
  const [mounted, setMounted] = useState(visible)
  const progress = useRef(new Animated.Value(0)).current
  const opening = useRef(false)
  // Finger offset while swiping the sheet down (0 = resting)
  const dragY = useRef(new Animated.Value(0)).current
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // Dismissed from inside (drag / backdrop): the sheet slides away first, and only then the
  // parent is told — its re-render no longer lands in the middle of the animation (the micro-lag)
  const closingRef = useRef(false)
  const heightRef = useRef(height)
  heightRef.current = height

  const dismiss = () => {
    if (closingRef.current) return
    closingRef.current = true
    Keyboard.dismiss()
    Animated.timing(dragY, {
      toValue: heightRef.current,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      onCloseRef.current()
      // Safety: if the parent kept the sheet open, bring it back
      setTimeout(() => {
        if (closingRef.current) {
          closingRef.current = false
          Animated.spring(dragY, { toValue: 0, damping: 20, stiffness: 300, useNativeDriver: true }).start()
        }
      }, 800)
    })
  }
  const dismissRef = useRef(dismiss)
  dismissRef.current = dismiss

  const panResponder = useRef(
    PanResponder.create({
      // Attached only to the grab handle, so it owns every touch that starts there;
      // the sheet's content (scrolling, keypad, chips) is never intercepted
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => Keyboard.dismiss(),
      onPanResponderMove: (_, g) => dragY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          dismissRef.current()
        } else {
          Animated.spring(dragY, { toValue: 0, damping: 20, stiffness: 300, useNativeDriver: true }).start()
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, { toValue: 0, damping: 20, stiffness: 300, useNativeDriver: true }).start()
      },
    })
  ).current

  useEffect(() => {
    if (visible) {
      // The slide-in starts once the sheet is actually on screen (onShow / first layout) —
      // starting earlier drops the first frames while the modal is still being created.
      opening.current = false
      closingRef.current = false
      dragY.setValue(0)
      setMounted(true)
    } else if (mounted && closingRef.current) {
      // Already slid away (drag / backdrop): just remove it
      closingRef.current = false
      setMounted(false)
      progress.setValue(0)
      dragY.setValue(0)
    } else if (mounted) {
      Animated.timing(progress, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setMounted(false)
          dragY.setValue(0)
        }
      })
    }
  }, [visible])

  // Triggered by whichever comes first: Modal onShow or the sheet's first layout
  // (onShow isn't reliably delivered on the new architecture).
  const animateIn = () => {
    if (opening.current) return
    opening.current = true
    Animated.spring(progress, {
      toValue: 1,
      damping: 26,
      stiffness: 260,
      mass: 0.9,
      overshootClamping: true,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onOpened?.()
    })
  }

  const translateY = Animated.add(
    progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }),
    dragY
  )
  // Backdrop lightens as the sheet is dragged down
  const backdropOpacity = Animated.multiply(
    progress,
    dragY.interpolate({ inputRange: [0, height * 0.6], outputRange: [1, 0], extrapolate: 'clamp' })
  )
  const { backgroundColor: _ignoredBg, maxHeight, ...sheetFlat } = StyleSheet.flatten(sheetStyle) ?? {}
  const sheetMaxHeight = resolveMaxHeight(maxHeight, height)

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onShow={animateIn}
      onRequestClose={dismiss}
    >
      {/* Backdrop sits outside the keyboard-avoiding layout, so the keyboard never resizes it */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.wrap}
        pointerEvents="box-none"
      >
        <Animated.View
          onLayout={animateIn}
          style={[
            styles.sheet,
            sheetFlat,
            // Solid fill: a glass sheet re-samples what's behind it and flickers
            // when the keyboard animates in, leaving the sheet see-through
            styles.sheetFill,
            // The grab zone provides the top spacing
            { paddingTop: 0, maxHeight: sheetMaxHeight },
            { transform: [{ translateY }] },
          ]}
        >
          <View style={styles.sheetBorder} pointerEvents="none" />
          {/* Grab handle — the only drag zone */}
          <View {...panResponder.panHandlers} style={styles.grabZone}>
            <View style={styles.handle} />
          </View>
          <InsideGlassContext.Provider value={true}>
            {children}
          </InsideGlassContext.Provider>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheetFill: {
    backgroundColor: '#141418',
  },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  grabZone: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.30)',
  },
  sheetBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
})
