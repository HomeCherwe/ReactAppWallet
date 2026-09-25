import * as Updates from 'expo-updates'
import Toast from 'react-native-toast-message'

// Pull-to-refresh also looks for a new app version (EAS Update), at most this often
const MIN_INTERVAL_MS = 60 * 1000
let lastCheck = 0
let running: Promise<void> | null = null
let readyToRestart = false

function offerRestart() {
  Toast.show({
    type: 'success',
    text1: 'Нова версія завантажена',
    text2: 'Натисніть, щоб перезапустити застосунок',
    visibilityTime: 8000,
    onPress: () => {
      Toast.hide()
      Updates.reloadAsync().catch(() => {})
    },
  })
}

/**
 * Checks for a newer version of the app (OTA) and downloads it; when one is ready, a toast offers
 * to restart into it. Does nothing in Expo Go / development builds.
 */
export function checkForAppUpdate(): Promise<void> {
  if (!Updates.isEnabled || __DEV__) return Promise.resolve()
  if (readyToRestart) {
    offerRestart()
    return Promise.resolve()
  }
  if (running) return running
  if (Date.now() - lastCheck < MIN_INTERVAL_MS) return Promise.resolve()
  lastCheck = Date.now()

  running = (async () => {
    try {
      const { isAvailable } = await Updates.checkForUpdateAsync()
      if (!isAvailable) return
      const { isNew } = await Updates.fetchUpdateAsync()
      if (isNew) {
        readyToRestart = true
        offerRestart()
      }
    } catch (e) {
      console.warn('[Update] check failed:', e)
    } finally {
      running = null
    }
  })()
  return running
}
