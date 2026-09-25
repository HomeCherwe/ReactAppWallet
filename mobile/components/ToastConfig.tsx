import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ToastConfig, ToastConfigParams } from 'react-native-toast-message'
import { Colors } from '../constants/theme'
import { GlassSurface } from './LiquidGlass'

const KINDS = {
  success: { icon: '✓', color: Colors.green, tint: 'rgba(34, 197, 94, 0.18)' },
  error: { icon: '!', color: '#FF5A5F', tint: 'rgba(239, 68, 68, 0.18)' },
  info: { icon: 'i', color: Colors.orange, tint: 'rgba(255, 107, 0, 0.18)' },
} as const

function AppToast({ kind, text1, text2, onPress }: ToastConfigParams<any> & { kind: keyof typeof KINDS }) {
  const k = KINDS[kind]
  return (
    <Pressable style={styles.toast} onPress={onPress}>
      <GlassSurface borderRadius={20} tintColor="rgba(20, 20, 24, 0.55)" />
      <View style={[styles.icon, { backgroundColor: k.tint }]}>
        <Text style={[styles.iconText, { color: k.color }]}>{k.icon}</Text>
      </View>
      <View style={styles.texts}>
        {!!text1 && (
          <Text style={styles.title} numberOfLines={2}>
            {text1}
          </Text>
        )}
        {!!text2 && (
          <Text style={styles.sub} numberOfLines={3}>
            {text2}
          </Text>
        )}
      </View>
    </Pressable>
  )
}

/** Dark glass toasts matching the app (instead of the library's white ones). */
export const toastConfig: ToastConfig = {
  success: p => <AppToast {...p} kind="success" />,
  error: p => <AppToast {...p} kind="error" />,
  info: p => <AppToast {...p} kind="info" />,
}

const styles = StyleSheet.create({
  toast: {
    width: '92%',
    maxWidth: 440,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    backgroundColor: 'rgba(22, 22, 26, 0.72)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 16,
    fontWeight: '900',
  },
  texts: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
  sub: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.white60,
    marginTop: 2,
  },
})
