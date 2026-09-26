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

export function markIosAppInstalled() {
  const current = useSettingsStore.getState().settings?.iosApp || {}
  useSettingsStore.getState().updateSetting('iosApp', { ...current, installed: true, markedFromWebAt: new Date().toISOString() })
}

export const isIPhoneBrowser = () =>
  typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent || '')
