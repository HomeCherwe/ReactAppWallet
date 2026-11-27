import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'

// What the app showed last time, so the next launch draws at once (like a bank's app) and the
// fresh numbers roll in a moment later. Kept per user, dropped on sign-out.

const PREFIX = 'launch_cache_v1:'
const MAX_AGE_MS = 14 * 864e5

export async function sessionUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.user?.id ?? null
  } catch {
    return null
  }
}

export async function readLaunchCache<T>(name: string, uid: string | null): Promise<T | null> {
  if (!uid) return null
  try {
    const raw = await AsyncStorage.getItem(PREFIX + name)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (v?.uid !== uid || typeof v.at !== 'number' || Date.now() - v.at > MAX_AGE_MS) return null
    return v.data as T
  } catch {
    return null
  }
}

export function writeLaunchCache(name: string, uid: string | null, data: unknown) {
  if (!uid) return
  AsyncStorage.setItem(PREFIX + name, JSON.stringify({ uid, at: Date.now(), data })).catch(() => {})
}

export async function clearLaunchCache() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(PREFIX))
    if (keys.length) await AsyncStorage.multiRemove(keys)
  } catch {}
}
