import { create } from 'zustand'
import { getLastRevolutSync, syncRevolut } from '../api/revolut'
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
    const last = await getLastRevolutSync()
    // Don't overwrite a newer time from a sync that finished while this was loading
    if (last && (get().lastSyncAt ?? 0) < last.getTime()) set({ lastSyncAt: last.getTime() })
  },
}))

let resultTimer: ReturnType<typeof setTimeout> | null = null
let inFlight: Promise<number> | null = null

/**
 * Syncs connected banks (Revolut via TrueLayer for now), drives the sync indicator and
 * notifies screens when transactions were added. Concurrent calls share one request.
 * Returns the number of transactions added.
 */
export function syncBanks(): Promise<number> {
  if (inFlight) return inFlight

  if (resultTimer) clearTimeout(resultTimer)
  useBankSyncStore.setState({ phase: 'syncing' })

  inFlight = syncRevolut()
    .then(added => {
      useBankSyncStore.setState({ phase: added > 0 ? 'result' : 'idle', added, lastSyncAt: Date.now() })
      if (added > 0) {
        txBus.emit({ type: 'SYNCED', source: 'revolut', count: added })
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
