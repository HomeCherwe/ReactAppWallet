import AsyncStorage from '@react-native-async-storage/async-storage'
import { File, Paths } from 'expo-file-system'

export interface SigningInfo {
  signedAt: Date | null
  expiresAt: Date
  /** Worked out from a refresh in SideStore, not read from the app (see readSigningInfo) */
  estimated?: boolean
}

// When this run of the app started: iOS only starts an app whose signature is still valid
const LAUNCHED_AT = new Date()
const REFRESHED_AT_KEY = 'signing_refreshed_at'
const DEFAULT_VALID_MS = 7 * 24 * 36e5

let cached: Promise<SigningInfo | null> | null = null

/**
 * The provisioning profile the app was installed with (embedded.mobileprovision): SideStore signs
 * the app with a free Apple ID for 7 days and puts the profile into the app. Its dates are plain
 * text in the (signed) plist. Null in Expo Go / development builds, which have none.
 */
async function readEmbedded(): Promise<SigningInfo | null> {
  try {
    const file = new File(Paths.bundle, 'embedded.mobileprovision')
    if (!file.exists) return null
    const bytes = await file.bytes()
    let text = ''
    for (let i = 0; i < bytes.length; i += 8192) {
      text += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)))
    }
    const dateOf = (key: string) => {
      const m = text.match(new RegExp(`<key>${key}</key>\\s*<date>([^<]+)</date>`))
      const d = m ? new Date(m[1]) : null
      return d && !isNaN(d.getTime()) ? d : null
    }
    const expiresAt = dateOf('ExpirationDate')
    return expiresAt ? { signedAt: dateOf('CreationDate'), expiresAt } : null
  } catch {
    return null
  }
}

/**
 * When this install's signature runs out.
 *
 * A refresh in SideStore ("7 DAYS" / Refresh All) installs a new profile on the phone but leaves the
 * app's own copy as it was, so that copy only knows the first 7 days. Since iOS won't start an app
 * whose signature ran out, a launch after that moment means it was refreshed before this launch.
 * The exact time of the refresh isn't known; the first launch after it is used (people usually open
 * the app right after refreshing it), and kept until the next expiry.
 */
export function readSigningInfo(): Promise<SigningInfo | null> {
  cached ??= (async () => {
    const embedded = await readEmbedded()
    if (!embedded) return null
    if (LAUNCHED_AT < embedded.expiresAt) return embedded

    const validMs = embedded.signedAt
      ? embedded.expiresAt.getTime() - embedded.signedAt.getTime()
      : DEFAULT_VALID_MS
    const stored = await AsyncStorage.getItem(REFRESHED_AT_KEY).catch(() => null)
    let refreshedAt = stored ? new Date(stored) : null
    // No guess yet, a guess from before this install, or that one ran out too: refreshed again
    if (
      !refreshedAt ||
      isNaN(refreshedAt.getTime()) ||
      refreshedAt < embedded.expiresAt ||
      refreshedAt.getTime() + validMs <= LAUNCHED_AT.getTime()
    ) {
      refreshedAt = LAUNCHED_AT
      AsyncStorage.setItem(REFRESHED_AT_KEY, refreshedAt.toISOString()).catch(() => {})
    }
    return { signedAt: refreshedAt, expiresAt: new Date(refreshedAt.getTime() + validMs), estimated: true }
  })()
  return cached
}

/** Whole hours left until the signature runs out (negative once it has) */
export const hoursLeft = (info: SigningInfo) => (info.expiresAt.getTime() - Date.now()) / 36e5
