import crypto from 'crypto'
import axios from 'axios'
import { decryptJSON, encryptJSON, isEncryptionConfigured } from './secretBox.js'

// Bank connections through TrueLayer for any supported provider (Revolut, Wise, BNP, Monzo, …).
// Flow: app asks /start for an auth URL → user logs in at the bank → TrueLayer redirects to
// /callback on this backend → tokens are encrypted and stored in bank_connections → user is sent
// back to the app/web. Each bank account (or credit card) is imported into its own app card.

const AUTH_BASE = 'https://auth.truelayer.com'
const API_BASE = 'https://api.truelayer.com/data/v1'
const CONSENT_DAYS = 90
const FIRST_SYNC_DAYS = 90 // history pulled right after connecting
const SYNC_DAYS = 15 // regular syncs
const PROVIDERS_TTL_MS = 60 * 60 * 1000

// Scopes we'd like; each provider gets only the ones it supports
const WANTED_SCOPES = ['info', 'accounts', 'balance', 'transactions', 'cards', 'offline_access']

// Where users may be sent back to after connecting (app schemes, the web app, local dev)
const RETURN_URL_ALLOWED = [
  /^walletapp:\/\//,
  /^exps?:\/\//,
  /^https:\/\/homecherwe\.github\.io\//,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//,
]

function isAllowedReturnUrl(url) {
  const extra = String(process.env.WEB_APP_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return RETURN_URL_ALLOWED.some(re => re.test(url)) || extra.some(origin => url.startsWith(origin))
}

// ---------------------------------------------------------------------------
// Signed `state`: who started the flow, which bank, where to return. HMAC so it can't be forged.
// ---------------------------------------------------------------------------
function stateSecret() {
  return process.env.TRUELAYER_STATE_SECRET || process.env.ENCRYPTION_KEY || process.env.TRUELAYER_CLIENT_SECRET
}

function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

function verifyState(state) {
  const [body, sig] = String(state || '').split('.')
  if (!body || !sig || !stateSecret()) return null
  const expected = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!p.u || !p.r || !p.p || !p.exp || Date.now() > p.exp) return null
    return p
  } catch {
    return null
  }
}

function withQuery(url, params) {
  // Hash-routed web URLs (#/profile) keep their query inside the hash
  const sep = url.includes('?') ? '&' : '?'
  return url + sep + new URLSearchParams(params).toString()
}

function callbackUrl(req) {
  const base = process.env.PUBLIC_API_URL ||
    `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.headers.host}`
  return `${base.replace(/\/$/, '')}/api/bank-connections/callback`
}

// ---------------------------------------------------------------------------
// Provider catalog (from TrueLayer, cached)
// ---------------------------------------------------------------------------
let providersCache = null

async function getProviders() {
  if (providersCache && Date.now() - providersCache.ts < PROVIDERS_TTL_MS) return providersCache.list
  const clientId = process.env.TRUELAYER_CLIENT_ID
  const { data } = await axios.get(`${AUTH_BASE}/api/providers`, { params: { clientId }, timeout: 15000 })
  const raw = Array.isArray(data) ? data : data?.results || []
  const list = raw
    .map(p => ({
      provider_id: p.provider_id,
      name: p.display_name,
      logo: p.logo_url || null,
      country: String(p.country || '').toLowerCase(),
      scopes: p.scopes || [],
    }))
    // Must be able to read transactions from accounts or cards, and stay connected
    .filter(p =>
      p.scopes.includes('transactions') &&
      p.scopes.includes('offline_access') &&
      (p.scopes.includes('accounts') || p.scopes.includes('cards')) &&
      !/mock/i.test(p.provider_id)
    )
    .sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name))
  providersCache = { ts: Date.now(), list }
  return list
}

// ---------------------------------------------------------------------------
// TrueLayer token handling
// ---------------------------------------------------------------------------
async function tokenRequest(params) {
  const body = new URLSearchParams({
    client_id: process.env.TRUELAYER_CLIENT_ID,
    client_secret: process.env.TRUELAYER_CLIENT_SECRET,
    ...params,
  })
  const { data } = await axios.post(`${AUTH_BASE}/connect/token`, body, { timeout: 15000 })
  return data
}

function tokensFrom(data) {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
  }
}

class ConsentExpiredError extends Error {}

/**
 * Makes authenticated Data API calls for one connection, refreshing the access token when it
 * expires and saving the new tokens. Marks the connection expired when the refresh fails.
 */
