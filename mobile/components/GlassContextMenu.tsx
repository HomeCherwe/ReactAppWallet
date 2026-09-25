import React, { useRef } from 'react'
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { MenuAction, MenuFrame, menuDragHandlers, openMenu } from '../store/useMenuOverlay'

export type { MenuAction, MenuFrame }

interface Props {
  actions: MenuAction[]
  /** Optional header inside the menu (e.g. the bank's status) */
  title?: string
  subtitle?: string
  onPress?: () => void
  style?: StyleProp<ViewStyle>
  /** Row content; also drawn lifted above the dimmed screen while the menu is open */
  children: React.ReactNode
}

/**
 * Long press → the app's glass menu for this row (see MenuOverlayHost): keep holding and slide
 * to an item, or lift and tap. Tap → onPress.
 */
export default function GlassContextMenu({ actions, title, subtitle, onPress, style, children }: Props) {
  const ref = useRef<View>(null)

  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      onLongPress={() =>
        ref.current?.measureInWindow((x, y, w, h) =>
          openMenu({ frame: { x, y, w, h }, actions, title, subtitle, preview: children, previewStyle: style })
        )
      }
      delayLongPress={320}
      style={({ pressed }) => [style, pressed && styles.pressed]}
      {...menuDragHandlers}
    >
      {children}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.85,
  },
})
