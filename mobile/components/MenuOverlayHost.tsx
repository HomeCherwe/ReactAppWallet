import React, { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Colors } from '../constants/theme'
import { triggerLightHaptic, triggerMediumHaptic, triggerSelectionHaptic } from '../utils/haptics'
import { MenuRequest, closeMenu, setMenuPickHandler, useMenuOverlay } from '../store/useMenuOverlay'
import { GlassSurface } from './LiquidGlass'
import Icon from './Icon'

const MENU_W = 264
const ITEM_H = 50
const HEADER_H = 58
// Time for the menu to fade before the action presents something (iOS can't present over it)
const ACTION_DELAY_MS = 200

/** Where the menu goes: under the row, or above it when there's no room below. */
function layoutFor(m: MenuRequest, screenW: number, screenH: number) {
  const f = m.frame
  const itemsH = m.actions.length * ITEM_H + (m.title ? HEADER_H : 0) + 12
  const below = f.y + f.h + 12 + itemsH < screenH - 40
  const top = below ? f.y + f.h + 12 : Math.max(50, f.y - 12 - itemsH)
  const left = Math.min(Math.max(16, f.x + f.w - MENU_W), screenW - MENU_W - 16)
  const firstItemTop = top + 6 + (m.title ? HEADER_H : 0)
  const rects = m.actions.map((_, i) => ({ x: left, w: MENU_W, y: firstItemTop + i * ITEM_H, h: ITEM_H }))
  return { below, top, left, rects }
}

/**
 * Root-level long-press menu (see useMenuOverlay): dims the screen a little, lifts the row and
 * shows a glass menu. Items follow the finger (slide and lift to pick) or can be tapped.
 */
export default function MenuOverlayHost() {
  const menu = useMenuOverlay(s => s.menu)
  const highlight = useMenuOverlay(s => s.highlight)
  const { width: screenW, height: screenH } = useWindowDimensions()
  const anim = useRef(new Animated.Value(0)).current
  // Kept while fading out
  const [shown, setShown] = useState<MenuRequest | null>(null)

  useEffect(() => {
    if (menu) {
      triggerMediumHaptic()
      setShown(menu)
      anim.setValue(0)
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start()
    } else if (shown) {
      Animated.timing(anim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setShown(null))
    }
  }, [menu])

  // Item rects on screen, so the finger can be followed
  useEffect(() => {
    if (menu) useMenuOverlay.setState({ itemRects: layoutFor(menu, screenW, screenH).rects })
  }, [menu, screenW, screenH])

  // Selection tick while sliding over items
  const lastHighlight = useRef<number | null>(null)
  useEffect(() => {
    if (highlight != null && highlight !== lastHighlight.current) triggerSelectionHaptic()
    lastHighlight.current = highlight
  }, [highlight])

  const pick = (i: number) => {
    const action = useMenuOverlay.getState().menu?.actions[i]
    closeMenu()
    if (action) setTimeout(action.onPress, ACTION_DELAY_MS)
  }
  const pickRef = useRef(pick)
  pickRef.current = pick
  useEffect(() => {
    setMenuPickHandler(i => pickRef.current(i))
    return () => setMenuPickHandler(null)
  }, [])

  const m = shown
  if (!m) return null

  const f = m.frame
  const { below, top: menuTop, left: menuLeft } = layoutFor(m, screenW, screenH)

  const liftScale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] })
  const menuScale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] })

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={menu ? 'auto' : 'none'}>
      {/* Screen dims a little */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          m.previewStyle,
          styles.lifted,
          { left: f.x, top: f.y, width: f.w, height: f.h, opacity: anim, transform: [{ scale: liftScale }] },
        ]}
      >
        {m.preview}
      </Animated.View>

      <Animated.View
        style={[
          styles.menu,
          { left: menuLeft, top: menuTop, opacity: anim, transform: [{ translateY: below ? -6 : 6 }, { scale: menuScale }] },
        ]}
      >
        <GlassSurface borderRadius={22} tintColor="rgba(24, 16, 10, 0.55)" />
        {m.title ? (
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{m.title}</Text>
            {m.subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{m.subtitle}</Text> : null}
          </View>
        ) : null}
        {m.actions.map((a, i) => {
          const active = highlight === i
          return (
            <Pressable
              key={a.label}
              onPress={() => {
                triggerLightHaptic()
                pick(i)
              }}
              style={({ pressed }) => [
                styles.item,
                (i > 0 || !!m.title) && styles.itemBorder,
                (pressed || active) && (a.destructive ? styles.itemActiveDanger : styles.itemActive),
              ]}
            >
              <Text style={[styles.itemText, a.destructive && styles.itemTextDanger]}>{a.label}</Text>
              <View style={[styles.itemIcon, a.destructive && styles.itemIconDanger, active && styles.itemIconActive]}>
                <Icon name={a.icon} size={17} color={a.destructive ? '#FF6B6B' : Colors.orange} strokeWidth={2.2} />
              </View>
            </Pressable>
          )
        })}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
    backgroundColor: 'rgba(22, 18, 16, 0.86)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 140, 58, 0.35)',
  },
  header: {
    height: HEADER_H,
    justifyContent: 'center',
    paddingHorizontal: 16,
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
    height: ITEM_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  itemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.10)',
  },
  itemActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.20)',
  },
  itemActiveDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
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
  itemIconActive: {
    transform: [{ scale: 1.1 }],
  },
  itemIconDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
  },
})
