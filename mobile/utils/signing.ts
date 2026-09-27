import { File, Paths } from 'expo-file-system'

export interface SigningInfo {
  signedAt: Date | null
  expiresAt: Date
}

let cached: Promise<SigningInfo | null> | null = null

/**
 * When this install's signature runs out. SideStore / Sideloadly sign the app with a free Apple ID
 * for 7 days and put that provisioning profile into the app as embedded.mobileprovision; its dates
 * are plain text in the (signed) plist. Null in Expo Go / development builds, which have none.
 * Read once per launch: a refresh in SideStore replaces the profile, and the app is relaunched after it.
 */
export function readSigningInfo(): Promise<SigningInfo | null> {
  cached ??= (async () => {
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
  })()
  return cached
}

/** Whole hours left until the signature runs out (negative once it has) */
export const hoursLeft = (info: SigningInfo) => (info.expiresAt.getTime() - Date.now()) / 36e5
