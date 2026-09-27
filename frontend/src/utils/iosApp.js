import { useEffect, useState } from 'react'
import { useSettingsStore } from '../store/useSettingsStore'

// The newest iPhone build: build-mobile-ios.yml puts every build from main into the "ios-latest"
// release, so this link never changes
const REPO = 'HomeCherwe/ReactAppWallet'
export const IOS_IPA_URL = `https://github.com/${REPO}/releases/download/ios-latest/MyWallet.ipa`
const IOS_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/tags/ios-latest`
// Before the first release exists: the build runs (open one → Artifacts)
export const IOS_BUILDS_URL = `https://github.com/${REPO}/actions/workflows/build-mobile-ios.yml?query=branch%3Amain+is%3Asuccess`
export const SIDELOADLY_URL = 'https://sideloadly.io/'
export const ITUNES_URL = 'https://www.apple.com/itunes/download/win64'
export const SIDESTORE_URL = 'https://sidestore.io/'
export const LOCALDEVVPN_URL = 'https://apps.apple.com/app/localdevvpn/id6755608044'
export const ILOADER_URL = 'https://github.com/nab138/iloader/releases/latest'

let releaseRequest = null // one request per page load

/** The "ios-latest" release: { title, updatedAt, size } when the .ipa is there, null when it isn't yet */
export function useLatestIosBuild(enabled = true) {
  const [build, setBuild] = useState(undefined) // undefined = loading
  useEffect(() => {
    if (!enabled) return
    let alive = true
    releaseRequest ??= fetch(IOS_RELEASE_API)
      .then(r => (r.ok ? r.json() : null))
      .then(release => {
        const ipa = release?.assets?.find(a => a.name === 'MyWallet.ipa')
        return ipa ? { title: release.name, updatedAt: ipa.updated_at, size: ipa.size } : null
      })
      .catch(() => null)
    releaseRequest.then(b => alive && setBuild(b))
    return () => {
      alive = false
    }
  }, [enabled])
  return build
}

/**
 * preferences.iosApp — written by the iPhone app on every launch ({ installed, lastSeenAt, version }),
 * or by the "У мене вже є додаток" button in the guide. While it isn't there, the site advertises the app.
 */
export function useIosApp() {
  return useSettingsStore(state => state.settings?.iosApp) || null
}

// Not opened for this long → probably deleted: the site advertises the app again
const STALE_AFTER_DAYS = 14

/**
 * Whether the user has the app *now*: it reports itself on every launch (lastSeenAt), and the
 * guide's "У мене вже є додаток" counts too (markedFromWebAt). Nothing for 14 days → not anymore.
 */
export function iosAppStatusOf(iosApp, now = Date.now()) {
  const times = [iosApp?.lastSeenAt, iosApp?.markedFromWebAt].map(t => (t ? new Date(t).getTime() : NaN)).filter(t => !isNaN(t))
  const lastActive = times.length ? Math.max(...times) : null
  const daysSince = lastActive ? (now - lastActive) / 864e5 : null
  const active = !!iosApp?.installed && daysSince != null && daysSince < STALE_AFTER_DAYS
  return {
    iosApp: iosApp || null,
    active,
    // Had it, but hasn't opened it for two weeks
    stale: !!iosApp?.installed && !active,
    daysSince: daysSince == null ? null : Math.floor(daysSince),
  }
}

export function useIosAppStatus() {
  return iosAppStatusOf(useIosApp())
}

export function markIosAppInstalled() {
  const current = useSettingsStore.getState().settings?.iosApp || {}
  useSettingsStore.getState().updateSetting('iosApp', { ...current, installed: true, markedFromWebAt: new Date().toISOString() })
}

export const isIPhoneBrowser = () =>
  typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent || '')
