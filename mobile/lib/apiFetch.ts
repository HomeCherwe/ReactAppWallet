import { Platform } from 'react-native'
import { supabase } from './supabase'

// Get API base URL from env
export function getApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL
  if (envUrl) {
    return envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl
  }
  return 'http://192.168.1.18:8787'
}

// Get Supabase auth token
async function getAuthToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session?.access_token) return null
    return data.session.access_token
  } catch {
    return null
  }
}

// Universal fetch with auth + timeout
export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit & { signal?: AbortSignal } = {}
): Promise<T> {
  const token = await getAuthToken()
  const apiUrl = getApiUrl()

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${apiUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  // Short timeout so app falls back quickly if backend server is not running
  const timeoutId = setTimeout(() => controller.abort(), 3500)
  const signal = options.signal ?? controller.signal

  try {
    const response = await fetch(url, { ...options, headers, signal })
    clearTimeout(timeoutId)
    if (!response.ok) {
      let msg = `HTTP ${response.status}: ${response.statusText}`
      try { const e = await response.json(); msg = e.error || e.message || msg } catch { }
      throw new Error(msg)
    }
    try { return await response.json() as T } catch { return {} as T }
  } catch (error: any) {
    clearTimeout(timeoutId)
    throw error
  }
}