import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { Colors } from '../constants/theme'
import { triggerLightHaptic, triggerMediumHaptic } from '../utils/haptics'
import { GlassSurface } from './LiquidGlass'
import Icon, { IconName } from './Icon'

export interface MenuAction {
  label: string
  icon: IconName
  destructive?: boolean
  onPress: () => void
}

interface Props {
  actions: MenuAction[]
  /** Optional header inside the menu (e.g. the bank's status) */
  title?: string
  subtitle?: string
  onPress?: () => void
  style?: StyleProp<ViewStyle>
  /** Row content; rendered again, lifted, above the blurred screen while the menu is open */
  children: React.ReactNode
}

const MENU_W = 264
// Time for the menu to fade out before an action presents something else (iOS)
const CLOSE_MS = 320

export interface MenuFrame {
  x: number
  y: number
  w: number
  h: number
}

interface OverlayProps {
  /** Where the pressed row is on screen; null = closed */
  frame: MenuFrame | null
  actions: MenuAction[]
  title?: string
  subtitle?: string
  /** Style for the lifted copy of the row */
  previewStyle?: StyleProp<ViewStyle>
  /** The row, drawn lifted above the blurred screen */
  preview: React.ReactNode
  onClose: () => void
}

/**
 * The open menu: blurred screen, the row lifted, a glass menu in the app's colors next to it.
 * Controlled by `frame`, so any row (a bank, a transaction) can open it after measuring itself.
 */
export function GlassMenuOverlay({ frame, actions, title, subtitle, previewStyle, preview, onClose }: OverlayProps) {
  const { width: screenW, height: screenH } = useWindowDimensions()
  const anim = useRef(new Animated.Value(0)).current
  const [shown, setShown] = useState<MenuFrame | null>(null)

  useEffect(() => {
    if (!frame) return
    triggerMediumHaptic()
    setShown(frame)
    anim.setValue(0)
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 7 }).start()
  }, [frame])

  const close = (after?: () => void) => {
    Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      setShown(null)
      onClose()
    })
    // Let the menu's modal go away before an action presents something (iOS)
    if (after) setTimeout(after, CLOSE_MS)
  }

  const f = shown
  // Menu under the row, or above it when there's no room below
  const itemsH = actions.length * 50 + (title ? 58 : 0) + 12
  const below = f ? f.y + f.h + 12 + itemsH < screenH - 40 : true
  const menuTop = f ? (below ? f.y + f.h + 12 : Math.max(50, f.y - 12 - itemsH)) : 0
  const menuLeft = f ? Math.min(Math.max(16, f.x + f.w - MENU_W), screenW - MENU_W - 16) : 0

  const liftScale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] })
  const menuScale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] })

  return (
    <Modal visible={!!f} transparent animationType="none" onRequestClose={() => close()} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()}>
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.dim]} />
        </Pressable>
      </Animated.View>

      {f && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              previewStyle,
              styles.lifted,
              { left: f.x, top: f.y, width: f.w, height: f.h, opacity: anim, transform: [{ scale: liftScale }] },
            ]}
          >
            {preview}
          </Animated.View>

          <Animated.View
            style={[
              styles.menu,
              { left: menuLeft, top: menuTop, opacity: anim, transform: [{ translateY: below ? -8 : 8 }, { scale: menuScale }] },
            ]}
          >
            <GlassSurface borderRadius={22} tintColor="rgba(24, 16, 10, 0.55)" />
            {title ? (
              <View style={styles.header}>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
              </View>
            ) : null}
            {actions.map((a, i) => (
              <Pressable
                key={a.label}
                onPress={() => {
                  triggerLightHaptic()
                  close(a.onPress)
                }}
                style={({ pressed }) => [styles.item, (i > 0 || !!title) && styles.itemBorder, pressed && styles.itemPressed]}
              >
                <Text style={[styles.itemText, a.destructive && styles.itemTextDanger]}>{a.label}</Text>
                <View style={[styles.itemIcon, a.destructive && styles.itemIconDanger]}>
                  <Icon name={a.icon} size={17} color={a.destructive ? '#FF6B6B' : Colors.orange} strokeWidth={2.2} />
                </View>
              </Pressable>
            ))}
          </Animated.View>
        </>
      )}
    </Modal>
  )
}

/**
 * Long press → GlassMenuOverlay for this row. Tap → onPress.
 */
export default function GlassContextMenu({ actions, title, subtitle, onPress, style, children }: Props) {
  const ref = useRef<View>(null)
  const [frame, setFrame] = useState<MenuFrame | null>(null)

  return (
    <>
      <Pressable
        ref={ref}
        onPress={onPress}
        onLongPress={() => ref.current?.measureInWindow((x, y, w, h) => setFrame({ x, y, w, h }))}
        delayLongPress={320}
        style={({ pressed }) => [style, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
      <GlassMenuOverlay
        frame={frame}
        actions={actions}
        title={title}
        subtitle={subtitle}
        previewStyle={style}
        preview={children}
        onClose={() => setFrame(null)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.85,
  },
  dim: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  lifted: {
    position: 'absolute',
    backgroundColor: '#1B1A1E',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.45)',
    shadowColor: Colors.orange,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  menu: {
    position: 'absolute',
    width: MENU_W,
    borderRadius: 22,
    overflow: 'hidden',
    paddingVertical: 6,
    backgroundColor: 'rgba(22, 18, 16, 0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 140, 58, 0.35)',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.white,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.white60,
    marginTop: 2,
  },
  item: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  itemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.10)',
  },
  itemPressed: {
    backgroundColor: 'rgba(255, 107, 0, 0.14)',
  },
  itemText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  itemTextDanger: {
    color: '#FF6B6B',
  },
  itemIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 107, 0, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIconDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
  },
})
