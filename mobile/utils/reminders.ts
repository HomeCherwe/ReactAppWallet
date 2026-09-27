import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'

// Local notifications only: a free Apple ID can't receive push, but the app can schedule its own
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export type ReminderKind = 'signing' | 'new-version'

const DAY6 = 'signing-day6'
const DAY7 = 'signing-day7'
const NOTIFIED_VERSION_KEY = 'notified_app_version'

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true
  if (!current.canAskAgain) return false
  return (await Notifications.requestPermissionsAsync()).granted
}

// Nobody wants this at 3 a.m.: night times move to 20:00 the evening before
function atDaytime(date: Date): Date {
  const d = new Date(date)
  const h = d.getHours()
  if (h < 9) {
    d.setDate(d.getDate() - 1)
    d.setHours(20, 0, 0, 0)
  } else if (h >= 22) {
    d.setHours(20, 0, 0, 0)
  }
  return d
}

/**
 * The two signing reminders — about a day before the 7-day signature runs out (day 6) and a few
 * hours before (day 7). Rescheduled on every launch from the current signature, so after a refresh
 * in SideStore they move on by themselves.
 */
export async function scheduleSigningReminders(expiresAt: Date): Promise<void> {
  try {
    await Promise.all([DAY6, DAY7].map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})))
    const reminders = [
      {
        id: DAY6,
        at: atDaytime(new Date(expiresAt.getTime() - 24 * 36e5)),
        title: 'Завтра закінчується підпис MyWallet',
        body: 'Увімкніть LocalDevVPN, відкрийте SideStore → My Apps і натисніть «7 DAYS» біля MyWallet.',
      },
      {
        id: DAY7,
        at: atDaytime(new Date(expiresAt.getTime() - 3 * 36e5)),
        title: 'Сьогодні закінчується підпис MyWallet',
        body: 'Оновіть його в SideStore зараз, інакше додаток перестане відкриватися. Дані не зникнуть.',
      },
    ].filter(r => r.at.getTime() > Date.now() + 60 * 1000)
    if (reminders.length === 0 || !(await ensurePermission())) return

    for (const r of reminders) {
      await Notifications.scheduleNotificationAsync({
        identifier: r.id,
        content: { title: r.title, body: r.body, data: { kind: 'signing' satisfies ReminderKind } },
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
