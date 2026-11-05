import Constants from 'expo-constants'
import { supabase } from '../lib/supabase'
import { getApiUrl } from '../lib/apiFetch'

// Errors in the app go to the owner's «Адмінка» (the web has the same). Not while developing.
// The same error is sent once per launch and a launch sends a limited number: a loop can't flood it.

const MAX_PER_LAUNCH = 30
const SEND_AFTER_MS = 5000
// Not problems of the project: the phone being offline for a moment
const IGNORED = /Network request failed|Aborted|AbortError/i

const seen = new Set<string>()
let pending: { level: 'error'; message: string; details?: string }[] = []
let timer: ReturnType<typeof setTimeout> | null = null

async function send() {
  timer = null
  const items = pending
  pending = []
  if (!items.length) return
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    await fetch(`${getApiUrl()}/api/logs/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ source: 'ios', version: Constants.expoConfig?.version ?? null, items }),
    })
  } catch {
    // Reporting never causes errors of its own
  }
}

function report(message: unknown, details?: unknown) {
  const text = String(message ?? '').trim()
  if (!text || IGNORED.test(text)) return
  const key = text.slice(0, 200)
  if (seen.has(key) || seen.size >= MAX_PER_LAUNCH) return
  seen.add(key)
  pending.push({ level: 'error', message: text.slice(0, 1000), details: details ? String(details).slice(0, 3000) : undefined })
  if (!timer) timer = setTimeout(send, SEND_AFTER_MS)
}

export function installErrorReporter() {
  if (__DEV__) return

  // Crashes and unhandled errors, then whatever was handling them before
  const errorUtils = (globalThis as any).ErrorUtils
  const previous = errorUtils?.getGlobalHandler?.()
  errorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
    report(error?.message || error, error?.stack)
    if (isFatal) send()
    previous?.(error, isFatal)
  })

  const original = console.error.bind(console)
  console.error = (...args: any[]) => {
    original(...args)
    try {
      const firstError = args.find(a => a instanceof Error) as Error | undefined
      const text = args
        .map(a => {
          if (a instanceof Error) return a.message
          if (typeof a === 'string') return a
          try {
            return JSON.stringify(a)
          } catch {
            return String(a)
          }
        })
        .join(' ')
      report(text, firstError?.stack)
    } catch {
      // Reporting never causes errors of its own
    }
  }
}