function makeClient(supabase, conn, psuHeaders) {
  let tokens = decryptJSON(conn.tokens_encrypted)

  const refresh = async () => {
    try {
      tokens = tokensFrom(await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }))
    } catch (e) {
      await supabase
        .from('bank_connections')
        .update({ status: 'expired', last_error: 'consent_expired', updated_at: new Date().toISOString() })
        .eq('id', conn.id)
      throw new ConsentExpiredError('Bank consent expired — reconnect the bank')
    }
    await supabase
      .from('bank_connections')
      .update({ tokens_encrypted: encryptJSON(tokens), updated_at: new Date().toISOString() })
      .eq('id', conn.id)
  }

  const get = async (path, params) => {
    if (Date.now() > tokens.expires_at - 60000) await refresh()
    const call = () =>
      axios.get(`${API_BASE}/${path}`, {
        params,
        headers: { Authorization: `Bearer ${tokens.access_token}`, ...psuHeaders },
        timeout: 20000,
      })
    try {
      return (await call()).data
    } catch (e) {
      if (e.response?.status === 401) {
        await refresh()
        return (await call()).data
      }
      throw e
    }
  }

  return { get }
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------
function psuHeadersFrom(req) {
  // The app sends user_present when it syncs while open. Passing the user's IP marks the request
  // as user-present (PSD2), so the bank's 4-per-day unattended limit doesn't apply.
  const viaApiKey = !!(req.headers['x-api-key'] || req.body?.api_key || req.query?.api_key)
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim()
  return req.body?.user_present && !viaApiKey && ip ? { 'X-PSU-IP': ip } : {}
}

// TrueLayer amounts: use the DEBIT/CREDIT type for the sign (card APIs report purchases as positive)
function signedAmount(tx) {
  const abs = Math.abs(Number(tx.amount || 0))
  if (tx.transaction_type === 'DEBIT') return -abs
  if (tx.transaction_type === 'CREDIT') return abs
  return Number(tx.amount || 0)
}

async function listBankItems(client) {
  const items = []
  for (const kind of ['account', 'card']) {
    try {
      const data = await client.get(kind === 'account' ? 'accounts' : 'cards')
      for (const r of data?.results || []) {
        items.push({
          kind,
          account_id: r.account_id,
          currency: String(r.currency || 'EUR').toUpperCase(),
          display_name: r.display_name || r.card_type || null,
        })
      }
    } catch (e) {
      if (e instanceof ConsentExpiredError) throw e
      // Provider doesn't offer this kind (403/404/501) — skip
      if (![400, 403, 404, 501].includes(e.response?.status)) throw e
    }
  }
  return items
}

/** App card for a bank account: the linked one, a matching existing card, or a new card. */
async function ensureCardForItem(supabase, userId, conn, item, links) {
  const link = links.find(l => l.account_id === item.account_id)
  if (link?.card_id) {
    const { data: card } = await supabase.from('cards').select('id').eq('id', link.card_id).maybeSingle()
    if (card) return { cardId: card.id, created: false, isNewLink: false }
  }

  // Reuse an existing card of this bank in the same currency that isn't linked yet
  const linkedCardIds = links.map(l => l.card_id).filter(Boolean)
  const { data: candidates } = await supabase
    .from('cards')
    .select('id')
    .eq('user_id', userId)
    .ilike('bank', `%${conn.provider_name}%`)
    .eq('currency', item.currency)
  let cardId = (candidates || []).map(c => c.id).find(id => !linkedCardIds.includes(id))
  let created = false

  if (!cardId) {
    const baseName = item.kind === 'card'
      ? `${conn.provider_name} ${item.display_name || 'Card'}`
      : `${conn.provider_name} ${item.currency}`
    for (let attempt = 0; attempt < 5 && !cardId; attempt++) {
      const name = attempt === 0 ? baseName : `${baseName} ${attempt + 1}`
      const { data, error } = await supabase
        .from('cards')
        .insert([{ user_id: userId, name, bank: conn.provider_name, currency: item.currency, initial_balance: 0 }])
        .select('id')
        .single()
      if (!error) cardId = data.id
      else if (error.code !== '23505') throw error // anything but "name already taken"
    }
    if (!cardId) throw new Error(`Could not create a card for ${conn.provider_name}`)
    created = true
  }

  await supabase.from('bank_connection_accounts').upsert(
    {
      connection_id: conn.id,
      user_id: userId,
      account_id: item.account_id,
      kind: item.kind,
      display_name: item.display_name,
      currency: item.currency,
      card_id: cardId,
    },
    { onConflict: 'connection_id,account_id' }
  )
  return { cardId, created, isNewLink: !link }
}

