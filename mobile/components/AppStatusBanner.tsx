import React, { useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { Colors } from '../constants/theme'
import { triggerLightHaptic } from '../utils/haptics'
import { IPA_URL, SIDESTORE_INSTALL_URL, appVersion, fetchLatestVersion, isNewerVersion } from '../utils/iosRelease'
import { SigningInfo, confirmRefresh, hoursLeft, onSigningChange, readSigningInfo } from '../utils/signing'
import { SIGNING_WARN_HOURS, notifyNewVersion, onReminderTap, scheduleSigningReminders } from '../utils/reminders'
import { syncSigningActivity } from '../utils/signingActivity'
import GlassButton from './GlassButton'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'

// Opening the app again within this window doesn't ask GitHub again
const CHECK_INTERVAL_MS = 60 * 60 * 1000
// The live activity tapped on the Lock Screen opens the app with this link
const SIGNING_URL = /^walletapp:\/\/signing/
// What SideStore can show next to MyWallet after a refresh («7 DAYS» on the day of it)
const DAYS_SHOWN = [7, 6, 5, 4, 3, 2, 1]
const ASKED_KEY = 'signing_confirm_asked'
// The link that launched the app is returned again on every remount of Home: handled once
let handledInitialUrl: string | null = null

type Sheet = 'update' | 'signing' | null
// The signing sheet: how to refresh it, or when it was refreshed
type SigningStep = 'how' | 'confirm'

/** Without a time when the date is only known to the day (worked out from what SideStore shows) */
function whenLabel(date: Date, dayOnly = false): string {
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)
  const time = dayOnly ? '' : ` о ${date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`
  if (date.toDateString() === today.toDateString()) return `сьогодні${time}`
  if (date.toDateString() === tomorrow.toDateString()) return `завтра${time}`
  return `${date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}${time}`
}

// Known only to the day: the start of that day is used (see confirmRefresh)
const dayOnly = (info: SigningInfo) => !!info.estimated && !info.needsConfirm

/**
 * Home: what needs doing to keep the iPhone app working.
 * - The 7-day signature (free Apple ID) is about to run out → refresh it in SideStore; also
 *   notifications from 2 days ahead, the badge and a live activity on the Lock Screen. The app
 *   can't see a refresh, so after one it asks when (or the person says so) and moves them all on.
 * - A new build is out that has to be installed again (code-only changes arrive by themselves
 *   through EAS Update) → one-tap install through SideStore or the direct .ipa link; also a notification.
 */
