import { create } from 'zustand'
import { getLastBankSync, syncConnectedBanks } from '../api/bankConnections'
import { txBus } from '../utils/txBus'

// How long "+N транзакцій" stays before switching to the last-sync time
const RESULT_VISIBLE_MS = 4000

type Phase = 'idle' | 'syncing' | 'result'

type BankSyncState = {
  phase: Phase
  /** Transactions added by the last finished sync */
  added: number
  /** When the last successful sync finished (ms) */
  lastSyncAt: number | null
  hydrate: () => Promise<void>
}

export const useBankSyncStore = create<BankSyncState>((set, get) => ({
  phase: 'idle',
  added: 0,
  lastSyncAt: null,
  hydrate: async () => {
    const last = await getLastBankSync()
    // Don't overwrite a newer time from a sync that finished while this was loading
    if (last && (get().lastSyncAt ?? 0) < last.getTime()) set({ lastSyncAt: last.getTime() })
  },
}))

let resultTimer: ReturnType<typeof setTimeout> | null = null
let inFlight: Promise<number> | null = null

/**
 * Syncs every connected bank (TrueLayer), drives the sync indicator and
 * notifies screens when transactions were added. Concurrent calls share one request.
 * Returns the number of transactions added.
 */
export function syncBanks(): Promise<number> {
  if (inFlight) return inFlight

  if (resultTimer) clearTimeout(resultTimer)
  useBankSyncStore.setState({ phase: 'syncing' })

  inFlight = syncConnectedBanks()
    .then(({ added, changed }) => {
      useBankSyncStore.setState({ phase: added > 0 ? 'result' : 'idle', added, lastSyncAt: Date.now() })
      // Pending ones that settled or went away: nothing to announce, but the lists change
      if (added > 0 || changed > 0) txBus.emit({ type: 'SYNCED', source: 'banks', count: added })
      if (added > 0) {
        resultTimer = setTimeout(() => useBankSyncStore.setState({ phase: 'idle' }), RESULT_VISIBLE_MS)
      }
      return added
    })
    .catch(err => {
      useBankSyncStore.setState({ phase: 'idle' })
      throw err
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}
