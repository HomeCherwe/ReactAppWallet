import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { Colors } from '../constants/theme'
import { triggerLightHaptic } from '../utils/haptics'
import { IPA_URL, SIDESTORE_INSTALL_URL, appVersion, fetchLatestVersion, isNewerVersion } from '../utils/iosRelease'
import GlassButton from './GlassButton'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'

// Opening the app again within this window doesn't ask GitHub again
const CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * Home: a banner when a new build of the app is out (one that has to be installed again —
 * code-only changes arrive by themselves through EAS Update). Tapping it explains how, with a
 * one-tap install through SideStore and the direct .ipa link.
 */
export default function AppStatusBanner() {
  const [latest, setLatest] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const lastCheck = useRef(0)

  const check = useCallback(async () => {
    if (Date.now() - lastCheck.current < CHECK_INTERVAL_MS) return
    lastCheck.current = Date.now()
    const release = await fetchLatestVersion()
    setLatest(release && isNewerVersion(release.version, appVersion) ? release.version : null)
  }, [])

  useEffect(() => {
    check()
    const sub = AppState.addEventListener('change', state => state === 'active' && check())
    return () => sub.remove()
  }, [check])

  const installWithSideStore = () => {
    Linking.openURL(SIDESTORE_INSTALL_URL).catch(() =>
      Toast.show({ type: 'error', text1: 'SideStore не відкрився', text2: 'Завантажте файл кнопкою нижче' })
    )
  }

  if (!latest) return null

  return (
    <>
      <Pressable
        onPress={() => {
          triggerLightHaptic()
          setSheetOpen(true)
        }}
        style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
      >
        <View style={styles.icon}>
          <Text style={styles.iconText}>⬇️</Text>
        </View>
        <View style={styles.bannerText}>
          <Text style={styles.bannerTitle}>Вийшла нова версія {latest}</Text>
          <Text style={styles.bannerSub} numberOfLines={1}>Потрібно встановити заново · натисніть</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <SheetModal visible={sheetOpen} onClose={() => setSheetOpen(false)} sheetStyle={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Нова версія {latest}</Text>
          <GlassPressable onPress={() => setSheetOpen(false)} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </GlassPressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.lead}>
            У вас {appVersion}. Ця версія змінює сам додаток, тому сама вона не прийде — її треба встановити
            поверх старої. Картки, транзакції й вхід залишаться.
          </Text>

          <View style={styles.steps}>
            <Text style={styles.step}>1. Увімкніть LocalDevVPN.</Text>
            <Text style={styles.step}>2. Натисніть «Встановити через SideStore» — він сам завантажить і встановить.</Text>
            <Text style={styles.step}>
              3. Якщо не вийшло: завантажте файл, потім SideStore → My Apps → «+» → MyWallet.ipa.
            </Text>
          </View>

          <GlassButton label="Встановити через SideStore" variant="primary" size="lg" onPress={installWithSideStore} />
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
  title: { fontSize: 20, fontWeight: '800', color: Colors.white, letterSpacing: -0.3 },
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
