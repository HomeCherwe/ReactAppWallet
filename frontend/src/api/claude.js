import { apiFetch } from '../utils.jsx'

// «Claude»: MyWallet as a connector in Claude (same as the iPhone app). The server keeps the connections.

/** { url, connections: [{ id, client_name, redirect_host, created_at, last_used_at }] } */
export const getClaudeConnections = () => apiFetch('/api/claude/connections')

export const removeClaudeConnection = id => apiFetch(`/api/claude/connections/${encodeURIComponent(id)}`, { method: 'DELETE' })

/** What Claude asks to connect: { client_name, redirect_host } */
export const getClaudeRequest = req => apiFetch('/api/claude/request', { method: 'POST', body: JSON.stringify({ req }) })

/** Approve or decline → { redirect } back to Claude */
export const answerClaudeRequest = (req, approve) =>
  apiFetch('/api/claude/approve', { method: 'POST', body: JSON.stringify({ req, approve }) })

// The consent link survives the Google sign-in (which drops the page's #/connect address)
const PENDING_KEY = 'mw_claude_connect'

export function takeConnectFromUrl() {
  const m = window.location.hash.match(/^#\/connect\?(?:.*&)?req=([^&]+)/)
  if (!m) return
  try {
    sessionStorage.setItem(PENDING_KEY, decodeURIComponent(m[1]))
  } catch {}
}

export function pendingConnect() {
  try {
    return sessionStorage.getItem(PENDING_KEY)
  } catch {
    return null
  }
}

export function clearPendingConnect() {
  try {
    sessionStorage.removeItem(PENDING_KEY)
  } catch {}
  if (window.location.hash.startsWith('#/connect')) window.history.replaceState(null, '', `${window.location.pathname}#/`)
}
