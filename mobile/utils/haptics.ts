import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'

export function triggerLightHaptic() {
  if (Platform.OS === 'web') return
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}

export function triggerMediumHaptic() {
  if (Platform.OS === 'web') return
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
}

export function triggerSuccessHaptic() {
  if (Platform.OS === 'web') return
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
}

export function triggerErrorHaptic() {
  if (Platform.OS === 'web') return
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
}

/** Tick when moving between options (menu items under the finger) */
export function triggerSelectionHaptic() {
  if (Platform.OS === 'web') return
  Haptics.selectionAsync().catch(() => {})
}

/** Strong, solid tap (the big + button) */
export function triggerHeavyHaptic() {
  if (Platform.OS === 'web') return
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {})
}
