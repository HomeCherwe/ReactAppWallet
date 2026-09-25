import { apiFetch } from '../lib/apiFetch'
import { supabase } from '../lib/supabase'

export interface UserPreferences {
  dashboard?: {
    showUsdtInChart?: boolean
    pinnedCategories?: string[]
  }
  [key: string]: any
}

export async function getPreferences(): Promise<UserPreferences> {
  try {
    return await apiFetch<UserPreferences>('/api/preferences')
  } catch {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return {}
      const { data, error } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', user.id)
        .maybeSingle()
      if (error || !data) return {}
      return (data.preferences || {}) as UserPreferences
    } catch {
      return {}
    }
  }
}

export async function updatePreferences(prefs: Partial<UserPreferences>): Promise<void> {
  try {
    await apiFetch('/api/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ updates: prefs }),
    })
  } catch {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: existing } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', user.id)
        .maybeSingle()

      const merged = { ...(existing?.preferences || {}), ...prefs }
      await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          preferences: merged,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
    } catch (e) {
      console.warn('Direct supabase preferences fallback update failed:', e)
    }
  }
}

export async function updatePreferencesSection(
  section: string,
  data: Record<string, any>
): Promise<void> {
  try {
    await apiFetch('/api/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ updates: { [section]: data } }),
    })
  } catch {
    await updatePreferences({ [section]: data })
  }
}

export async function getUserAPIs(): Promise<Record<string, string>> {
  try {
    return await apiFetch<Record<string, string>>('/api/preferences/apis')
  } catch {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return {}
      const { data } = await supabase
        .from('user_preferences')
        .select('binance_api, monobank_api, revolut_api')
        .eq('user_id', user.id)
        .maybeSingle()
      return (data || {}) as Record<string, string>
    } catch {
      return {}
    }
  }
}

export async function saveUserAPI(key: string, value: string): Promise<void> {
  try {
    await apiFetch('/api/preferences/apis', {
      method: 'POST',
      body: JSON.stringify({ apis: { [key]: value } }),
    })
  } catch {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        [key]: value,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
  }
}

export async function getApiKey(): Promise<string | null> {
  try {
    const data = await apiFetch<{ api_key?: string; key?: string }>('/api/api-key')
    return data?.api_key || data?.key || null
  } catch {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle()
    return data?.preferences?.api_key || null
  }
}

export async function generateApiKey(): Promise<string> {
  try {
    const data = await apiFetch<{ api_key?: string; key?: string }>('/api/generate-api-key', { method: 'POST' })
    return (data.api_key || data.key || '') as string
  } catch {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not logged in')
    const key = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
    const { data: existing } = await supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle()
    const merged = { ...(existing?.preferences || {}), api_key: key }
    await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        preferences: merged,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    return key
  }
}