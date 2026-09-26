import { useEffect } from 'react'
import Constants from 'expo-constants'
import { updatePreferencesSection } from '../api/preferences'

/**
 * Tells the website this user has the iPhone app (preferences.iosApp), so the site stops
 * advertising it. Written once per launch after sign-in; the backend merges it into the preferences.
 */
export function useMarkAppInstalled(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return
    updatePreferencesSection('iosApp', {
      installed: true,
      lastSeenAt: new Date().toISOString(),
      version: Constants.expoConfig?.version ?? null,
    }).catch(() => {})
  }, [signedIn])
}
