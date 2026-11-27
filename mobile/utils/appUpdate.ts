import { AppState, AppStateStatus } from 'react-native'
import * as Updates from 'expo-updates'

// A new version (EAS Update) arrives by itself, no buttons and no closing the app:
// - it is looked for on every launch and every return to the app, and downloaded in the background;
// - if it lands within the first seconds after opening, the app restarts into it at once (it looks
//   like a slightly longer launch);
// - otherwise it switches on the next time the app is opened after a real break, so a quick hop to
//   the bank's app (to copy an amount) never loses what you were typing.
// Does nothing in Expo Go / development builds.

const LAUNCH_WINDOW_MS = 5000
const AWAY_FOR_RESTART_MS = 2 * 60 * 1000
const MIN_INTERVAL_MS = 5 * 60 * 1000

let lastCheck = 0
let running: Promise<boolean> | null = null
let ready = false
let started = false
let backgroundAt = 0

const enabled = () => Updates.isEnabled && !__DEV__

function restart() {
  Updates.reloadAsync().catch(e => console.warn('[Update] restart failed:', e))
}

/** Looks for a newer version and downloads it → whether one is ready to switch on */
function check(force: boolean): Promise<boolean> {
  if (!enabled()) return Promise.resolve(false)
  if (ready) return Promise.resolve(true)
  if (running) return running
  if (!force && Date.now() - lastCheck < MIN_INTERVAL_MS) return Promise.resolve(false)
  lastCheck = Date.now()
  running = (async () => {
    try {
      const { isAvailable } = await Updates.checkForUpdateAsync()
      if (!isAvailable) return false
      const { isNew } = await Updates.fetchUpdateAsync()
      if (isNew) ready = true
      return ready
    } catch (e) {
      console.warn('[Update] check failed:', e)
      return false
    } finally {
      running = null
    }
  })()
  return running
}

/** Just opened: look for a version and switch to it if it lands within the launch window */
function lookOnOpen(force: boolean) {
  const openedAt = Date.now()
  check(force).then(isReady => {
    if (isReady && Date.now() - openedAt < LAUNCH_WINDOW_MS && AppState.currentState === 'active') restart()
  })
}

/** Call once when the app starts */
export function startAutoUpdates() {
  if (started || !enabled()) return
  started = true
  lookOnOpen(true)
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'background') {
      backgroundAt = Date.now()
      return
    }
    if (state !== 'active' || !backgroundAt) return
    const away = Date.now() - backgroundAt
    backgroundAt = 0
    // Back after a real break: this counts as opening the app
    if (away >= AWAY_FOR_RESTART_MS) {
      if (ready) restart()
      else lookOnOpen(false)
    } else {
      // A quick hop: download quietly, switch on after the next break
      check(false)
    }
  })
}

/** Pull-to-refresh: also brings a new version, right away (you are waiting for a refresh anyway) */
export function checkForAppUpdate(): Promise<void> {
  return check(true).then(isReady => {
    if (isReady) restart()
  })
}
