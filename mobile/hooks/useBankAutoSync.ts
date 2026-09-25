import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { hasActiveBanksCached, listBankConnections } from '../api/bankConnections'
import { syncBanks, useBankSyncStore } from '../store/useBankSyncStore'

// Opening the app again within this window doesn't re-sync
const MIN_INTERVAL_MS = 2 * 60 * 1000

/**
 * Syncs every connected bank each time the app is opened or brought back to the foreground,
 * at most once per MIN_INTERVAL_MS. Progress/result is shown by the sync indicator on the
 * transactions block (see useBankSyncStore).
 */
export function useBankAutoSync(enabled: boolean) {
  const running = useRef(false)
  const lastRun = useRef(0)

  useEffect(() => {
    if (!enabled) return
    useBankSyncStore.getState().hydrate()

    const run = async () => {
      if (running.current || Date.now() - lastRun.current < MIN_INTERVAL_MS) return
      running.current = true
      lastRun.current = Date.now()
      try {
        // Ask the server only once; afterwards the cached flag is kept up to date
        let hasBanks = await hasActiveBanksCached()
        if (hasBanks === null) hasBanks = (await listBankConnections()).some(c => c.status === 'active')
        if (!hasBanks) return

        await syncBanks()
      } catch (e) {
        // Background sync: log only; Settings → Банки shows each connection's state
        console.warn('[Banks] auto-sync failed:', e)
      } finally {
        running.current = false
      }
    }

    run()
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') run()
    })
    return () => sub.remove()
  }, [enabled])
}
