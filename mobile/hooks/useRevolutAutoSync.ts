import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { getRevolutStatus, isRevolutConnectedCached } from '../api/revolut'
import { syncBanks, useBankSyncStore } from '../store/useBankSyncStore'

// Opening the app again within this window doesn't re-sync
const MIN_INTERVAL_MS = 2 * 60 * 1000

/**
 * Syncs Revolut (TrueLayer) every time the app is opened or brought back to the foreground,
 * at most once per MIN_INTERVAL_MS. Progress/result is shown by the sync indicator
 * on the transactions block (see useBankSyncStore).
 */
export function useRevolutAutoSync(enabled: boolean) {
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
        let connected = await isRevolutConnectedCached()
        if (connected === null) connected = (await getRevolutStatus()) === 'connected'
        if (!connected) return

        await syncBanks()
      } catch (e) {
        // Background sync: log only; the settings screen shows the connection state
        console.warn('[Revolut] auto-sync failed:', e)
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
