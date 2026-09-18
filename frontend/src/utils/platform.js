import { Capacitor } from '@capacitor/core'

/**
 * Чи запущено додаток нативно (iOS / Android)?
 * false = звичайний браузер
 */
export const isNative = Capacitor.isNativePlatform()

/**
 * Поточна платформа: 'ios' | 'android' | 'web'
 */
export const platform = Capacitor.getPlatform()

export const isIOS = platform === 'ios'
export const isAndroid = platform === 'android'
export const isWeb = platform === 'web'
