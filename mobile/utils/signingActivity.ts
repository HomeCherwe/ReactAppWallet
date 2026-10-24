import { requireOptionalNativeModule } from 'expo'
import { SIGNING_WARN_HOURS } from './reminders'
import { SigningInfo, hoursLeft } from './signing'

interface SigningActivityModule {
  show(expiresAt: number, estimated: boolean): Promise<void>
  hide(): Promise<void>
}

// The native part (modules/signing-activity and the widget in targets/signing-widget) comes with
// a build; older builds don't have it and get only the notifications
const native = requireOptionalNativeModule<SigningActivityModule>('SigningActivity')

/**
 * The live activity on the Lock Screen (and in the Dynamic Island) while the signature is running
 * out: it stays above the notifications instead of sliding down under newer ones, with a countdown,
 * until the signature is refreshed. iOS ends one after 8 hours (it stays on the Lock Screen up to
 * 4 more) and lets the app start one only while it's open, so it's started anew on every opening.
 */
export async function syncSigningActivity(info: SigningInfo | null): Promise<void> {
  if (!native) return
  try {
    if (info && hoursLeft(info) <= SIGNING_WARN_HOURS) await native.show(info.expiresAt.getTime(), !!info.estimated)
    else await native.hide()
  } catch (e) {
    console.warn('[SigningActivity]', e)
  }
}
