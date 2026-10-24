import { useEffect } from 'react'
import Constants from 'expo-constants'
import { updatePreferencesSection } from '../api/preferences'
import { SigningInfo, onSigningChange, readSigningInfo } from '../utils/signing'

function writeIosApp(signing: SigningInfo | null) {
  return updatePreferencesSection('iosApp', {
    installed: true,
    lastSeenAt: new Date().toISOString(),
    version: Constants.expoConfig?.version ?? null,
    ...(signing && {
      signedAt: signing.signedAt?.toISOString() ?? null,
      signatureExpiresAt: signing.expiresAt.toISOString(),
      // After a refresh in SideStore the date may be worked out, not read (utils/signing)
      signatureEstimated: !!signing.estimated,
    }),
  })
}

/**
 * Tells the website this user has the iPhone app (preferences.iosApp), so the site stops
 * advertising it, and when the app's 7-day signature was made and runs out. Written once per
 * launch after sign-in, and again when the person says they refreshed the signature; the backend
 * merges it into the preferences.
 */
export function useMarkAppInstalled(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return
    readSigningInfo()
      .then(writeIosApp)
      .catch(() => {})
    return onSigningChange(info => {
      writeIosApp(info).catch(() => {})
    })
  }, [signedIn])
}
