import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import Toast from 'react-native-toast-message'
import { getRevolutStatus, isRevolutConnectedCached, syncRevolut } from '../api/revolut'
import { txBus } from '../utils/txBus'

// Opening the app again within this window doesn't re-sync
const MIN_INTERVAL_MS = 2 * 60 * 1000

/**
 * Syncs Revolut (TrueLayer) every time the app is opened or brought back to the foreground,
 * at most once per MIN_INTERVAL_MS. Silent unless new transactions arrive.
 */
export function useRevolutAutoSync(enabled: boolean) {
  const running = useRef(false)
  const lastRun = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const run = async () => {
      if (running.current || Date.now() - lastRun.current < MIN_INTERVAL_MS) return
      running.current = true
      lastRun.current = Date.now()
      try {
        // Ask the server only once; afterwards the cached flag is kept up to date
        let connected = await isRevolutConnectedCached()
        if (connected === null) connected = (await getRevolutStatus()) === 'connected'
        if (!connected) return

        const added = await syncRevolut()
        if (added > 0) {
          txBus.emit({ type: 'SYNCED', source: 'revolut', count: added })
          Toast.show({ type: 'success', text1: `Revolut: +${added} нових транзакцій` })
        }
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
