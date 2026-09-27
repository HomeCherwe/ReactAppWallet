import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, Smartphone, Wallet } from 'lucide-react'
import IosAppGuide from './IosAppGuide'
import { useIosApp } from '../utils/iosApp'
import { useSettingsStore } from '../store/useSettingsStore'

const INTRO_CYCLES = 3
const PHONE_MS = 1700 // the iPhone face stays this long
const WALLET_MS = 1100 // then the wallet again

// One intro per page load, shared by every logo on the page (sidebar and the phone header are both
// mounted, one of them hidden by CSS), so they stay in step and a remount doesn't replay it
const intro = { started: false, phone: false, done: false, listeners: new Set() }
const emit = () => intro.listeners.forEach(l => l())

function startIntro() {
  if (intro.started) return
  intro.started = true
  let t = 600
  const at = (ms, fn) => setTimeout(() => { fn(); emit() }, ms)
  for (let i = 0; i < INTRO_CYCLES; i++) {
    at(t, () => { intro.phone = true })
    t += PHONE_MS
    at(t, () => { intro.phone = false })
    t += WALLET_MS
  }
  at(t, () => { intro.done = true })
}

function useIntro(enabled) {
  const [, rerender] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const listener = () => rerender(n => n + 1)
    intro.listeners.add(listener)
    startIntro()
    return () => intro.listeners.delete(listener)
  }, [enabled])
  return enabled ? { showPhone: intro.phone, introDone: intro.done } : { showPhone: false, introDone: true }
}

/**
 * The MyWallet icon. Until the user has the iPhone app, it advertises it: on page load it turns into
 * an iPhone with a download arrow a couple of times, then every few seconds a light runs around its
 * outline. A click opens the install guide (always — it's also where the newest build is).
 */
export default function AppLogo({ size = 36, withLabel = false }) {
  const installed = !!useIosApp()?.installed
  // Wait for the settings, so people who have the app don't see a flash of the promo
  const settingsReady = useSettingsStore(state => state.initialized)
  const reduceMotion = useReducedMotion()
  const promo = settingsReady && !installed && !reduceMotion
  const { showPhone, introDone } = useIntro(promo)
  const [guideOpen, setGuideOpen] = useState(false)

  const radius = Math.round(size / 3)
  const icon = Math.round(size / 2)

  return (
    <>
      <button
        type="button"
        onClick={() => setGuideOpen(true)}
        className="flex items-center gap-2.5 text-left"
        title="MyWallet для iPhone — як встановити"
      >
        <span className="relative shrink-0" style={{ width: size, height: size, perspective: 400 }}>
          {/* Soft pulse behind the iPhone face */}
          <AnimatePresence>
            {promo && showPhone && (
              <motion.span
                key="pulse"
                className="absolute inset-0 bg-brand"
                style={{ borderRadius: radius }}
                initial={{ opacity: 0.55, scale: 1 }}
                animate={{ opacity: 0, scale: 1.7 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>

          <span
            className="absolute inset-0 overflow-hidden bg-gradient-to-br from-brand to-brand-deep shadow-brand grid place-items-center"
            style={{ borderRadius: radius }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {showPhone ? (
                <motion.span
                  key="phone"
                  className="relative grid place-items-center"
                  initial={{ rotateY: -90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  exit={{ rotateY: 90, opacity: 0 }}
                  transition={{ duration: 0.28 }}
                >
                  <Smartphone size={icon} className="text-white" />
                  <motion.span
                    className="absolute grid place-items-center"
                    animate={{ y: [-3, 2, -3] }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <ArrowDown size={Math.round(icon * 0.55)} strokeWidth={3} className="text-white" />
                  </motion.span>
                </motion.span>
              ) : (
                <motion.span
                  key="wallet"
                  className="grid place-items-center"
                  initial={{ rotateY: -90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  exit={{ rotateY: 90, opacity: 0 }}
                  transition={{ duration: 0.28 }}
                >
                  <Wallet size={icon} className="text-white" />
                </motion.span>
              )}
            </AnimatePresence>
          </span>

          {/* After the intro: a light runs around the outline now and then, so it's remembered */}
          {promo && introDone && (
            <svg className="absolute pointer-events-none overflow-visible" style={{ inset: -3 }} width={size + 6} height={size + 6}>
              <defs>
                <linearGradient id="app-logo-trace" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#FFFFFF" />
                  <stop offset="1" stopColor="#FFB070" />
                </linearGradient>
              </defs>
              <motion.rect
                x={1}
                y={1}
                width={size + 4}
                height={size + 4}
                rx={radius + 2}
                fill="none"
                stroke="url(#app-logo-trace)"
                strokeWidth={2}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="0.28 0.72"
                initial={{ strokeDashoffset: 0, opacity: 0 }}
                animate={{ strokeDashoffset: [0, -1], opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.8, times: [0, 0.15, 0.8, 1], ease: 'easeInOut', repeat: Infinity, repeatDelay: 6 }}
              />
            </svg>
          )}
        </span>

        {withLabel && (
          <span className="relative block h-5 overflow-hidden min-w-[92px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={showPhone ? 'promo' : 'name'}
                className={`block whitespace-nowrap ${showPhone ? 'text-sm font-semibold text-orange-200' : 'font-bold tracking-tight'}`}
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -14, opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                {showPhone ? 'Є на iPhone' : 'MyWallet'}
              </motion.span>
            </AnimatePresence>
          </span>
        )}
      </button>

      <IosAppGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  )
}
