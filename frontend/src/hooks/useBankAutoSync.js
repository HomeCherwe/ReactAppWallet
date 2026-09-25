import { useEffect } from 'react'
import { syncBanks } from '../store/useBankSyncStore'

// Reloading the page / coming back to the tab again within this window doesn't re-sync
// (Monobank allows one request per minute).
const MIN_INTERVAL_MS = 2 * 60 * 1000
const LAST_RUN_KEY = 'bank_auto_sync_last_run'

/**
 * Syncs every bank when the app is opened (page load/reload) and when the tab becomes visible
 * again, at most once per MIN_INTERVAL_MS. Progress/result is shown by BankSyncIndicator.
 */
export function useBankAutoSync(enabled) {
  useEffect(() => {
    if (!enabled) return

    const run = () => {
      let last = 0
      try {
        last = Number(localStorage.getItem(LAST_RUN_KEY)) || 0
      } catch {}
      if (Date.now() - last < MIN_INTERVAL_MS) return
      try {
        localStorage.setItem(LAST_RUN_KEY, String(Date.now()))
      } catch {}
      syncBanks().catch(e => console.warn('[BankSync] auto-sync failed:', e.message))
    }

    run()
    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [enabled])
}