async function syncConnection(supabase, conn, psuHeaders) {
  const client = makeClient(supabase, conn, psuHeaders)
  const userId = conn.user_id
  const items = await listBankItems(client)

  const { data: links } = await supabase
    .from('bank_connection_accounts')
    .select('account_id, card_id')
    .eq('connection_id', conn.id)

  const now = new Date()
  const to = now.toISOString().split('.')[0] + 'Z'
  let added = 0

  for (const item of items) {
    const { cardId, created, isNewLink } = await ensureCardForItem(supabase, userId, conn, item, links || [])
    const since = new Date(now)
    since.setDate(since.getDate() - (isNewLink ? FIRST_SYNC_DAYS : SYNC_DAYS))
    const from = since.toISOString().split('.')[0] + 'Z'
    const base = item.kind === 'card' ? `cards/${item.account_id}` : `accounts/${item.account_id}`

    let txs = []
    try {
      txs = (await client.get(`${base}/transactions`, { from, to }))?.results || []
    } catch (e) {
      if (e instanceof ConsentExpiredError) throw e
      if (e.response?.status !== 404) throw e
    }

    // Skip transactions imported before (matched by the bank's transaction id)
    const ids = txs.map(t => t.transaction_id).filter(Boolean)
    const existing = new Set()
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase
        .from('transactions')
        .select('transaction_id_card')
        .eq('user_id', userId)
        .in('transaction_id_card', ids.slice(i, i + 200))
      for (const r of data || []) existing.add(r.transaction_id_card)
    }

    const rows = txs
      .filter(t => t.transaction_id && !existing.has(t.transaction_id))
      .map(t => ({
        user_id: userId,
        amount: signedAmount(t),
        category: `${conn.provider_name} Sync`,
        note: t.meta?.user_comments ? `${t.description} | ${t.meta.user_comments}` : t.description,
        archives: false,
        card: conn.provider_name,
        card_id: cardId,
        transaction_id_card: t.transaction_id,
        created_at: t.timestamp,
        merchant_name: t.merchant_name || null,
      }))

    if (rows.length > 0) {
      const { error } = await supabase.from('transactions').insert(rows)
      if (error) throw error
      added += rows.length
    }

    // A card created just now: set its starting balance so the app matches the bank
    if (created) {
      try {
        const bal = (await client.get(`${base}/balance`))?.results?.[0]
        const current = Number(bal?.current)
        if (Number.isFinite(current)) {
          const bankBalance = item.kind === 'card' ? -Math.abs(current) : current // cards report amount owed
          const importedSum = rows.reduce((s, r) => s + Number(r.amount), 0)
          await supabase
            .from('cards')
            .update({ initial_balance: Math.round((bankBalance - importedSum) * 100) / 100 })
            .eq('id', cardId)
        }
      } catch (e) {
        console.warn(`[Banks] Could not set starting balance for ${conn.provider_name}:`, e.message)
      }
    }
  }

  await supabase
    .from('bank_connections')
    .update({ status: 'active', last_sync_at: now.toISOString(), last_error: null, updated_at: now.toISOString() })
    .eq('id', conn.id)
  return added
}

