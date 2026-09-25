import React from 'react'
import { Platform, StyleProp, ViewStyle } from 'react-native'
import { Button, ContextMenu, Host, RNHostView } from '@expo/ui/swift-ui'
import type { SFSymbol } from 'sf-symbols-typescript'
import { Colors } from '../constants/theme'

export interface ContextAction {
  label: string
  systemImage?: SFSymbol
  destructive?: boolean
  onPress: () => void
}

interface Props {
  actions: ContextAction[]
  children: React.ReactElement
  style?: StyleProp<ViewStyle>
}

/**
 * iOS: the system context menu on long press (lifted preview + blurred background + action list),
 * with the React Native content as the trigger. Elsewhere it renders the content as is — callers
 * keep their own onLongPress fallback for other platforms.
 */
export default function NativeContextMenu({ actions, children, style }: Props) {
  if (Platform.OS !== 'ios') return children

  return (
    <Host matchContents={{ vertical: true }} style={[{ width: '100%' }, style]} colorScheme="dark" seedColor={Colors.orange}>
      <ContextMenu>
        <ContextMenu.Items>
          {actions.map(a => (
            <Button
              key={a.label}
              label={a.label}
              systemImage={a.systemImage}
              role={a.destructive ? 'destructive' : undefined}
              onPress={a.onPress}
            />
          ))}
        </ContextMenu.Items>
        <ContextMenu.Trigger>
          <RNHostView matchContents>{children}</RNHostView>
        </ContextMenu.Trigger>
      </ContextMenu>
    </Host>
  )
}
