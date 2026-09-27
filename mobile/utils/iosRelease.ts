import Constants from 'expo-constants'

const REPO = 'HomeCherwe/ReactAppWallet'
// The newest build: build-mobile-ios.yml replaces this file on every build from main
export const IPA_URL = `https://github.com/${REPO}/releases/download/ios-latest/MyWallet.ipa`
// SideStore downloads and installs the file by itself (docs.sidestore.io/docs/advanced/url-schema)
export const SIDESTORE_INSTALL_URL = `sidestore://install?url=${IPA_URL}`
const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/tags/ios-latest`

/** Version of the installed build (OTA updates keep it: runtimeVersion policy "appVersion") */
export const appVersion: string = Constants.expoConfig?.version ?? '0.0.0'

export function isNewerVersion(latest: string, current: string): boolean {
  const a = latest.split('.').map(n => parseInt(n, 10) || 0)
  const b = current.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
}

/** The newest published build ("MyWallet для iPhone 1.2.0" → "1.2.0"), or null if it can't be read */
export async function fetchLatestVersion(): Promise<{ version: string; updatedAt: string | null } | null> {
  try {
    const res = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) return null
    const release = await res.json()
    const version = String(release?.name ?? '').match(/(\d+\.\d+\.\d+)/)?.[1]
    const ipa = release?.assets?.find((a: any) => a.name === 'MyWallet.ipa')
    return version && ipa ? { version, updatedAt: ipa.updated_at ?? null } : null
  } catch {
    return null
  }
}
