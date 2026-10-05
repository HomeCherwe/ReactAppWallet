import { useEffect } from 'react'
import { AppState } from 'react-native'
import { detectSubscriptions, listSubscriptions } from '../api/insights'
import { scheduleSubscriptionReminders, SUBSCRIPTION_REMIND_PATH } from '../utils/reminders'
import { useSettingsStore } from '../store/useSettingsStore'

// Reminders are rescheduled at most this often while the app is used
const EVERY_MS = 6 * 36e5
let lastRun = 0

/** Keeps the "завтра спише …" reminders in step with the subscriptions (no-op when not signed in) */
export async function refreshSubscriptionReminders(force = false): Promise<void> {
  if (!force && Date.now() - lastRun < EVERY_MS) return
  lastRun = Date.now()
  try {
    await detectSubscriptions().catch(() => null) // the server skips it if it ran recently
    const subs = await listSubscriptions()
    const enabled = useSettingsStore.getState().getNestedSetting<boolean>(SUBSCRIPTION_REMIND_PATH, true)
    await scheduleSubscriptionReminders(subs, enabled)
  } catch (e) {
    lastRun = 0
    console.warn('[Subscriptions] reminders refresh failed:', e)
  }
}

export function useSubscriptionReminders(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return
    refreshSubscriptionReminders()
    const sub = AppState.addEventListener('change', s => s === 'active' && refreshSubscriptionReminders())
    return () => sub.remove()
  }, [signedIn])
}
