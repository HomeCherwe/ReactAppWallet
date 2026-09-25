import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiFetch } from '../lib/apiFetch'

// Revolut is connected through TrueLayer (Open Banking). Tokens live on the backend only.

export type RevolutStatus = 'connected' | 'disconnected' | 'expired'

const CONNECTED_KEY = 'revolut_connected'
const LAST_SYNC_KEY = 'revolut_last_sync'

/** Cached "is Revolut connected" flag, so app-open syncs don't have to ask the server first. */
export async function isRevolutConnectedCached(): Promise<boolean | null> {
  const v = await AsyncStorage.getItem(CONNECTED_KEY)
  return v === null ? null : v === '1'
}

async function setConnectedCache(connected: boolean) {
  await AsyncStorage.setItem(CONNECTED_KEY, connected ? '1' : '0')
}

export async function getLastRevolutSync(): Promise<Date | null> {
  const v = await AsyncStorage.getItem(LAST_SYNC_KEY)
  return v ? new Date(Number(v)) : null
}

export async function getRevolutStatus(): Promise<RevolutStatus> {
  const res = await apiFetch<{ connected: boolean; reason?: string }>('/api/truelayer/check-token')
  const status: RevolutStatus = res?.connected
    ? 'connected'
    : res?.reason === 'consent_expired'
    ? 'expired'
    : 'disconnected'
  await setConnectedCache(status === 'connected')
  return status
}

export type ConnectResult = { status: 'ok' } | { status: 'cancel' } | { status: 'error'; message: string }

/**
 * Opens TrueLayer in an in-app browser. After the bank login TrueLayer redirects to the backend,
 * which saves the tokens and bounces back to walletapp://truelayer?status=… — that closes the browser.
 */
export async function connectRevolut(): Promise<ConnectResult> {
  // walletapp://truelayer in the installed app, exp://…/--/truelayer in Expo Go
  const appRedirect = makeRedirectUri({ scheme: 'walletapp', path: 'truelayer' })
  const { url } = await apiFetch<{ url: string }>('/api/truelayer/mobile/start', {
    method: 'POST',
    body: JSON.stringify({ app_redirect: appRedirect }),
  })

  const result = await WebBrowser.openAuthSessionAsync(url, appRedirect)
  if (result.type !== 'success') return { status: 'cancel' }

  const query = result.url.split('?')[1] ?? ''
  const params = new URLSearchParams(query)
  if (params.get('status') === 'ok') {
    await setConnectedCache(true)
    return { status: 'ok' }
  }
  return { status: 'error', message: params.get('message') || 'unknown_error' }
}

export async function disconnectRevolut(): Promise<void> {
  await apiFetch('/api/truelayer/disconnect', { method: 'DELETE' })
  await setConnectedCache(false)
}

/**
 * Pulls new Revolut transactions into the DB. `user_present` tells the backend the user has the
 * app open, so the bank's limit of 4 unattended requests per day doesn't apply.
 * Returns the number of transactions added.
 */
export async function syncRevolut(): Promise<number> {
  // Sync talks to TrueLayer and inserts rows — allow more than the default request timeout
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45000)
  try {
    const res = await apiFetch<{ success: boolean; count?: number; error?: string; message?: string }>(
      '/api/syncTrueLayer',
      { method: 'POST', body: JSON.stringify({ user_present: true }), signal: controller.signal }
    )
    if (!res?.success) {
      // "not connected" / "re-authentication may be required" — stop auto-syncing until reconnected
      if (/not connected|re-authentication/i.test(`${res?.message ?? ''} ${res?.error ?? ''}`)) {
        await setConnectedCache(false)
      }
      throw new Error(res?.error || res?.message || 'Не вдалося синхронізувати Revolut')
    }
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()))
    return res.count ?? 0
  } finally {
    clearTimeout(timer)
  }
}
