import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { Colors } from '../constants/theme'
import { triggerLightHaptic } from '../utils/haptics'
import { IPA_URL, SIDESTORE_INSTALL_URL, appVersion, fetchLatestVersion, isNewerVersion } from '../utils/iosRelease'
import { SigningInfo, hoursLeft, readSigningInfo } from '../utils/signing'
import { notifyNewVersion, onReminderTap, scheduleSigningReminders } from '../utils/reminders'
import GlassButton from './GlassButton'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'

// Opening the app again within this window doesn't ask GitHub again
const CHECK_INTERVAL_MS = 60 * 60 * 1000
// The signing banner shows up this close to the end (the notifications come on day 6 and 7)
const SIGNING_BANNER_HOURS = 36

type Sheet = 'update' | 'signing' | null

function whenLabel(date: Date): string {
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)
  const time = date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === today.toDateString()) return `сьогодні о ${time}`
  if (date.toDateString() === tomorrow.toDateString()) return `завтра о ${time}`
  return `${date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })} о ${time}`
}

/**
 * Home: what needs doing to keep the iPhone app working.
 * - The 7-day signature (free Apple ID) is about to run out → refresh it in SideStore;
 *   also time-sensitive notifications 2 days, 1 day, 12 hours and 1 hour ahead.
 * - A new build is out that has to be installed again (code-only changes arrive by themselves
 *   through EAS Update) → one-tap install through SideStore or the direct .ipa link; also a notification.
 */
export default function AppStatusBanner() {
  const [latest, setLatest] = useState<string | null>(null)
  const [signing, setSigning] = useState<SigningInfo | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const lastCheck = useRef(0)

  const checkVersion = useCallback(async () => {
    if (Date.now() - lastCheck.current < CHECK_INTERVAL_MS) return
    lastCheck.current = Date.now()
    const release = await fetchLatestVersion()
    const newer = release && isNewerVersion(release.version, appVersion) ? release.version : null
    setLatest(newer)
    if (newer) notifyNewVersion(newer)
  }, [])

  useEffect(() => {
    checkVersion()
    const sub = AppState.addEventListener('change', state => state === 'active' && checkVersion())
    return () => sub.remove()
  }, [checkVersion])

  useEffect(() => {
    readSigningInfo().then(info => {
      setSigning(info)
      if (info) scheduleSigningReminders(info.expiresAt)
    })
  }, [])

  // Tap on one of our notifications: open its sheet
  useEffect(() => onReminderTap(kind => setSheet(kind === 'signing' ? 'signing' : 'update')), [])

  const openSheet = (s: Sheet) => {
    triggerLightHaptic()
    setSheet(s)
  }

  const signingSoon = !!signing && hoursLeft(signing) <= SIGNING_BANNER_HOURS

  return (
    <>
      {signingSoon && signing && (
        <Pressable onPress={() => openSheet('signing')} style={({ pressed }) => [styles.banner, styles.bannerWarn, pressed && styles.pressed]}>
          <View style={[styles.icon, { backgroundColor: '#FF9500' }]}>
            <Text style={styles.iconText}>⏳</Text>
          </View>
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>
              {hoursLeft(signing) > 0
                ? `Підпис закінчується ${signing.estimated ? 'приблизно ' : ''}${whenLabel(signing.expiresAt)}`
                : 'Підпис закінчився'}
            </Text>
            <Text style={styles.bannerSub} numberOfLines={1}>Оновіть у SideStore · натисніть, як це зробити</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}

      {latest && (
        <Pressable onPress={() => openSheet('update')} style={({ pressed }) => [styles.banner, pressed && styles.pressed]}>
          <View style={styles.icon}>
            <Text style={styles.iconText}>⬇️</Text>
          </View>
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>Вийшла нова версія {latest}</Text>
            <Text style={styles.bannerSub} numberOfLines={1}>Потрібно встановити заново · натисніть</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}

      {/* Refresh the 7-day signature */}
      <SheetModal visible={sheet === 'signing'} onClose={() => setSheet(null)} sheetStyle={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Оновіть підпис MyWallet</Text>
          <GlassPressable onPress={() => setSheet(null)} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </GlassPressable>
        </View>
        <View style={styles.body}>
          <Text style={styles.lead}>
            Безкоштовний Apple ID підписує додаток на 7 днів.
            {signing ? ` Зараз підпис дійсний до ${whenLabel(signing.expiresAt)}.` : ''} Після цього MyWallet не
            відкриється, поки ви його не оновите. Картки й транзакції при цьому не зникають.
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Увімкніть LocalDevVPN (Connect).</Text>
            <Text style={styles.step}>2. Відкрийте SideStore → вкладка My Apps.</Text>
            <Text style={styles.step}>3. Натисніть «7 DAYS» біля MyWallet і дочекайтесь, поки закінчиться.</Text>
            <Text style={styles.step}>Комп’ютер не потрібен. Після оновлення знову 7 днів.</Text>
          </View>
          <GlassButton
            label="Відкрити SideStore"
            variant="primary"
            size="lg"
            onPress={() =>
              Linking.openURL('sidestore://').catch(() =>
                Toast.show({ type: 'error', text1: 'SideStore не відкрився', text2: 'Відкрийте його з головного екрана' })
              )
            }
          />
        </View>
      </SheetModal>

      {/* Install a new build */}
      <SheetModal visible={sheet === 'update'} onClose={() => setSheet(null)} sheetStyle={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{latest ? `Нова версія ${latest}` : 'Нова версія MyWallet'}</Text>
          <GlassPressable onPress={() => setSheet(null)} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </GlassPressable>
        </View>
        <View style={styles.body}>
          <Text style={styles.lead}>
            У вас {appVersion}. Ця версія змінює сам додаток, тому сама вона не прийде — її треба встановити поверх
            старої. Картки, транзакції й вхід залишаться.
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Увімкніть LocalDevVPN.</Text>
            <Text style={styles.step}>2. Натисніть «Встановити через SideStore» — він сам завантажить і встановить.</Text>
            <Text style={styles.step}>3. Якщо не вийшло: завантажте файл, потім SideStore → My Apps → «+» → MyWallet.ipa.</Text>
          </View>
          <GlassButton
            label="Встановити через SideStore"
            variant="primary"
            size="lg"
            onPress={() =>
              Linking.openURL(SIDESTORE_INSTALL_URL).catch(() =>
                Toast.show({ type: 'error', text1: 'SideStore не відкрився', text2: 'Завантажте файл кнопкою нижче' })
              )
            }
          />
          <GlassButton label="Завантажити MyWallet.ipa" size="lg" onPress={() => Linking.openURL(IPA_URL).catch(() => {})} />
        </View>
      </SheetModal>
    </>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 107, 0, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.40)',
  },
  bannerWarn: {
    backgroundColor: 'rgba(255, 149, 0, 0.14)',
    borderColor: 'rgba(255, 149, 0, 0.45)',
  },
  pressed: { opacity: 0.75 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 18 },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 15, fontWeight: '700', color: Colors.white },
  bannerSub: { fontSize: 12, color: Colors.white60, marginTop: 2 },
  chevron: { fontSize: 22, color: Colors.white40 },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.white, letterSpacing: -0.3, flex: 1, marginRight: 12 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: Colors.white80, fontSize: 15, fontWeight: '700' },
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 12 },
  lead: { fontSize: 14, lineHeight: 20, color: Colors.textSub },
  steps: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    gap: 6,
  },
  step: { fontSize: 14, lineHeight: 19, color: Colors.white80 },
})
