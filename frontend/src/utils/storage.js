import { isNative } from './platform'

/**
 * Уніфіковане сховище: Capacitor Preferences на iOS, localStorage у браузері.
 * Дані в Supabase зберігати не потрібно — вони і так хмарні.
 * Цей модуль для локальних налаштувань (тема, мова, кеш тощо).
 *
 * Використання:
 *   await storage.set('theme', 'dark')
 *   const theme = await storage.get('theme')   // 'dark' або null
 *   await storage.remove('theme')
 */

let Preferences = null

async function getPreferences() {
  if (!isNative) return null
  if (Preferences) return Preferences
  try {
    const mod = await import('@capacitor/preferences')
    Preferences = mod.Preferences
    return Preferences
  } catch {
    return null
  }
}

export const storage = {
  async get(key) {
    const prefs = await getPreferences()
    if (prefs) {
      const { value } = await prefs.get({ key })
      return value
    }
    return localStorage.getItem(key)
  },

  async set(key, value) {
    const prefs = await getPreferences()
    if (prefs) {
      await prefs.set({ key, value: String(value) })
    } else {
      localStorage.setItem(key, value)
    }
  },

  async remove(key) {
    const prefs = await getPreferences()
    if (prefs) {
      await prefs.remove({ key })
    } else {
      localStorage.removeItem(key)
    }
  },
}