// ---------------------------------------------------------------------------
// Legacy: the Revolut connection stored in user_preferences.revolut_api (before this table)
// ---------------------------------------------------------------------------
async function migrateLegacyRevolut(supabase, userId) {
  if (!isEncryptionConfigured()) return
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('revolut_api')
    .eq('user_id', userId)
    .maybeSingle()
  const legacy = prefs?.revolut_api
  if (!legacy?.access_token || !legacy?.refresh_token) return

  try {
    // Fresh tokens + provider details from /me
    const tokens = tokensFrom(await tokenRequest({ grant_type: 'refresh_token', refresh_token: legacy.refresh_token }))
    const me = await axios.get(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${tokens.access_token}` }, timeout: 15000 })
    const provider = me.data?.results?.[0]?.provider || {}
    const providerId = provider.provider_id || 'ob-revolut'
    const catalog = (await getProviders().catch(() => [])).find(p => p.provider_id === providerId)

    const { error } = await supabase.from('bank_connections').upsert(
      {
        user_id: userId,
        provider_id: providerId,
        provider_name: catalog?.name || provider.display_name || 'Revolut',
        provider_logo: catalog?.logo || provider.logo_uri || null,
        country: catalog?.country || null,
        tokens_encrypted: encryptJSON(tokens),
        status: 'active',
        // Original consent date isn't known; this is refreshed on the next reconnect anyway
        consent_expires_at: new Date(Date.now() + CONSENT_DAYS * 86400000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider_id' }
    )
    if (error) {
      // The refresh above rotated the refresh token — keep the new one where it was
      await supabase
        .from('user_preferences')
        .update({ revolut_api: { ...legacy, access_token: tokens.access_token, refresh_token: tokens.refresh_token } })
        .eq('user_id', userId)
      throw error
    }
    // Tokens now live (encrypted) in bank_connections
    await supabase.from('user_preferences').update({ revolut_api: null }).eq('user_id', userId)
    console.log('[Banks] Migrated legacy Revolut connection for user:', userId)
  } catch (e) {
    console.warn('[Banks] Legacy Revolut migration failed:', e.response?.data || e.message)
  }
}

/** Syncs every active connection of the user. Used by the apps and by /api/syncTrueLayer. */
export async function syncAllBankConnections(supabase, userId, psuHeaders = {}) {
  await migrateLegacyRevolut(supabase, userId)
  const { data: conns } = await supabase
    .from('bank_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')

  const results = []
  for (const conn of conns || []) {
    try {
      results.push({ id: conn.id, provider_name: conn.provider_name, added: await syncConnection(supabase, conn, psuHeaders) })
    } catch (e) {
      const expired = e instanceof ConsentExpiredError
      const message = expired ? 'consent_expired' : e.response?.data?.error || e.message
      if (!expired) {
        await supabase.from('bank_connections').update({ last_error: String(message).slice(0, 300) }).eq('id', conn.id)
      }
      console.error(`[Banks] Sync failed for ${conn.provider_name}:`, message)
      results.push({ id: conn.id, provider_name: conn.provider_name, added: 0, error: message })
    }
  }
  return { added: results.reduce((s, r) => s + r.added, 0), results }
}

function publicConnection(c, accounts = []) {
  return {
    id: c.id,
    provider_id: c.provider_id,
    provider_name: c.provider_name,
    provider_logo: c.provider_logo,
    country: c.country,
    status: c.status,
    consent_expires_at: c.consent_expires_at,
    last_sync_at: c.last_sync_at,
    last_error: c.last_error,
    created_at: c.created_at,
    accounts: accounts
      .filter(a => a.connection_id === c.id)
      .map(a => ({ account_id: a.account_id, kind: a.kind, display_name: a.display_name, currency: a.currency, card_id: a.card_id })),
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
export function registerBankConnections(app, { supabase, getUserFromToken, getUserFromTokenOrApiKey }) {
  // GET /api/bank-providers?country=fr — banks the user can connect
  app.get('/api/bank-providers', getUserFromToken, async (req, res) => {
    try {
      const country = String(req.query.country || '').toLowerCase()
      const list = await getProviders()
      res.json(
        (country ? list.filter(p => p.country === country) : list)
          .map(({ scopes, ...p }) => p)
      )
    } catch (e) {
      console.error('[Banks] providers error:', e.message)
      res.status(502).json({ error: 'Could not load the list of banks' })
    }
  })

  // GET /api/bank-connections — the user's connected banks (never includes tokens)
  app.get('/api/bank-connections', getUserFromToken, async (req, res) => {
    try {
      await migrateLegacyRevolut(supabase, req.user_id)
      const [{ data: conns, error }, { data: accounts }] = await Promise.all([
        supabase.from('bank_connections').select('*').eq('user_id', req.user_id).order('created_at'),
        supabase.from('bank_connection_accounts').select('*').eq('user_id', req.user_id),
      ])
      if (error) throw error
      res.json((conns || []).map(c => publicConnection(c, accounts || [])))
    } catch (e) {
      console.error('[Banks] list error:', e.message)
      res.status(500).json({ error: e.message })
    }
  })

  // POST /api/bank-connections/start { provider_id, return_url } → { url }
  app.post('/api/bank-connections/start', getUserFromToken, async (req, res) => {
    try {
      if (!process.env.TRUELAYER_CLIENT_ID || !process.env.TRUELAYER_CLIENT_SECRET) {
        return res.status(500).json({ error: 'TrueLayer is not configured on the server' })
      }
      if (!isEncryptionConfigured()) {
        return res.status(500).json({ error: 'ENCRYPTION_KEY is not configured on the server' })
      }
      const returnUrl = String(req.body?.return_url || '')
      if (!isAllowedReturnUrl(returnUrl)) return res.status(400).json({ error: 'Invalid return_url' })

      const provider = (await getProviders()).find(p => p.provider_id === req.body?.provider_id)
      if (!provider) return res.status(400).json({ error: 'Unknown bank' })

      const scope = WANTED_SCOPES.filter(s => provider.scopes.includes(s)).join(' ')
      // Provider type comes from the id: 'ob-…' (Open Banking), 'stet-…' (French banks), …
      const type = provider.provider_id.split('-')[0]
      const providers = provider.country === 'uk' ? 'uk-ob-all uk-oauth-all' : `${provider.country}-${type}-all`
      const state = signState({ u: req.user_id, p: provider.provider_id, r: returnUrl, exp: Date.now() + 15 * 60000 })

      const query = new URLSearchParams({
        response_type: 'code',
        client_id: process.env.TRUELAYER_CLIENT_ID,
        scope,
        redirect_uri: callbackUrl(req),
        providers,
        provider_id: provider.provider_id, // straight to this bank, no bank picker
        state,
      }).toString().replace(/\+/g, '%20')

      res.json({ url: `${AUTH_BASE}/?${query}` })
    } catch (e) {
      console.error('[Banks] start error:', e.message)
      res.status(500).json({ error: e.message })
    }
  })

  // GET /api/bank-connections/callback — TrueLayer lands here, then we send the user back
  app.get('/api/bank-connections/callback', async (req, res) => {
    const st = verifyState(req.query.state)
    if (!st) {
      return res.status(400).type('text/plain; charset=utf-8')
        .send('Посилання недійсне або застаріло. Поверніться в застосунок і спробуйте ще раз.')
    }
    const back = params => res.redirect(302, withQuery(st.r, params))
    if (req.query.error) return back({ bank_status: 'error', bank_message: String(req.query.error) })
    if (!req.query.code) return back({ bank_status: 'error', bank_message: 'no_code' })

    try {
      const tokens = tokensFrom(await tokenRequest({
        grant_type: 'authorization_code',
        code: String(req.query.code),
        redirect_uri: callbackUrl(req),
      }))
      const provider = (await getProviders()).find(p => p.provider_id === st.p)

      const { error } = await supabase.from('bank_connections').upsert(
        {
          user_id: st.u,
          provider_id: st.p,
          provider_name: provider?.name || st.p,
          provider_logo: provider?.logo || null,
          country: provider?.country || null,
          tokens_encrypted: encryptJSON(tokens),
          status: 'active',
          consent_expires_at: new Date(Date.now() + CONSENT_DAYS * 86400000).toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider_id' }
      )
      if (error) throw error
      console.log(`[Banks] ${provider?.name || st.p} connected for user:`, st.u)
      back({ bank_status: 'ok', bank_name: provider?.name || '' })
    } catch (e) {
      console.error('[Banks] callback error:', e.response?.data || e.message)
      back({ bank_status: 'error', bank_message: e.response?.data?.error || 'exchange_failed' })
    }
  })

  // POST /api/bank-connections/sync { connection_id?, user_present? } — one bank or all of them
  app.post('/api/bank-connections/sync', getUserFromTokenOrApiKey, async (req, res) => {
    try {
      const psu = psuHeadersFrom(req)
      if (req.body?.connection_id) {
        const { data: conn } = await supabase
          .from('bank_connections')
          .select('*')
          .eq('id', req.body.connection_id)
          .eq('user_id', req.user_id)
          .maybeSingle()
        if (!conn) return res.status(404).json({ success: false, error: 'Connection not found' })
        try {
          const added = await syncConnection(supabase, conn, psu)
          return res.json({ success: true, added, results: [{ id: conn.id, provider_name: conn.provider_name, added }] })
        } catch (e) {
          const message = e instanceof ConsentExpiredError ? 'consent_expired' : e.response?.data?.error || e.message
          return res.json({ success: false, added: 0, error: message })
        }
      }
      const result = await syncAllBankConnections(supabase, req.user_id, psu)
      res.json({ success: true, ...result })
    } catch (e) {
      console.error('[Banks] sync error:', e.message)
      res.status(500).json({ success: false, error: e.message })
    }
  })

  // DELETE /api/bank-connections/:id — disconnect (imported transactions and cards stay)
  app.delete('/api/bank-connections/:id', getUserFromToken, async (req, res) => {
    try {
      const { error } = await supabase
        .from('bank_connections')
        .delete()
        .eq('id', req.params.id)
        .eq('user_id', req.user_id)
      if (error) throw error
      res.json({ success: true })
    } catch (e) {
      res.status(500).json({ success: false, error: e.message })
    }
  })
}

export { psuHeadersFrom }
