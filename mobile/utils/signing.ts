import AsyncStorage from '@react-native-async-storage/async-storage'
import { File, Paths } from 'expo-file-system'

export interface SigningInfo {
  signedAt: Date | null
  expiresAt: Date
  /** Not exact: worked out from a launch or from the days SideStore shows (see readSigningInfo) */
  estimated?: boolean
  /** Refreshed in SideStore at a time the app doesn't know: the date is a guess until the person says when */
  needsConfirm?: boolean
}

/**
 * Where the date comes from: the profile inside the app, the person saying they just refreshed it,
 * the days SideStore shows, or a launch after the signature should have run out.
 */
type Source = 'embedded' | 'confirmed' | 'days' | 'launch'
interface Signing {
  signedAt: Date | null
  expiresAt: Date
  source: Source
}

// When this run of the app started: iOS only starts an app whose signature is still valid
const LAUNCHED_AT = new Date()
const STATE_KEY = 'signing_state'
const OLD_REFRESHED_AT_KEY = 'signing_refreshed_at'
const DEFAULT_VALID_MS = 7 * 24 * 36e5

let embeddedPromise: Promise<Signing | null> | null = null
let cached: Promise<SigningInfo | null> | null = null
const listeners = new Set<(info: SigningInfo) => void>()

/**
 * The provisioning profile the app was installed with (embedded.mobileprovision): SideStore signs
 * the app with a free Apple ID for 7 days and puts the profile into the app. Its dates are plain
 * text in the (signed) plist. Null in Expo Go / development builds, which have none.
 */
async function readEmbedded(): Promise<Signing | null> {
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
    return expiresAt ? { signedAt: dateOf('CreationDate'), expiresAt, source: 'embedded' } : null
  } catch {
    return null
  }
}

const getEmbedded = () => (embeddedPromise ??= readEmbedded())

const validMsOf = (embedded: Signing) =>
  embedded.signedAt ? embedded.expiresAt.getTime() - embedded.signedAt.getTime() : DEFAULT_VALID_MS

async function loadState(validMs: number): Promise<Signing | null> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY)
    if (!raw) {
      // Earlier versions kept only a guessed refresh time (the first launch after the signature ran out)
      const old = await AsyncStorage.getItem(OLD_REFRESHED_AT_KEY)
      const signedAt = old ? new Date(old) : null
      if (!signedAt || isNaN(signedAt.getTime())) return null
      return { signedAt, expiresAt: new Date(signedAt.getTime() + validMs), source: 'launch' }
    }
    const s = JSON.parse(raw)
    const expiresAt = new Date(s.expiresAt)
    if (isNaN(expiresAt.getTime())) return null
    return { signedAt: s.signedAt ? new Date(s.signedAt) : null, expiresAt, source: s.source }
  } catch {
    return null
  }
}

function saveState(s: Signing) {
  AsyncStorage.setItem(
    STATE_KEY,
    JSON.stringify({ signedAt: s.signedAt?.toISOString() ?? null, expiresAt: s.expiresAt.toISOString(), source: s.source })
  ).catch(() => {})
}

const toInfo = (s: Signing): SigningInfo => ({
  signedAt: s.signedAt,
  expiresAt: s.expiresAt,
  estimated: s.source === 'days' || s.source === 'launch',
  needsConfirm: s.source === 'launch',
})

/**
 * When this install's signature runs out.
 *
 * A refresh in SideStore ("7 DAYS" / Refresh All) installs a new profile on the phone but leaves the
 * app's own copy as it was, so that copy only knows the first 7 days; the app can't see a refresh.
 * So the person tells it (confirmRefresh), and that date is kept. A later one only ever comes from
 * a refresh, so the latest known date wins; a new build installed over it brings a newer profile.
 *
 * Since iOS won't start an app whose signature ran out, a launch after that moment means it was
 * refreshed at some point the app doesn't know. The launch is used until the person says when.
 */
export function readSigningInfo(): Promise<SigningInfo | null> {
  cached ??= (async () => {
    const embedded = await getEmbedded()
    if (!embedded) return null
    let best = embedded
    const stored = await loadState(validMsOf(embedded))
    if (stored && stored.expiresAt > best.expiresAt) best = stored
    if (LAUNCHED_AT >= best.expiresAt) {
      best = { signedAt: LAUNCHED_AT, expiresAt: new Date(LAUNCHED_AT.getTime() + validMsOf(embedded)), source: 'launch' }
      saveState(best)
    }
    return toInfo(best)
  })()
  return cached
}

/**
 * The person refreshed MyWallet in SideStore: just now, or earlier — then `daysShown` is what
 * SideStore shows next to it («7 DAYS» on the day of a refresh). SideStore counts calendar days, so
 * the signature is taken to run out at the start of that day: reminders come early rather than late.
 */
export async function confirmRefresh(daysShown?: number): Promise<SigningInfo | null> {
  const embedded = await getEmbedded()
  if (!embedded) return null
  const validMs = validMsOf(embedded)
  const now = new Date()
  let next: Signing
  if (daysShown == null) {
    next = { signedAt: now, expiresAt: new Date(now.getTime() + validMs), source: 'confirmed' }
  } else {
    const expiresAt = new Date(now)
    expiresAt.setHours(0, 0, 0, 0)
    expiresAt.setDate(expiresAt.getDate() + daysShown)
    next = { signedAt: new Date(expiresAt.getTime() - validMs), expiresAt, source: 'days' }
  }
  saveState(next)
  // The profile inside the app is exact, so never earlier than that
  const info = toInfo(next.expiresAt > embedded.expiresAt ? next : embedded)
  cached = Promise.resolve(info)
  listeners.forEach(l => l(info))
  return info
}

/** Called when the person says they refreshed the signature (confirmRefresh) */
export function onSigningChange(listener: (info: SigningInfo) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Whole hours left until the signature runs out (negative once it has) */
export const hoursLeft = (info: SigningInfo) => (info.expiresAt.getTime() - Date.now()) / 36e5
