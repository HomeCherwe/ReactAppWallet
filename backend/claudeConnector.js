// «Claude»: MyWallet as a connector (remote MCP server) for Claude — claude.ai, the Claude apps, Claude Code.
// Anyone with a MyWallet account adds https://<this server>/mcp as a custom connector; Claude then
// signs them in with OAuth: our consent page (web app, #/connect) → a code → tokens. Each approval
// is a «connection» kept in the user's preferences (claude_connections); deleting it in Settings
// cuts Claude off at once. Codes and tokens are sealed with ENCRYPTION_KEY, so no extra tables.
//
// What Claude can do: the AI assistant's read functions (assistant.js), list accounts and
// categories, and add a transaction — always on an account Claude names (never picked for the user).

import crypto from 'crypto'
import { encryptJSON, decryptJSON } from './secretBox.js'
import { TOOLS as ASSISTANT_TOOLS, runTool, loadContext, accountLabel, compactRow, TX_FIELDS } from './assistant.js'
import { cardLabelOf } from './transfers.js'

const WEB_APP_URL = (process.env.WEB_APP_URL || 'https://homecherwe.github.io/ReactAppWallet/').replace(/\/?$/, '/')
const ACCESS_TTL_S = 3600
const CODE_TTL_MS = 5 * 60e3
const REQUEST_TTL_MS = 30 * 60e3
const MAX_CONNECTIONS = 20
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const TIME_ZONE = process.env.CONNECTOR_TIME_ZONE || 'Europe/Kyiv'
const PREF_KEY = 'claude_connections'

// ---------------------------------------------------------------------------
// Sealed values: codes, tokens and client ids are encrypted JSON, so nobody can forge or read them
// ---------------------------------------------------------------------------

const b64url = s => Buffer.from(s, 'utf8').toString('base64url')
const sha = s => crypto.createHash('sha256').update(String(s)).digest('base64url')

function seal(type, value) {
  return `mw${type}_${b64url(encryptJSON({ ...value, t: type }))}`
}

function unseal(type, str) {
  const s = String(str || '')
  if (!s.startsWith(`mw${type}_`)) return null
  try {
    const v = decryptJSON(Buffer.from(s.slice(type.length + 3), 'base64url').toString('utf8'))
    if (v?.t !== type) return null
    if (v.exp && Date.now() > v.exp) return null
    return v
  } catch {
    return null
  }
}

function baseUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim()
  const host = String(req.headers['x-forwarded-host'] || req.headers.host).split(',')[0].trim()
  return `${proto}://${host}`
}

// Where Claude may send the user back: https anywhere (claude.ai, claude.com), http only to this computer (Claude Code)
function redirectAllowed(uri) {
  try {
    const u = new URL(uri)
    if (u.hash) return false
    if (u.protocol === 'https:') return true
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  } catch {
    return false
  }
}

function withParams(uri, params) {
  const u = new URL(uri)
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v)
  return u.toString()
}

// Hours ahead of UTC in the user's time zone (dates Claude asks about are the user's days)
function offsetMinutes(timeZone = TIME_ZONE) {
  try {
    const now = new Date()
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        .formatToParts(now)
        .map(p => [p.type, p.value])
    )
    const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute)
    return Math.round((local - now.getTime()) / 60000)
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Connections (one per approval), kept in user_preferences.preferences.claude_connections
// ---------------------------------------------------------------------------

async function readConnections(supabase, userId) {
  const { data, error } = await supabase.from('user_preferences').select('preferences').eq('user_id', userId).maybeSingle()
  if (error) throw error
  const list = data?.preferences?.[PREF_KEY]
  return Array.isArray(list) ? list : []
}

/** Reads, changes and saves the user's connections; `change` gets the list and returns the new one */
async function updateConnections(supabase, userId, change) {
  const { data: row, error } = await supabase.from('user_preferences').select('preferences').eq('user_id', userId).maybeSingle()
  if (error) throw error
  const preferences = { ...(row?.preferences || {}) }
  const list = Array.isArray(preferences[PREF_KEY]) ? preferences[PREF_KEY] : []
  preferences[PREF_KEY] = change(list.map(c => ({ ...c })))
  const { error: saveError } = await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, preferences, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (saveError) throw saveError
  return preferences[PREF_KEY]
}

