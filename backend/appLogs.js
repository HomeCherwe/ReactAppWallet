// The owner's «Адмінка»: what goes wrong in the project, kept where they can see it.
// - Everything the server prints with console.error / console.warn, and every 5xx answer;
// - errors the web and iPhone apps report (POST /api/logs/client);
// - kept in app_logs for RETENTION_DAYS, readable only through /api/admin/* (app_admins says who).
// Logs never hold secrets: every text goes through scrub() first.

import crypto from 'crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { inspect } from 'node:util'
import { describeOpenAIError, pingOpenAI } from './openaiStatus.js'

const MAX_MESSAGE = 500
const MAX_DETAILS = 4000
const MAX_SCRUBBED = 20000
const RETENTION_DAYS = 30
const FLUSH_DELAY_MS = 1000
// A failed answer waits this long at most for its log to be saved
const FLUSH_WAIT_MS = 1500
// While the table is missing (or the database is down) logging steps aside instead of failing
const RETRY_AFTER_MS = 5 * 60e3
const MAX_ROWS_READ = 3000
const SOURCES = ['server', 'web', 'ios']
const CLIENT_ITEMS_PER_REQUEST = 20
const CLIENT_RATE_LIMIT = 120 // reported errors per user and hour, per server instance
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Takes out what must not be stored: tokens, keys, card and account numbers, emails */
export function scrub(text) {
  return String(text ?? '')
    .replace(/Bearer\s+[^\s"',]+/gi, 'Bearer [hidden]')
    .replace(/eyJ[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]*)*/g, '[token]')
    .replace(/\bsk-[A-Za-z0-9_-]{10,}/g, '[key]')
    .replace(
      /(["']?(?:cvv|cvc|card_number|password|passwd|api_key|api_secret|apikey|secret|token|access_token|refresh_token|authorization)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
      '$1[hidden]'
    )
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, '[iban]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[number]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
}

const clip = (s, max) => (s.length > max ? `${s.slice(0, max)}…` : s)

/** The same problem has the same fingerprint, whatever ids, numbers and dates it mentions */
export function fingerprintOf(source, level, message) {
  const normal = String(message)
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '#')
    .replace(/\b[0-9a-f]{12,}\b/g, '#')
    .replace(/\d+/g, '#')
    .slice(0, 200)
  return crypto.createHash('sha1').update(`${source}|${level}|${normal}`).digest('hex').slice(0, 16)
}

/** Rows of the same problem become one group: how often, how many people, when, the latest example */
export function groupLogs(rows, adminId) {
  const groups = new Map()
  for (const r of rows) {
    let g = groups.get(r.fingerprint)
    if (!g) {
      // Rows come newest first: the first one seen is the latest example
      g = {
        fingerprint: r.fingerprint,
        source: r.source,
        level: r.level,
        message: r.message,
        details: r.details,
        path: r.path,
        status: r.status,
        app_version: r.app_version,
        last_at: r.created_at,
        first_at: r.created_at,
        count: 0,
        users: new Set(),
      }
      groups.set(r.fingerprint, g)
    }
    g.count += Number(r.count) || 1
    g.first_at = r.created_at
    if (r.user_id) g.users.add(r.user_id)
  }
  return [...groups.values()].map(({ users, ...g }) => ({ ...g, users: users.size, mine: !!adminId && users.has(adminId) }))
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------
const requestContext = new AsyncLocalStorage()
const rawError = console.error.bind(console)
const rawWarn = console.warn.bind(console)

let client = null
const queue = new Map()
let timer = null
let pausedUntil = 0
let lastCleanup = 0
const appVersion = process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null

async function flush() {
  clearTimeout(timer)
  timer = null
  if (!queue.size || !client) return
  const rows = [...queue.values()]
  queue.clear()
  if (Date.now() < pausedUntil) return
  try {
    const { error } = await client.from('app_logs').insert(rows)
    if (error) {
      pausedUntil = Date.now() + RETRY_AFTER_MS
      rawWarn('[AppLogs] could not save:', error.code, error.message)
      return
    }
    if (Date.now() - lastCleanup > 6 * 36e5) {
      lastCleanup = Date.now()
      await client.from('app_logs').delete().lt('created_at', new Date(Date.now() - RETENTION_DAYS * 864e5).toISOString())
    }
  } catch (e) {
    pausedUntil = Date.now() + RETRY_AFTER_MS
    rawWarn('[AppLogs] could not save:', e?.message)
  }
}

/** One log entry; the same problem repeated before the next save counts up instead of adding rows */
function record({ source, level, message, details = null, path = null, status = null, userId = null, version = appVersion }) {
  if (Date.now() < pausedUntil) return null
  // Cut before scrubbing too: a huge text shouldn't slow the answer down
  const text = clip(scrub(String(message).slice(0, MAX_SCRUBBED)), MAX_MESSAGE)
  if (!text) return null
  const fingerprint = fingerprintOf(source, level, text)
  const key = `${fingerprint}|${path}|${userId}`
  const known = queue.get(key)
  if (known) {
    known.count++
    return known
  }
  const row = {
    source,
    level,
    fingerprint,
    message: text,
    details: details ? clip(scrub(String(details).slice(0, MAX_SCRUBBED)), MAX_DETAILS) : null,
    path: path ? clip(scrub(path), 200) : null,
    status,
    user_id: UUID.test(userId || '') ? userId : null,
    app_version: version ? clip(String(version), 40) : null,
    count: 1,
  }
  queue.set(key, row)
  if (!timer) {
    timer = setTimeout(() => flush(), FLUSH_DELAY_MS)
    timer.unref?.()
  }
  return row
}

// Ids in addresses would make every request its own entry
const routeOf = req =>
  `${req.method} ${String(req.originalUrl || '').split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id')}`

function capture(level, args) {
  try {
    const parts = args.map(a => (a instanceof Error ? a.message : typeof a === 'string' ? a : inspect(a, { depth: 3, breakLength: Infinity })))
    const firstError = args.find(a => a instanceof Error)
    const message = parts.join(' ')
    const store = requestContext.getStore()
    const req = store?.req
    // Someone's expired login is routine, not a failure of the project
    const quiet = /^\[getUserFromToken\]/.test(message)
    const row = record({
      source: 'server',
      level: quiet ? 'warn' : level,
      message,
      details: firstError?.stack || null,
      path: req ? routeOf(req) : null,
      userId: req?.user_id || null,
    })
    if (row && store) store.rows.push(row)
    if (store && level === 'error' && !quiet) store.logged = true
  } catch {
    // Logging never breaks what it watches
  }
}

/** Call once, before the routes: from then on the server's errors end up in the admin page */
export function installAppLogs(app, supabase) {
  client = supabase
  console.error = (...args) => {
    rawError(...args)
    capture('error', args)
  }
  console.warn = (...args) => {
    rawWarn(...args)
    capture('warn', args)
  }

  app.use((req, res, next) => {
    const store = { req, rows: [], logged: false }
    const end = res.end
    res.end = function (...args) {
      res.end = end
      if (res.statusCode >= 500 && !store.logged) {
        record({
          source: 'server',
          level: 'error',
          message: `${routeOf(req)} → ${res.statusCode}`,
          path: routeOf(req),
          status: res.statusCode,
          userId: req.user_id || null,
        })
      }
      for (const row of store.rows) row.status = res.statusCode
      if (!queue.size) return end.apply(res, args)
      // Saved before the answer goes: Vercel may freeze the function right after it
      Promise.race([flush(), new Promise(resolve => setTimeout(resolve, FLUSH_WAIT_MS))]).finally(() => end.apply(res, args))
      return res
    }
    requestContext.run(store, next)
  })
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const clientHits = new Map()
function clientRateLimited(userId, n) {
  const now = Date.now()
  const hit = clientHits.get(userId)
  if (!hit || now - hit.at > 36e5) {
    clientHits.set(userId, { at: now, n })
    return false
  }
  hit.n += n
  return hit.n > CLIENT_RATE_LIMIT
}

// Whether a bank connection needs looking at, in words
function bankProblem(c) {
  if (c.status === 'expired') return 'доступ закінчився — треба підключити знову'
  if (c.status !== 'active') return `стан: ${c.status}`
  if (c.last_error) return scrub(c.last_error)
  if (c.last_sync_at && Date.now() - Date.parse(c.last_sync_at) > 3 * 864e5) return 'давно не синхронізувався'
  return null
}

export function registerAppLogs(app, { supabase, getUserFromToken }) {
  // Only a real login counts here, nothing named in the request itself
  const verifiedUser = async req => {
    const token = String(req.headers.authorization || '').replace('Bearer ', '').trim()
    if (!token) return null
    const { data, error } = await supabase.auth.getUser(token)
    return error ? null : data?.user || null
  }
  const isAdmin = async userId => {
    const { data, error } = await supabase.from('app_admins').select('user_id').eq('user_id', userId).maybeSingle()
    return !error && !!data
  }
  const requireAdmin = async (req, res, next) => {
    try {
      const user = await verifiedUser(req)
      if (!user) return res.status(401).json({ error: 'Потрібен вхід' })
      if (!(await isAdmin(user.id))) return res.status(403).json({ error: 'Немає доступу' })
      req.user_id = user.id
      next()
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  }

  // POST /api/logs/client { source: 'web' | 'ios', version?, items: [{ level, message, details?, path? }] }
  app.post('/api/logs/client', getUserFromToken, (req, res) => {
    const source = SOURCES.includes(req.body?.source) && req.body.source !== 'server' ? req.body.source : null
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, CLIENT_ITEMS_PER_REQUEST) : []
    if (!source) return res.status(400).json({ error: 'source' })
    if (clientRateLimited(req.user_id, items.length)) return res.json({ success: true, dropped: true })
    for (const it of items) {
      if (typeof it?.message !== 'string') continue
      record({
        source,
        level: it.level === 'warn' ? 'warn' : 'error',
        message: it.message,
        details: typeof it.details === 'string' ? it.details : null,
        path: typeof it.path === 'string' ? it.path : null,
        userId: req.user_id,
        version: typeof req.body.version === 'string' ? req.body.version : null,
      })
    }
    res.json({ success: true })
  })

  // GET /api/admin/me — whether to show the admin page at all
  app.get('/api/admin/me', async (req, res) => {
    try {
      const user = await verifiedUser(req)
      res.json({ admin: !!user && (await isAdmin(user.id)) })
    } catch {
      res.json({ admin: false })
    }
  })

  // GET /api/admin/logs?hours=24 — what went wrong, by problem, latest first
  app.get('/api/admin/logs', requireAdmin, async (req, res) => {
    try {
      const hours = Math.max(1, Math.min(RETENTION_DAYS * 24, Number(req.query.hours) || 24))
      const since = new Date(Date.now() - hours * 36e5).toISOString()
      const { data, error } = await supabase
        .from('app_logs')
        .select('source, level, fingerprint, message, details, path, status, user_id, app_version, count, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS_READ)
      if (error) throw error
      res.json({ since, hours, truncated: (data || []).length >= MAX_ROWS_READ, groups: groupLogs(data || [], req.user_id) })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // GET /api/admin/health — is everything the project depends on working, right now
  app.get('/api/admin/health', requireAdmin, async (req, res) => {
    const checks = []

    const openai = await pingOpenAI()
    const known = openai.ok ? null : describeOpenAIError(openai.error, openai.status)
    checks.push(
      openai.ok
        ? { key: 'openai', label: 'OpenAI (скан, асистент, звіти)', state: 'ok', text: 'Працює' }
        : {
            key: 'openai',
            label: 'OpenAI (скан, асистент, звіти)',
            state: 'fail',
            text: known?.message || `Помилка ${openai.status || ''}: ${scrub(openai.error).slice(0, 200)}`,
            ...(known?.code === 'no_credits' && { link: 'https://platform.openai.com/settings/organization/billing/', linkLabel: 'Поповнити баланс' }),
          }
    )

    const startedAt = Date.now()
    const { error: dbError } = await supabase.from('app_admins').select('user_id').limit(1)
    checks.push(
      dbError
        ? { key: 'database', label: 'База даних', state: 'fail', text: scrub(dbError.message) }
        : { key: 'database', label: 'База даних', state: 'ok', text: `Працює · ${Date.now() - startedAt} мс` }
    )

    const missing = [
      'SUPABASE_SERVICE_ROLE_KEY',
      'OPENAI_API_KEY',
      'ENCRYPTION_KEY',
      'TRUELAYER_CLIENT_ID',
      'TRUELAYER_CLIENT_SECRET',
    ].filter(k => !process.env[k])
    checks.push(
      missing.length
        ? { key: 'config', label: 'Налаштування сервера', state: 'fail', text: `Не задано: ${missing.join(', ')}` }
        : { key: 'config', label: 'Налаштування сервера', state: 'ok', text: 'Усі ключі на місці' }
    )

    const { data: conns } = await supabase.from('bank_connections').select('provider_name, status, last_sync_at, last_error, user_id')
    const banks = (conns || [])
      .map(c => ({
        provider: c.provider_name,
        last_sync_at: c.last_sync_at,
        mine: c.user_id === req.user_id,
        problem: bankProblem(c),
      }))
      .sort((a, b) => Number(b.mine) - Number(a.mine) || String(a.provider).localeCompare(String(b.provider)))
    const broken = banks.filter(b => b.problem).length
    checks.push({
      key: 'banks',
      label: 'Підключені банки',
      state: broken ? 'warn' : 'ok',
      text: broken ? `З проблемами: ${broken} із ${banks.length}` : `Усі працюють: ${banks.length}`,
    })

    res.json({
      checks,
      banks,
      deploy: {
        commit: appVersion,
        region: process.env.VERCEL_REGION || null,
        env: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
      },
    })
  })
}
