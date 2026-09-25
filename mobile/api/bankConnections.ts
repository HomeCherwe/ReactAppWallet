import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiFetch } from '../lib/apiFetch'

// Banks connected through TrueLayer (Revolut, Wise, BNP, Monzo, …). Tokens stay on the backend.

export interface BankProvider {
  provider_id: string
  name: string
  logo: string | null
  country: string
  /** 'token': connected with a personal token (Monobank) instead of a bank login */
  auth?: 'token'
}

export interface BankConnection {
  id: string
  provider_id: string
  provider_name: string
  provider_logo: string | null
  country: string | null
  auth?: 'token' | 'redirect'
  status: 'active' | 'expired' | 'error'
  consent_expires_at: string | null
  last_sync_at: string | null
  last_error: string | null
  accounts: { account_id: string; kind: 'account' | 'card'; display_name: string | null; currency: string | null; card_id: string | null }[]
}

export interface BankSyncResult {
  added: number
  results: { id: string; provider_name: string; added: number; error?: string }[]
}

const HAS_BANKS_KEY = 'bank_connections_active'
const LAST_SYNC_KEY = 'bank_last_sync'

/** Cached "has at least one active bank", so app-open syncs don't ask the server first. */
export async function hasActiveBanksCached(): Promise<boolean | null> {
  const v = await AsyncStorage.getItem(HAS_BANKS_KEY)
  return v === null ? null : v === '1'
}

export async function getLastBankSync(): Promise<Date | null> {
  const v = await AsyncStorage.getItem(LAST_SYNC_KEY)
  return v ? new Date(Number(v)) : null
}

export async function listBankProviders(country?: string): Promise<BankProvider[]> {
  const q = country ? `?country=${encodeURIComponent(country)}` : ''
  return apiFetch<BankProvider[]>(`/api/bank-providers${q}`)
}

export async function listBankConnections(): Promise<BankConnection[]> {
  const list = await apiFetch<BankConnection[]>('/api/bank-connections')
  await AsyncStorage.setItem(HAS_BANKS_KEY, list.some(c => c.status === 'active') ? '1' : '0')
  return list
}

export type ConnectResult =
  | { status: 'ok'; bankName: string }
  | { status: 'cancel' }
  | { status: 'error'; message: string }

/**
 * Opens the bank's login in an in-app browser. TrueLayer redirects to the backend, which saves
 * the connection and bounces back to walletapp://bank-connected?bank_status=… (closing the browser).
 */
export async function connectBank(providerId: string): Promise<ConnectResult> {
  // walletapp://bank-connected in the installed app, exp://…/--/bank-connected in Expo Go
  const returnUrl = makeRedirectUri({ scheme: 'walletapp', path: 'bank-connected' })
  const { url } = await apiFetch<{ url: string }>('/api/bank-connections/start', {
    method: 'POST',
    body: JSON.stringify({ provider_id: providerId, return_url: returnUrl }),
  })

  const result = await WebBrowser.openAuthSessionAsync(url, returnUrl)
  if (result.type !== 'success') return { status: 'cancel' }

  const params = new URLSearchParams(result.url.split('?')[1] ?? '')
  if (params.get('bank_status') === 'ok') {
    await AsyncStorage.setItem(HAS_BANKS_KEY, '1')
    return { status: 'ok', bankName: params.get('bank_name') || '' }
  }
  return { status: 'error', message: params.get('bank_message') || 'unknown_error' }
}

/** Banks connected with a personal token (Monobank: api.monobank.ua). */
export async function connectBankWithToken(
  providerId: string,
  token: string
): Promise<{ bank_name: string; accounts: number }> {
  const res = await apiFetch<{ bank_name: string; accounts: number }>('/api/bank-connections/token', {
    method: 'POST',
    body: JSON.stringify({ provider_id: providerId, token }),
  })
  await AsyncStorage.setItem(HAS_BANKS_KEY, '1')
  return res
}

export async function disconnectBank(connectionId: string): Promise<void> {
  await apiFetch(`/api/bank-connections/${connectionId}`, { method: 'DELETE' })
}

/**
 * Pulls new transactions from every connected bank (or one, by id). `user_present` tells the
 * backend the user has the app open, so the banks' 4-per-day unattended limit doesn't apply.
 */
export async function syncConnectedBanks(connectionId?: string): Promise<BankSyncResult> {
  // Talks to several banks and inserts rows — allow more than the default request timeout
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const res = await apiFetch<BankSyncResult & { success: boolean; error?: string }>(
      '/api/bank-connections/sync',
      {
        method: 'POST',
        body: JSON.stringify({ user_present: true, ...(connectionId && { connection_id: connectionId }) }),
        signal: controller.signal,
      }
    )
    if (!res?.success) throw new Error(res?.error || 'Не вдалося синхронізувати банки')
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()))
    return { added: res.added ?? 0, results: res.results ?? [] }
  } finally {
    clearTimeout(timer)
  }
}
