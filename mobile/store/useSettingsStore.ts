import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getPreferences, updatePreferences } from '../api/preferences'

type SettingsState = {
  settings: Record<string, any>
  loaded: boolean
  initialize: () => Promise<void>
  reset: () => void
  /** Preferences that came with another answer (Home's /api/home): no separate request */
  hydrate: (prefs: Record<string, any> | null | undefined) => void
  getNestedSetting: <T>(path: string, defaultValue: T) => T
  updateNestedSetting: (path: string, value: any) => void
}

function getNestedValue(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((acc: any, key: string) => acc?.[key], obj)
}

function setNestedValue(obj: Record<string, any>, path: string, value: any): Record<string, any> {
  const keys = path.split('.')
  const result = { ...obj }
  let current: Record<string, any> = result
  for (let i = 0; i < keys.length - 1; i++) {
    current[keys[i]] = { ...(current[keys[i]] || {}) }
    current = current[keys[i]]
  }
  current[keys[keys.length - 1]] = value
  return result
}

const STORAGE_KEY = 'wallet_settings'

let saveTimer: ReturnType<typeof setTimeout> | null = null
function debounceSave(settings: Record<string, any>) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
      await updatePreferences(settings)
    } catch (e) {
      console.error('[SettingsStore] save error:', e)
    }
  }, 800)
}

let initPromise: Promise<void> | null = null

// Home asks /api/home at launch, which brings the preferences too: wait a little for them before
// asking /api/preferences separately
let markHydrated: () => void = () => {}
let hydrated = new Promise<void>(resolve => (markHydrated = resolve))
const HYDRATE_WAIT_MS = 4000

async function loadSettings(set: (partial: Partial<SettingsState>) => void) {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY)
    if (cached) set({ settings: JSON.parse(cached) })
    const came = await Promise.race([
      hydrated.then(() => true),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), HYDRATE_WAIT_MS)),
    ])
    if (came) return
    const prefs = await getPreferences()
    if (prefs && Object.keys(prefs).length > 0) {
      set({ settings: prefs, loaded: true })
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } else {
      set({ loaded: true })
    }
  } catch {
    set({ loaded: true })
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  loaded: false,
  // Concurrent callers share one in-flight load
  initialize: () => {
    if (!initPromise) initPromise = loadSettings(set).finally(() => { initPromise = null })
    return initPromise
  },
  reset: () => {
    set({ settings: {}, loaded: false })
    hydrated = new Promise<void>(resolve => (markHydrated = resolve))
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {})
  },
  hydrate: prefs => {
    // A change of the user's is still being saved: keep it
    if (!prefs || Object.keys(prefs).length === 0 || saveTimer) return
    set({ settings: prefs, loaded: true })
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)).catch(() => {})
    markHydrated()
  },
  getNestedSetting: <T>(path: string, defaultValue: T): T => {
    const val = getNestedValue(get().settings, path)
    return val !== undefined ? (val as T) : defaultValue
  },
  updateNestedSetting: (path: string, value: any) => {
    const apply = () => {
      const newSettings = setNestedValue(get().settings, path, value)
      set({ settings: newSettings })
      debounceSave(newSettings)
    }
    // Saving before the remote preferences are loaded would overwrite them
    // (the save merges top-level keys), so load first.
    if (get().loaded) apply()
    else get().initialize().then(apply)
  },
}))
