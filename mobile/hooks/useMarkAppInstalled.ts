import { useEffect } from 'react'
import Constants from 'expo-constants'
import { updatePreferencesSection } from '../api/preferences'
import { readSigningInfo } from '../utils/signing'

/**
 * Tells the website this user has the iPhone app (preferences.iosApp), so the site stops
 * advertising it, and when the app's 7-day signature was made and runs out. Written once per
 * launch after sign-in; the backend merges it into the preferences.
 */
export function useMarkAppInstalled(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return
    readSigningInfo()
      .then(signing =>
        updatePreferencesSection('iosApp', {
          installed: true,
          lastSeenAt: new Date().toISOString(),
          version: Constants.expoConfig?.version ?? null,
          ...(signing && {
            signedAt: signing.signedAt?.toISOString() ?? null,
            signatureExpiresAt: signing.expiresAt.toISOString(),
            // After a refresh in SideStore the date is worked out, not read (utils/signing)
            signatureEstimated: !!signing.estimated,
          }),
        })
      )
      .catch(() => {})
  }, [signedIn])
}
