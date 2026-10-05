import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import type { DetectedSubscription } from '../api/insights'
import { formatMoney } from './currency'

// Local notifications only: a free Apple ID can't receive push, but the app can schedule its own
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export type ReminderKind = 'signing' | 'new-version' | 'subscription'

// Before the signature runs out: 2 days, 1 day, 12 hours and 1 hour ahead
const SIGNING_REMINDERS = [
  { id: 'signing-48h', hoursBefore: 48 },
  { id: 'signing-24h', hoursBefore: 24 },
  { id: 'signing-12h', hoursBefore: 12 },
  { id: 'signing-1h', hoursBefore: 1 },
]
// Older schedules, removed when rescheduling
const OLD_SIGNING_IDS = ['signing-day6', 'signing-day7']
const NOTIFIED_VERSION_KEY = 'notified_app_version'

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true
  if (!current.canAskAgain) return false
  return (await Notifications.requestPermissionsAsync()).granted
}

// Nobody wants this at 3 a.m.: times between 23:00 and 7:00 move to 22:00 the evening before
function outsideNight(date: Date): Date {
  const d = new Date(date)
  const h = d.getHours()
  if (h >= 23 || h < 7) {
    if (h < 7) d.setDate(d.getDate() - 1)
    d.setHours(22, 0, 0, 0)
  }
  return d
}

function signingTitle(expiresAt: Date, at: Date): string {
  const hours = (expiresAt.getTime() - at.getTime()) / 36e5
  const time = expiresAt.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
  if (hours <= 2) return `⏰ Через ${hours <= 1.2 ? 'годину' : `${Math.round(hours)} год`} MyWallet перестане відкриватися`
  if (expiresAt.toDateString() === at.toDateString()) return `Сьогодні о ${time} закінчується підпис MyWallet`
  if (hours <= 36) return `Завтра о ${time} закінчується підпис MyWallet`
  return `Через ${Math.round(hours / 24)} дні закінчується підпис MyWallet`
}

/**
 * Signing reminders, marked time-sensitive (iOS shows them as urgent where it allows it).
 * Rescheduled on every launch from the current signature, so after a refresh in SideStore they
 * move on by themselves; two that would land within 90 minutes of each other become one.
 */
export async function scheduleSigningReminders(expiresAt: Date): Promise<void> {
  try {
    const ids = [...SIGNING_REMINDERS.map(r => r.id), ...OLD_SIGNING_IDS]
    await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})))

    const planned = SIGNING_REMINDERS.map(r => ({
      id: r.id,
      at: outsideNight(new Date(expiresAt.getTime() - r.hoursBefore * 36e5)),
    }))
      .filter(r => r.at.getTime() > Date.now() + 60 * 1000 && r.at < expiresAt)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .filter((r, i, all) => !all[i + 1] || all[i + 1].at.getTime() - r.at.getTime() >= 90 * 60 * 1000)
    if (planned.length === 0 || !(await ensurePermission())) return

    for (const r of planned) {
      await Notifications.scheduleNotificationAsync({
        identifier: r.id,
        content: {
          title: signingTitle(expiresAt, r.at),
          body: 'Увімкніть LocalDevVPN, відкрийте SideStore → My Apps і натисніть «7 DAYS» (або Refresh All). Дані не зникнуть.',
          sound: 'default',
          interruptionLevel: 'timeSensitive',
          data: { kind: 'signing' satisfies ReminderKind },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at },
      })
    }
  } catch (e) {
    console.warn('[Reminders] scheduling failed:', e)
  }
}

/** One notification per new build that has to be installed again (the Home banner stays as well) */
export async function notifyNewVersion(version: string): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(NOTIFIED_VERSION_KEY)) === version) return
    if (!(await ensurePermission())) return
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Вийшла нова версія MyWallet ${version}`,
        body: 'Її треба встановити заново — натисніть, там кнопка «Встановити через SideStore».',
        data: { kind: 'new-version' satisfies ReminderKind },
      },
      trigger: null,
    })
    await AsyncStorage.setItem(NOTIFIED_VERSION_KEY, version)
  } catch (e) {
    console.warn('[Reminders] new version notification failed:', e)
  }
}

/** Taps on our notifications (also the one that launched the app) */
export function onReminderTap(listener: (kind: ReminderKind) => void): () => void {
  const handle = (response: Notifications.NotificationResponse | null) => {
    const kind = response?.notification.request.content.data?.kind
    if (kind === 'signing' || kind === 'new-version') listener(kind)
  }
  // The tap that launched the app — cleared, so it doesn't reopen the sheet on the next mount
  Notifications.getLastNotificationResponseAsync()
    .then(response => {
      handle(response)
      if (response) Notifications.clearLastNotificationResponseAsync().catch(() => {})
    })
    .catch(() => {})
  const sub = Notifications.addNotificationResponseReceivedListener(handle)
  return () => sub.remove()
}

// Subscriptions: a reminder the day before the bank charges, at 10:00
const SUB_PREFIX = 'sub-'
const SUB_REMIND_HOUR = 10
// iOS keeps at most 64 scheduled notifications per app; the signing ones need room too
const SUB_MAX = 20

/** Settings: preferences.subscriptions.remind (on unless turned off) */
export const SUBSCRIPTION_REMIND_PATH = 'subscriptions.remind'

/**
 * Reschedules the "завтра спише …" reminders for the active subscriptions found in bank charges
 * (or only removes them when `enabled` is false).
 */
export async function scheduleSubscriptionReminders(subs: DetectedSubscription[], enabled = true): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync()
    await Promise.all(
      scheduled
        .filter(n => n.identifier.startsWith(SUB_PREFIX))
        .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {}))
    )
    if (!enabled) return

    const planned = subs
      .filter(s => s.source === 'detected' && s.is_active && !s.hidden && s.next_execution_at)
      .map(s => {
        const at = new Date(s.next_execution_at as string)
        at.setDate(at.getDate() - 1)
        at.setHours(SUB_REMIND_HOUR, 0, 0, 0)
        return { s, at }
      })
      .filter(r => r.at.getTime() > Date.now() + 60 * 1000)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, SUB_MAX)
    if (planned.length === 0 || !(await ensurePermission())) return

    for (const { s, at } of planned) {
      const per = Math.max(1, s.charges_per_period || 1)
      await Notifications.scheduleNotificationAsync({
        identifier: `${SUB_PREFIX}${s.id}`,
        content: {
          title: `Завтра спише ${s.name}`,
          body: `${formatMoney(Number(s.amount) * per, s.currency || 'UAH')}${per > 1 ? ` (${per} × ${formatMoney(Number(s.amount), s.currency || 'UAH')})` : ''} — підписка, яку MyWallet знайшов у банку`,
          sound: 'default',
          data: { kind: 'subscription' satisfies ReminderKind },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
      })
    }
  } catch (e) {
    console.warn('[Reminders] subscription reminders failed:', e)
  }
}
