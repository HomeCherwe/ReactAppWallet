import { apiFetch } from '../utils.jsx'

// Banks connected through TrueLayer (Revolut, Wise, BNP, Monzo, …). Tokens stay on the backend.

export async function listBankProviders(country) {
  const q = country ? `?country=${encodeURIComponent(country)}` : ''
  return apiFetch(`/api/bank-providers${q}`)
}

export async function listBankConnections() {
  return apiFetch('/api/bank-connections')
}

/**
 * Starts connecting a bank: returns the TrueLayer URL to open. After the bank login the user is
 * sent back to `returnUrl` with ?bank_status=ok|error (&bank_name / &bank_message).
 */
export async function startBankConnection(providerId, returnUrl) {
  const { url } = await apiFetch('/api/bank-connections/start', {
    method: 'POST',
    body: JSON.stringify({ provider_id: providerId, return_url: returnUrl }),
  })
  return url
}

/** Syncs one bank (by id) or all connected banks. Returns { added, results }. */
export async function syncBankConnections(connectionId) {
  const res = await apiFetch('/api/bank-connections/sync', {
    method: 'POST',
    body: JSON.stringify({ user_present: true, ...(connectionId && { connection_id: connectionId }) }),
  })
  if (!res?.success) throw new Error(res?.error || 'Не вдалося синхронізувати банки')
  return { added: res.added ?? 0, results: res.results ?? [] }
}

export async function disconnectBankConnection(connectionId) {
  return apiFetch(`/api/bank-connections/${connectionId}`, { method: 'DELETE' })
}

/** Banks connected with a personal token (Monobank). Returns { bank_name, accounts }. */
export async function connectBankWithToken(providerId, token) {
  return apiFetch('/api/bank-connections/token', {
    method: 'POST',
    body: JSON.stringify({ provider_id: providerId, token }),
  })
}
