import { isNative } from './platform'

/**
 * Тактильний зворотній зв'язок (вібрація) для iOS.
 * На веб — мовчазно ігнорується.
 *
 * Використання:
 *   import { haptic } from '../utils/haptics'
 *   <button onClick={() => { haptic.light(); doSomething() }}>
 */

let HapticsModule = null

async function getHaptics() {
  if (!isNative) return null
  if (HapticsModule) return HapticsModule
  try {
    const mod = await import('@capacitor/haptics')
    HapticsModule = mod
    return HapticsModule
  } catch {
    return null
  }
}

export const haptic = {
  // Легкий клік (кнопки, таби)
  light: async () => {
    const h = await getHaptics()
    if (h) await h.Haptics.impact({ style: h.ImpactStyle.Light })
  },

  // Середній клік (важливіші дії)
  medium: async () => {
    const h = await getHaptics()
    if (h) await h.Haptics.impact({ style: h.ImpactStyle.Medium })
  },

  // Сильний клік (деструктивні дії)
  heavy: async () => {
    const h = await getHaptics()
    if (h) await h.Haptics.impact({ style: h.ImpactStyle.Heavy })
  },

  // Успішна дія (? транзакція додана)
  success: async () => {
    const h = await getHaptics()
    if (h) await h.Haptics.notification({ type: 'SUCCESS' })
  },

  // Помилка (? щось пішло не так)
  error: async () => {
    const h = await getHaptics()
    if (h) await h.Haptics.notification({ type: 'ERROR' })
  },

  // Попередження
  warning: async () => {
    const h = await getHaptics()
    if (h) await h.Haptics.notification({ type: 'WARNING' })
  },
}