const publicConnection = c => ({
  id: c.id,
  client_name: c.client_name,
  redirect_host: c.redirect_host,
  created_at: c.created_at,
  last_used_at: c.last_used_at || null,
})

// ---------------------------------------------------------------------------
// The functions Claude may call
// ---------------------------------------------------------------------------

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false }

const TOOLS = [
  ...ASSISTANT_TOOLS.map(({ function: f }) => ({
    name: f.name,
    description: f.description,
    inputSchema: f.parameters,
    annotations: READ_ONLY,
  })),
  {
    name: 'list_accounts',
    description:
      'Every account of the user with its id, name (bank + card, as the app shows it), kind (card, cash, savings, investment) and currency. Use it to find the exact account before add_transaction.',
    inputSchema: { type: 'object', properties: { include_archived: { type: 'boolean', description: 'Also accounts hidden in the archive' } } },
    annotations: READ_ONLY,
  },
  {
    name: 'list_categories',
    description: 'The user\'s transaction categories, most used first. Pick one of these for add_transaction.',
    inputSchema: { type: 'object', properties: {} },
    annotations: READ_ONLY,
  },
  {
    name: 'add_transaction',
    description:
      'Records one transaction in MyWallet. The account must be one the user named or confirmed — never guess it; ask the user if it is not clear. The amount is in the account\'s currency.',
    inputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Account id from list_accounts, or its exact name' },
        kind: { type: 'string', enum: ['expense', 'income'] },
        amount: { type: 'number', description: 'How much, a positive number in the account\'s currency' },
        category: { type: 'string', description: 'A category from list_categories (a new name creates a new category)' },
        note: { type: 'string', description: 'What it was: merchant, purpose' },
        date: { type: 'string', description: 'When: YYYY-MM-DD or YYYY-MM-DD HH:MM in the user\'s time zone; now if left out' },
        exclude_from_stats: { type: 'boolean', description: 'Keep it out of statistics (default false)' },
      },
      required: ['account', 'kind', 'amount', 'category'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
]

function findAccount(ctx, wanted) {
  const s = String(wanted || '').trim()
  if (!s) return { error: 'Name the account (see list_accounts).' }
  const live = ctx.cards
  const byId = live.find(c => c.id === s)
  if (byId) return { card: byId }
  const low = s.toLowerCase()
  const exact = live.filter(c => accountLabel(c).toLowerCase() === low || String(c.name || '').toLowerCase() === low)
  if (exact.length === 1) return { card: exact[0] }
  const partial = (exact.length ? exact : live).filter(c => accountLabel(c).toLowerCase().includes(low))
  if (partial.length === 1) return { card: partial[0] }
  const options = (partial.length ? partial : live).filter(c => !c.archived).map(c => ({ id: c.id, name: accountLabel(c), currency: c.currency }))
  return { error: partial.length ? `"${s}" matches several accounts — ask the user which one.` : `No account "${s}".`, accounts: options }
}

function localDate(text, offsetMin) {
  if (!text) return new Date()
  const m = String(text).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  // A day without a time: noon, so it never slips into the next or previous day
  const utc = Date.UTC(+y, +mo - 1, +d, h ? +h : 12, mi ? +mi : 0) - offsetMin * 60000
  const date = new Date(utc)
  return Number.isNaN(date.getTime()) ? null : date
}

async function callTool(name, args, { supabase, userId }) {
  const offsetMin = offsetMinutes()
  const ctx = await loadContext(supabase, userId, offsetMin)

  if (name === 'list_accounts') {
    return {
      accounts: ctx.cards
        .filter(c => args.include_archived || !c.archived)
        .map(c => ({ id: c.id, name: accountLabel(c), kind: c.kind, currency: c.currency, ...(c.archived && { archived: true }), ...(c.goal && { goal: c.goal }) })),
    }
  }

  if (name === 'list_categories') return { categories: ctx.categories }

  if (name === 'add_transaction') {
    const found = findAccount(ctx, args.account)
    if (found.error) return found
    const amount = Math.abs(Number(args.amount))
    if (!Number.isFinite(amount) || amount === 0) return { error: 'amount must be a positive number' }
    if (!['expense', 'income'].includes(args.kind)) return { error: 'kind must be expense or income' }
    const category = String(args.category || '').trim().slice(0, 60)
    if (!category) return { error: 'category is required (see list_categories)' }
    const when = localDate(args.date, offsetMin)
    if (!when) return { error: 'date must look like 2026-11-27 or 2026-11-27 14:30' }

    const { data: card } = await supabase.from('cards').select('name, bank, banks(name)').eq('id', found.card.id).eq('user_id', userId).maybeSingle()
    if (!card) return { error: 'account not found' }
    const signed = args.kind === 'expense' ? -amount : amount
    const row = {
      user_id: userId,
      amount: signed,
      amount_stat: signed,
      category,
      note: String(args.note || '').trim().slice(0, 500) || null,
      card_id: found.card.id,
      card: cardLabelOf(card),
      created_at: when.toISOString(),
      archives: false,
      is_debt: false,
      exclude_from_stats: !!args.exclude_from_stats,
    }
    const { data, error } = await supabase.from('transactions').insert([row]).select(TX_FIELDS).single()
    if (error) throw error
    return { added: compactRow(data, ctx) }
  }

  if (!ASSISTANT_TOOLS.some(t => t.function.name === name)) return { error: `unknown tool ${name}` }
  return runTool(name, args, { supabase, userId, ctx, seen: new Set() })
}

// ---------------------------------------------------------------------------
// MCP over HTTP (Streamable HTTP, answers as plain JSON — no sessions, fits Vercel functions)
// ---------------------------------------------------------------------------

function instructions() {
  return [
    'MyWallet is the user\'s personal finance app: accounts, transactions, subscriptions.',
    `Dates are in the user\'s time zone (${TIME_ZONE}). Negative amounts are spending, positive are income.`,
    'Statistics follow the app\'s rules: transfers, refunds and excluded categories or accounts don\'t count.',
    'Before add_transaction, make sure the user named the account; never choose one for them.',
    'Answer the user in their language (usually Ukrainian).',
  ].join(' ')
}

export async function handleRpc(msg, auth) {
  const { id, method, params } = msg || {}
  const reply = result => ({ jsonrpc: '2.0', id, result })
  const fail = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

  if (!msg || msg.jsonrpc !== '2.0' || typeof method !== 'string') return fail(-32600, 'Invalid request')
  // Notifications (no id) get no answer
  if (id === undefined || id === null) return null

  if (method === 'initialize') {
    const asked = params?.protocolVersion
    return reply({
      protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'MyWallet', title: 'MyWallet', version: '1.0.0' },
      instructions: instructions(),
    })
  }
  if (method === 'ping') return reply({})
  if (method === 'tools/list') return reply({ tools: TOOLS })
  if (method === 'tools/call') {
    const name = params?.name
    if (!TOOLS.some(t => t.name === name)) return fail(-32602, `Unknown tool: ${name}`)
    try {
      const result = await callTool(name, params?.arguments || {}, auth)
      return reply({
        content: [{ type: 'text', text: JSON.stringify(result).slice(0, 60000) }],
        isError: !!result?.error,
      })
    } catch (e) {
      console.error(`[Claude connector] ${name} failed:`, e.message)
      return reply({ content: [{ type: 'text', text: 'MyWallet could not do this right now, try again.' }], isError: true })
    }
  }
  if (method === 'resources/list') return reply({ resources: [] })
  if (method === 'prompts/list') return reply({ prompts: [] })
  return fail(-32601, `Method not found: ${method}`)
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerClaudeConnector(app, { supabase, getUserFromToken }) {
  // Settings and the consent page: only a signed-in user with a real token (never a bare user_id)
  const signedIn = (req, res, next) =>
    /^Bearer\s+\S+/.test(String(req.headers.authorization || '')) ? getUserFromToken(req, res, next) : res.status(401).json({ error: 'Увійди в MyWallet' })

  const oauthMeta = req => {
    const base = baseUrl(req)
    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['wallet'],
    }
  }
  const resourceMeta = req => {
    const base = baseUrl(req)
    return {
      resource: `${base}/mcp`,
      authorization_servers: [base],
      scopes_supported: ['wallet'],
      bearer_methods_supported: ['header'],
      resource_name: 'MyWallet',
    }
  }
  app.get(['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/mcp', '/.well-known/openid-configuration'], (req, res) =>
    res.json(oauthMeta(req))
  )
  app.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], (req, res) => res.json(resourceMeta(req)))

  // Dynamic client registration (Claude registers itself before the first sign-in)
  app.post('/oauth/register', (req, res) => {
    const uris = Array.isArray(req.body?.redirect_uris) ? req.body.redirect_uris.map(String) : []
    if (!uris.length || uris.length > 10 || !uris.every(redirectAllowed)) {
      return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris must be https (or http on localhost)' })
    }
    const name = String(req.body?.client_name || 'Claude').slice(0, 80)
    const client_id = seal('c', { uris, name })
    res.status(201).json({
      client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    })
  })

  // Claude sends the user here; we pass the request on to the web app, where they sign in and approve
  app.get('/oauth/authorize', (req, res) => {
    const q = req.query
    const client = unseal('c', q.client_id)
    const redirect = String(q.redirect_uri || '')
    if (!client) return res.status(400).type('text/plain').send('Unknown client. Remove the connector in Claude and add it again.')
    if (!client.uris.includes(redirect)) return res.status(400).type('text/plain').send('This redirect address was not registered by the client.')
    const back = (error, description) => res.redirect(withParams(redirect, { error, error_description: description, state: q.state }))
    if (q.response_type !== 'code') return back('unsupported_response_type')
    if (!q.code_challenge || (q.code_challenge_method && q.code_challenge_method !== 'S256')) return back('invalid_request', 'PKCE S256 is required')

    const request = seal('r', {
      client_key: sha(q.client_id),
      client_name: client.name,
      redirect,
      challenge: String(q.code_challenge),
      state: q.state ? String(q.state) : '',
      exp: Date.now() + REQUEST_TTL_MS,
    })
    res.redirect(`${WEB_APP_URL}#/connect?req=${encodeURIComponent(request)}`)
  })

  // The consent page asks what is being approved
  app.post('/api/claude/request', signedIn, (req, res) => {
    const r = unseal('r', req.body?.req)
    if (!r) return res.status(400).json({ error: 'Запит застарів — почни підключення в Claude ще раз' })
    res.json({ client_name: r.client_name, redirect_host: new URL(r.redirect).host })
  })

  // The user approved (or declined) on the consent page → where the browser goes next
  app.post('/api/claude/approve', signedIn, async (req, res) => {
    const r = unseal('r', req.body?.req)
    if (!r) return res.status(400).json({ error: 'Запит застарів — почни підключення в Claude ще раз' })
    if (req.body?.approve !== true) {
      return res.json({ redirect: withParams(r.redirect, { error: 'access_denied', state: r.state }) })
    }
    try {
      const id = crypto.randomBytes(9).toString('base64url')
      // Approvals Claude never finished (older than the code) are dropped on the way
      const stale = c => !c.active && Date.now() - Date.parse(c.created_at) > CODE_TTL_MS
      await updateConnections(supabase, req.user_id, list =>
        [...list.filter(c => !stale(c)), { id, client_name: r.client_name, redirect_host: new URL(r.redirect).host, created_at: new Date().toISOString(), active: false }]
          .slice(-MAX_CONNECTIONS)
      )
      const code = seal('a', { uid: req.user_id, gid: id, client_key: r.client_key, redirect: r.redirect, challenge: r.challenge, exp: Date.now() + CODE_TTL_MS })
      res.json({ redirect: withParams(r.redirect, { code, state: r.state }) })
    } catch (e) {
      console.error('[Claude connector] approve failed:', e.message)
      res.status(500).json({ error: 'Не вдалося підключити — спробуй ще раз' })
    }
  })

  const tokenError = (res, error, description, status = 400) => res.status(status).json({ error, error_description: description })
  const issueTokens = (uid, gid, client_key) => ({
    access_token: seal('t', { uid, gid, exp: Date.now() + ACCESS_TTL_S * 1000 }),
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_S,
    refresh_token: seal('f', { uid, gid, client_key }),
    scope: 'wallet',
  })

  app.post('/oauth/token', async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const b = req.body || {}
    try {
      if (b.grant_type === 'authorization_code') {
        const code = unseal('a', b.code)
        if (!code) return tokenError(res, 'invalid_grant', 'code expired or invalid')
        if (code.client_key !== sha(b.client_id)) return tokenError(res, 'invalid_grant', 'code was issued to another client')
        if (b.redirect_uri && b.redirect_uri !== code.redirect) return tokenError(res, 'invalid_grant', 'redirect_uri does not match')
        if (!b.code_verifier || sha(b.code_verifier) !== code.challenge) return tokenError(res, 'invalid_grant', 'PKCE check failed')
        // A code works once: it switches its connection on
        let used = true
        await updateConnections(supabase, code.uid, list =>
          list.map(c => {
            if (c.id !== code.gid || c.active) return c
            used = false
            return { ...c, active: true, last_used_at: new Date().toISOString() }
          })
        )
        if (used) return tokenError(res, 'invalid_grant', 'code already used or connection removed')
        return res.json(issueTokens(code.uid, code.gid, code.client_key))
      }
      if (b.grant_type === 'refresh_token') {
        const rt = unseal('f', b.refresh_token)
        if (!rt) return tokenError(res, 'invalid_grant', 'refresh token invalid')
        if (b.client_id && rt.client_key !== sha(b.client_id)) return tokenError(res, 'invalid_grant', 'refresh token was issued to another client')
        const list = await readConnections(supabase, rt.uid)
        if (!list.some(c => c.id === rt.gid && c.active)) return tokenError(res, 'invalid_grant', 'connection was removed in MyWallet')
        return res.json(issueTokens(rt.uid, rt.gid, rt.client_key))
      }
      return tokenError(res, 'unsupported_grant_type', 'use authorization_code or refresh_token')
    } catch (e) {
      console.error('[Claude connector] token failed:', e.message)
      return tokenError(res, 'server_error', 'try again', 500)
    }
  })

  // Who is calling /mcp: a live access token of a connection that still exists
  async function mcpAuth(req, res) {
    const unauthorized = description => {
      res.set('WWW-Authenticate', `Bearer resource_metadata="${baseUrl(req)}/.well-known/oauth-protected-resource/mcp"${description ? `, error="invalid_token", error_description="${description}"` : ''}`)
      res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Sign in to MyWallet' } })
      return null
    }
    const header = String(req.headers.authorization || '')
    if (!header.startsWith('Bearer ')) return unauthorized()
    const at = unseal('t', header.slice(7).trim())
    if (!at) return unauthorized('token expired')
    const list = await readConnections(supabase, at.uid)
    const conn = list.find(c => c.id === at.gid && c.active)
    if (!conn) return unauthorized('connection removed')
    // Remember when Claude last used it (at most once an hour, to keep writes rare)
    if (!conn.last_used_at || Date.now() - Date.parse(conn.last_used_at) > 36e5) {
      updateConnections(supabase, at.uid, l => l.map(c => (c.id === at.gid ? { ...c, last_used_at: new Date().toISOString() } : c))).catch(() => {})
    }
    return { supabase, userId: at.uid }
  }

  app.post('/mcp', async (req, res) => {
    try {
      const auth = await mcpAuth(req, res)
      if (!auth) return
      const body = req.body
      if (Array.isArray(body)) {
        const out = (await Promise.all(body.map(m => handleRpc(m, auth)))).filter(Boolean)
        return out.length ? res.json(out) : res.status(202).end()
      }
      const out = await handleRpc(body, auth)
      return out ? res.json(out) : res.status(202).end()
    } catch (e) {
      console.error('[Claude connector] mcp failed:', e.message)
      res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } })
    }
  })
  // No server-sent stream and no sessions
  app.get('/mcp', (req, res) => res.status(405).set('Allow', 'POST').end())
  app.delete('/mcp', (req, res) => res.status(405).set('Allow', 'POST').end())

  // Settings: the address to paste into Claude and the connections made so far
  app.get('/api/claude/connections', signedIn, async (req, res) => {
    try {
      const list = await readConnections(supabase, req.user_id)
      res.json({ url: `${baseUrl(req)}/mcp`, connections: list.filter(c => c.active).map(publicConnection) })
    } catch (e) {
      console.error('[Claude connector] list failed:', e.message)
      res.status(500).json({ error: 'Не вдалося завантажити підключення' })
    }
  })

  app.delete('/api/claude/connections/:id', signedIn, async (req, res) => {
    try {
      await updateConnections(supabase, req.user_id, list => list.filter(c => c.id !== req.params.id))
      res.json({ success: true })
    } catch (e) {
      console.error('[Claude connector] remove failed:', e.message)
      res.status(500).json({ error: 'Не вдалося відключити' })
    }
  })
}

export const CLAUDE_PREF_KEY = PREF_KEY
