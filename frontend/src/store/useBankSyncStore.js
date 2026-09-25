import { create } from 'zustand'
import { apiFetch } from '../utils.jsx'
import { syncBankConnections } from '../api/bankConnections'
import { txBus } from '../utils/txBus'

// Bank sync state for the transactions header indicator (same behaviour as the iPhone app)

const LAST_SYNC_KEY = 'bank_last_sync'
// How long "+N транзакцій" stays before switching to the last-sync time
const RESULT_VISIBLE_MS = 4000

function readLastSync() {
  try {
    return Number(localStorage.getItem(LAST_SYNC_KEY)) || null
  } catch {
    return null
  }
}

export const useBankSyncStore = create(() => ({
  phase: 'idle', // 'idle' | 'syncing' | 'result'
  added: 0, // transactions added by the last finished sync
  lastSyncAt: readLastSync(), // ms of the last successful sync
}))

let inFlight = null
let resultTimer = null

/**
 * Syncs every bank: those connected through TrueLayer and Monobank (if configured).
 * Concurrent calls share one run. Resolves with the number of transactions added.
 */
export function syncBanks() {
  if (inFlight) return inFlight

  if (resultTimer) clearTimeout(resultTimer)
  useBankSyncStore.setState({ phase: 'syncing' })

  inFlight = Promise.allSettled([
    syncBankConnections().then(r => r.added),
    // Fails when Monobank isn't set up for the user — that's fine, the other banks still count
    apiFetch('/api/syncMonoBank', { method: 'POST', body: JSON.stringify({}) }).then(r => Number(r?.count || 0)),
  ])
    .then(results => {
      const ok = results.filter(r => r.status === 'fulfilled')
      results
        .filter(r => r.status === 'rejected')
        .forEach(r => console.warn('[BankSync]', r.reason?.message || r.reason))

      if (ok.length === 0) {
        useBankSyncStore.setState({ phase: 'idle' })
        throw new Error('Не вдалося синхронізувати банки')
      }

      const added = ok.reduce((sum, r) => sum + (r.value || 0), 0)
      const now = Date.now()
      try {
        localStorage.setItem(LAST_SYNC_KEY, String(now))
      } catch {}
      useBankSyncStore.setState({ phase: added > 0 ? 'result' : 'idle', added, lastSyncAt: now })

      if (added > 0) {
        try { txBus.emit({ type: 'SYNC' }) } catch {} // lists/cards reload
        resultTimer = setTimeout(() => useBankSyncStore.setState({ phase: 'idle' }), RESULT_VISIBLE_MS)
      }
      return added
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}
