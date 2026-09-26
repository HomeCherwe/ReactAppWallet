import { useSettingsStore } from '../store/useSettingsStore'

// Where the newest iPhone build lives: the "Build Mobile iOS IPA" runs on main
// (open the latest run → Artifacts → WalletMobile-iOS-N)
export const IOS_BUILDS_URL =
  'https://github.com/HomeCherwe/ReactAppWallet/actions/workflows/build-mobile-ios.yml?query=branch%3Amain+is%3Asuccess'
export const SIDELOADLY_URL = 'https://sideloadly.io/'

/**
 * preferences.iosApp — written by the iPhone app on every launch ({ installed, lastSeenAt, version }),
 * or by the "У мене вже є додаток" button in the guide. While it isn't there, the site advertises the app.
 */
export function useIosApp() {
  return useSettingsStore(state => state.settings?.iosApp) || null
}

export function markIosAppInstalled() {
  const current = useSettingsStore.getState().settings?.iosApp || {}
  useSettingsStore.getState().updateSetting('iosApp', { ...current, installed: true, markedFromWebAt: new Date().toISOString() })
}

export const isIPhoneBrowser = () =>
  typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent || '')
