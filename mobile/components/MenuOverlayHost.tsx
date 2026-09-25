import React, { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Colors } from '../constants/theme'
import { triggerLightHaptic, triggerMediumHaptic, triggerSelectionHaptic } from '../utils/haptics'
import { MenuRequest, closeMenu, setMenuPickHandler, useMenuOverlay } from '../store/useMenuOverlay'
import { GlassSurface } from './LiquidGlass'
import Icon from './Icon'

// Same look as the + button's native iOS menu: glass panel, white labels, icons on the right,
// destructive actions in their own section
const MENU_W = 250
const ITEM_H = 48
const HEADER_H = 44
const SECTION_GAP = 8
const IOS_RED = '#FF453A'

/** A section gap goes before the first destructive item that follows normal ones. */
const gapBefore = (m: MenuRequest, i: number) =>
  i > 0 && !!m.actions[i].destructive && !m.actions[i - 1].destructive
// Time for the menu to fade before the action presents something (iOS can't present over it)
const ACTION_DELAY_MS = 200

/** Where the menu goes: under the row, or above it when there's no room below. */
function layoutFor(m: MenuRequest, screenW: number, screenH: number) {
  const f = m.frame
  const gaps = m.actions.filter((_, i) => gapBefore(m, i)).length
  const itemsH = m.actions.length * ITEM_H + gaps * SECTION_GAP + (m.title ? HEADER_H : 0)
  const below = f.y + f.h + 12 + itemsH < screenH - 40
  const top = below ? f.y + f.h + 12 : Math.max(50, f.y - 12 - itemsH)
  const left = Math.min(Math.max(16, f.x + f.w - MENU_W), screenW - MENU_W - 16)
  let y = top + (m.title ? HEADER_H : 0)
  const rects = m.actions.map((_, i) => {
    if (gapBefore(m, i)) y += SECTION_GAP
    const r = { x: left, w: MENU_W, y, h: ITEM_H }
    y += ITEM_H
    return r
  })
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
        <GlassSurface borderRadius={26} />
        {m.title ? (
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{m.title}</Text>
            {m.subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{m.subtitle}</Text> : null}
          </View>
        ) : null}
        {m.actions.map((a, i) => {
          const active = highlight === i
          const gap = gapBefore(m, i)
          return (
            <React.Fragment key={a.label}>
              {gap && <View style={styles.sectionGap} />}
              <Pressable
                onPress={() => {
                  triggerLightHaptic()
                  pick(i)
                }}
                style={({ pressed }) => [styles.item, i > 0 && !gap && styles.itemBorder, (pressed || active) && styles.itemActive]}
              >
                <Text style={[styles.itemText, a.destructive && { color: IOS_RED }]} numberOfLines={1}>
                  {a.label}
                </Text>
                <Icon name={a.icon} size={19} color={a.destructive ? IOS_RED : Colors.orange} strokeWidth={1.9} />
              </Pressable>
            </React.Fragment>
          )
        })}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  lifted: {
    position: 'absolute',
    backgroundColor: '#1C1C20',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  // iOS menu: glass panel (a dark material behind it where Liquid Glass isn't available)
  menu: {
    position: 'absolute',
    width: MENU_W,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: 'rgba(38, 38, 42, 0.78)',
  },
  header: {
    height: HEADER_H,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(235, 235, 245, 0.6)',
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(235, 235, 245, 0.45)',
    marginTop: 1,
  },
  item: {
    height: ITEM_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
  },
  itemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  itemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  sectionGap: {
    height: SECTION_GAP,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  itemText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '400',
    color: Colors.white,
    letterSpacing: -0.2,
  },
})
