import React from 'react'
import { StyleProp, ViewStyle } from 'react-native'
import { create } from 'zustand'
import type { IconName } from '../components/Icon'

export interface MenuAction {
  label: string
  icon: IconName
  destructive?: boolean
  /** The AI's item: drawn with its running colorful contour */
  ai?: boolean
  onPress: () => void
}

export interface MenuFrame {
  x: number
  y: number
  w: number
  h: number
}

export interface MenuRequest {
  frame: MenuFrame
  actions: MenuAction[]
  title?: string
  subtitle?: string
  preview: React.ReactNode
  previewStyle?: StyleProp<ViewStyle>
}

interface MenuState {
  menu: MenuRequest | null
  /** Finger still down since the long press: moving it highlights items, lifting picks one */
  dragging: boolean
  /** Index of the item under the finger */
  highlight: number | null
  /** Item rects on screen, reported by the host after layout */
  itemRects: { y: number; h: number; x: number; w: number }[]
  /** Mounted hosts, oldest first: only the newest draws the menu (a sheet's host sits above the root's) */
  hosts: number[]
}

/**
 * One long-press menu for the whole app, drawn by <MenuOverlayHost/> at the root (not a Modal),
 * so the finger that opened it keeps its touch and can slide over the items, like the + button.
 */
export const useMenuOverlay = create<MenuState>(() => ({
  menu: null,
  dragging: false,
  highlight: null,
  itemRects: [],
  hosts: [],
}))

export function openMenu(req: MenuRequest) {
  useMenuOverlay.setState({ menu: req, dragging: true, highlight: null, itemRects: [] })
}

export function closeMenu() {
  useMenuOverlay.setState({ menu: null, dragging: false, highlight: null })
}

// Each host's pick (runs the item's action after the menu has faded out); the newest host's is used
const pickers = new Map<number, (index: number) => void>()
let nextHostId = 1
export const newMenuHostId = () => nextHostId++
export function addMenuHost(id: number, pick: (index: number) => void): () => void {
  pickers.set(id, pick)
  useMenuOverlay.setState(s => ({ hosts: [...s.hosts, id] }))
  return () => {
    pickers.delete(id)
    useMenuOverlay.setState(s => ({ hosts: s.hosts.filter(h => h !== id) }))
  }
}
const topHost = () => {
  const hosts = useMenuOverlay.getState().hosts
  return hosts[hosts.length - 1]
}

/** Finger moved (page coordinates) while still holding after the long press. */
export function menuPointerMove(x: number, y: number) {
  const s = useMenuOverlay.getState()
  if (!s.menu || !s.dragging) return
  const i = s.itemRects.findIndex(r => y >= r.y && y <= r.y + r.h && x >= r.x - 24 && x <= r.x + r.w + 24)
  const next = i >= 0 ? i : null
  if (next !== s.highlight) useMenuOverlay.setState({ highlight: next })
}

/** Finger lifted: picks the highlighted item; otherwise the menu stays open for a tap. */
export function menuPointerUp() {
  const s = useMenuOverlay.getState()
  if (!s.menu || !s.dragging) return
  useMenuOverlay.setState({ dragging: false })
  if (s.highlight != null) pickers.get(topHost())?.(s.highlight)
}

/** Touch handlers for the row that opened the menu (raw touch events keep flowing to it). */
export const menuDragHandlers = {
  onTouchMove: (e: { nativeEvent: { pageX: number; pageY: number } }) =>
    menuPointerMove(e.nativeEvent.pageX, e.nativeEvent.pageY),
  onTouchEnd: () => menuPointerUp(),
  onTouchCancel: () => useMenuOverlay.setState({ dragging: false }),
}