export default function AppStatusBanner() {
  const [latest, setLatest] = useState<string | null>(null)
  const [signing, setSigning] = useState<SigningInfo | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [signingStep, setSigningStep] = useState<SigningStep>('how')
  const [confirming, setConfirming] = useState(false)
  const lastCheck = useRef(0)
  const signingRef = useRef<SigningInfo | null>(null)
  // «Відкрити SideStore» pressed: when the app comes back from it, ask whether it was refreshed
  const sideStoreTrip = useRef<'opening' | 'away' | null>(null)

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

  const openSigning = useCallback((step: SigningStep) => {
    setSigningStep(step)
    setSheet('signing')
  }, [])

  // The reminders, the badge and the live activity follow the signature
  const applySigning = useCallback((info: SigningInfo) => {
    signingRef.current = info
    setSigning(info)
    scheduleSigningReminders(info.expiresAt, dayOnly(info))
    syncSigningActivity(info)
  }, [])

  useEffect(() => {
    readSigningInfo().then(async info => {
      if (!info) return
      applySigning(info)
      // Refreshed at a time the app doesn't know: ask once (the banner keeps asking)
      const asked = info.signedAt?.toISOString() ?? ''
      if (info.needsConfirm && (await AsyncStorage.getItem(ASKED_KEY).catch(() => null)) !== asked) {
        AsyncStorage.setItem(ASKED_KEY, asked).catch(() => {})
        openSigning('confirm')
      }
    })
    return onSigningChange(applySigning)
  }, [applySigning, openSigning])

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background' && sideStoreTrip.current === 'opening') sideStoreTrip.current = 'away'
      if (state !== 'active') return
      if (sideStoreTrip.current === 'away') openSigning('confirm')
      sideStoreTrip.current = null
      // iOS ends a live activity after 8 hours; opening the app starts it again
      if (signingRef.current) syncSigningActivity(signingRef.current)
    })
    return () => sub.remove()
  }, [openSigning])

  // Tap on one of our notifications: open its sheet («Я вже оновив» goes straight to the question)
  useEffect(
    () => onReminderTap((kind, refreshed) => (kind === 'signing' ? openSigning(refreshed ? 'confirm' : 'how') : setSheet('update'))),
    [openSigning]
  )

  // Tap on the live activity
  useEffect(() => {
    const open = (url: string | null) => {
      if (url && SIGNING_URL.test(url)) openSigning('how')
    }
    Linking.getInitialURL()
      .then(url => {
        if (url && url !== handledInitialUrl) {
          handledInitialUrl = url
          open(url)
        }
      })
      .catch(() => {})
    const sub = Linking.addEventListener('url', e => open(e.url))
    return () => sub.remove()
  }, [openSigning])

  const openSheet = (s: Sheet) => {
    triggerLightHaptic()
    setSheet(s)
  }

  const confirm = async (daysShown?: number) => {
    if (confirming) return
    triggerLightHaptic()
    setConfirming(true)
    try {
      const info = await confirmRefresh(daysShown)
      setSheet(null)
      if (info) {
        Toast.show({
          type: 'success',
          text1: 'Підпис оновлено',
          text2: `Дійсний ${dayOnly(info) ? 'приблизно ' : ''}до ${whenLabel(info.expiresAt, dayOnly(info))}`,
        })
      }
    } finally {
      setConfirming(false)
    }
  }

  const signingSoon = !!signing && (hoursLeft(signing) <= SIGNING_WARN_HOURS || !!signing.needsConfirm)

  return (
    <>
      {signingSoon && signing && (
        <Pressable
          onPress={() => {
            triggerLightHaptic()
            openSigning(signing.needsConfirm ? 'confirm' : 'how')
          }}
          style={({ pressed }) => [styles.banner, styles.bannerWarn, pressed && styles.pressed]}
        >
          <View style={[styles.icon, { backgroundColor: '#FF9500' }]}>
            <Text style={styles.iconText}>⏳</Text>
          </View>
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>
              {signing.needsConfirm
                ? 'Коли ви оновили підпис?'
                : hoursLeft(signing) > 0
                  ? `Підпис закінчується ${signing.estimated ? 'приблизно ' : ''}${whenLabel(signing.expiresAt, dayOnly(signing))}`
                  : 'Підпис закінчився'}
            </Text>
            <Text style={styles.bannerSub} numberOfLines={1}>
              {signing.needsConfirm ? 'Натисніть, щоб нагадування прийшли вчасно' : 'Оновіть у SideStore · натисніть, як це зробити'}
            </Text>
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

      {/* Refresh the 7-day signature, then say when it was refreshed */}
      <SheetModal visible={sheet === 'signing'} onClose={() => setSheet(null)} sheetStyle={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{signingStep === 'confirm' ? 'Підпис оновлено?' : 'Оновіть підпис MyWallet'}</Text>
          <GlassPressable onPress={() => setSheet(null)} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </GlassPressable>
        </View>
        {signingStep === 'confirm' ? (
          <View style={styles.body}>
            <Text style={styles.lead}>
              Додаток не бачить, коли ви оновили його в SideStore. Скажіть, і нагадування та віджет на екрані блокування
              перейдуть на нову дату.
            </Text>
            <GlassButton label="Оновив щойно" variant="primary" size="lg" loading={confirming} onPress={() => confirm()} />
            <View style={styles.steps}>
              <Text style={styles.step}>Оновили раніше? Скільки днів SideStore показує біля MyWallet:</Text>
              <View style={styles.days}>
                {DAYS_SHOWN.map(d => (
                  <Pressable
                    key={d}
                    disabled={confirming}
                    onPress={() => confirm(d)}
                    style={({ pressed }) => [styles.day, pressed && styles.pressed]}
                  >
                    <Text style={styles.dayText}>{d}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <GlassButton label="Ще не оновлював" size="lg" onPress={() => setSigningStep('how')} />
          </View>
        ) : (
          <View style={styles.body}>
            <Text style={styles.lead}>
              Безкоштовний Apple ID підписує додаток на 7 днів.
              {signing
                ? ` Зараз підпис дійсний ${signing.estimated ? 'приблизно ' : ''}до ${whenLabel(signing.expiresAt, dayOnly(signing))}.`
                : ''}{' '}
              Після цього MyWallet не відкриється, поки ви його не оновите. Картки й транзакції при цьому не зникають.
            </Text>
            <View style={styles.steps}>
              <Text style={styles.step}>1. Увімкніть LocalDevVPN (Connect).</Text>
              <Text style={styles.step}>2. Відкрийте SideStore → вкладка My Apps.</Text>
              <Text style={styles.step}>3. Натисніть кнопку з днями біля MyWallet і дочекайтесь, поки закінчиться.</Text>
              <Text style={styles.step}>Комп’ютер не потрібен. Після оновлення знову 7 днів.</Text>
            </View>
            <GlassButton
              label="Відкрити SideStore"
              variant="primary"
              size="lg"
              onPress={() => {
                sideStoreTrip.current = 'opening'
                Linking.openURL('sidestore://').catch(() => {
                  sideStoreTrip.current = null
                  Toast.show({ type: 'error', text1: 'SideStore не відкрився', text2: 'Відкрийте його з головного екрана' })
                })
              }}
            />
            <GlassButton label="Я вже оновив" size="lg" onPress={() => setSigningStep('confirm')} />
          </View>
        )}
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
  days: { flexDirection: 'row', gap: 6, marginTop: 6 },
  day: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 149, 0, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontSize: 16, fontWeight: '800', color: Colors.white },
})
