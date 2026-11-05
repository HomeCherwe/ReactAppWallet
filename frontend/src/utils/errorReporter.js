import { supabase } from '../lib/supabase'
import { getApiUrl } from '../utils.jsx'

// Errors on the page go to the owner's «Адмінка» (the iPhone app has the same). Only in the built site.
// The same error is sent once per page load and a page sends a limited number: a loop can't flood it.

const MAX_PER_PAGE = 30
const SEND_AFTER_MS = 5000
// Not problems of the project: browser noise and the device being offline for a moment
const IGNORED = /ResizeObserver loop|Failed to fetch|NetworkError|Load failed|AbortError|aborted/i

const seen = new Set()
let pending = []
let timer = null

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
      body: JSON.stringify({ source: 'web', version: import.meta.env.VITE_APP_VERSION || null, items }),
    })
  } catch {
    // Reporting never causes errors of its own
  }
}

function report(message, details) {
  const text = String(message || '').trim()
  if (!text || IGNORED.test(text)) return
  const key = text.slice(0, 200)
  if (seen.has(key) || seen.size >= MAX_PER_PAGE) return
  seen.add(key)
  pending.push({ level: 'error', message: text.slice(0, 1000), details: details ? String(details).slice(0, 3000) : undefined, path: window.location.hash || '/' })
  if (!timer) timer = setTimeout(send, SEND_AFTER_MS)
}

export function installErrorReporter() {
  if (!import.meta.env.PROD) return

  window.addEventListener('error', e => report(e.message, e.error?.stack))
  window.addEventListener('unhandledrejection', e => report(e.reason?.message || e.reason, e.reason?.stack))

  const original = console.error.bind(console)
  console.error = (...args) => {
    original(...args)
    try {
      const firstError = args.find(a => a instanceof Error)
      const text = args
        .map(a => (a instanceof Error ? a.message : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a) } catch { return String(a) } })()))
        .join(' ')
      report(text, firstError?.stack)
    } catch {
      // Reporting never causes errors of its own
    }
  }
}
