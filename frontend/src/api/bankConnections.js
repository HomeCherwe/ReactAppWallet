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

/** Syncs one bank (by id) or all connected banks. Returns { added, changed, results } (changed: pending ones that settled or went away). */
export async function syncBankConnections(connectionId) {
  const res = await apiFetch('/api/bank-connections/sync', {
    method: 'POST',
    body: JSON.stringify({ user_present: true, ...(connectionId && { connection_id: connectionId }) }),
  })
  if (!res?.success) throw new Error(res?.error || 'Не вдалося синхронізувати банки')
  return { added: res.added ?? 0, changed: res.changed ?? 0, results: res.results ?? [] }
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

/**
 * The other accounts this bank's transfers name («To Заощадження з миттєвим доступом»):
 * [{ name, count, card_id }] — card_id: where they were made transfers to by hand most.
 */
export async function listTransferNames(connectionId) {
  return apiFetch(`/api/bank-connections/${connectionId}/transfer-names`)
}

/**
 * One of the user's cards becomes an account of this bank (one the bank doesn't share, like Revolut's
 * savings): the bank's transfers naming `match` get their other side on it. Returns { added }.
 */
export async function addManualAccount(connectionId, cardId, match) {
  return apiFetch(`/api/bank-connections/${connectionId}/manual-accounts`, {
    method: 'POST',
    body: JSON.stringify({ card_id: cardId, match }),
  })
}

/** Not an account of this bank any more; the transfers made so far stay */
export async function removeManualAccount(connectionId, cardId) {
  return apiFetch(`/api/bank-connections/${connectionId}/manual-accounts/${cardId}`, { method: 'DELETE' })
}

/** Links a bank account without a card to one of the user's cards; its transactions go there. */
export async function linkBankAccountToCard(connectionId, accountId, cardId) {
  return apiFetch(`/api/bank-connections/${connectionId}/accounts/${encodeURIComponent(accountId)}`, {
    method: 'PUT',
    body: JSON.stringify({ card_id: cardId }),
  })
}
