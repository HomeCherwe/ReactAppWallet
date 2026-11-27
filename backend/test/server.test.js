// The server's own tests: the real routes on a stand-in database (test/fakeSupabase.js), no
// secrets and no network. Run with `npm test` in backend/; CI runs them on every pull request.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import http from 'node:http'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'http://fake.local'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key'
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const PNG_BYTES = Buffer.from('89504e470d0a1a0a66616b65', 'hex')
const API_KEY_A = 'k'.repeat(64)

const seed = {
  banks: [
    { id: 'bank-a', user_id: A, name: 'Mono', iban: 'UA-A', exclude_from_stats: false },
    { id: 'bank-b', user_id: B, name: 'Privat', iban: 'UA-B-SECRET', exclude_from_stats: false },
  ],
  cards: [
    { id: 'card-a1', user_id: A, bank_id: 'bank-a', bank: 'Mono', name: 'Black', currency: 'UAH', initial_balance: 100, card_number: '4444333322221111', bg_url: `data:image/png;base64,${PNG_BYTES.toString('base64')}`, exclude_from_stats: false, created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'card-a2', user_id: A, bank_id: null, bank: 'Інші', name: 'EUR', currency: 'EUR', initial_balance: 0, card_number: null, bg_url: null, exclude_from_stats: false, created_at: '2026-01-02T00:00:00.000Z' },
    { id: 'card-b1', user_id: B, bank_id: 'bank-b', bank: 'Privat', name: 'Gold', currency: 'UAH', initial_balance: 0, bg_url: null, created_at: '2026-01-03T00:00:00.000Z' },
  ],
  transactions: [
    { id: 'tx-1', user_id: A, card_id: 'card-a1', amount: -100, amount_stat: -100, category: 'Food', created_at: '2026-11-10T10:00:00.000Z' },
    { id: 'tx-2', user_id: A, card_id: 'card-a1', amount: 1000, amount_stat: 1000, category: 'Salary', created_at: '2026-11-05T10:00:00.000Z' },
    // a refund took 50 off: statistics count −150
    { id: 'tx-3', user_id: A, card_id: 'card-a1', amount: -200, amount_stat: -150, category: 'Food', created_at: '2026-11-12T10:00:00.000Z' },
    { id: 'tx-4', user_id: A, card_id: 'card-a1', amount: 50, amount_stat: 50, category: 'Food', refund_for: 'tx-3', created_at: '2026-11-13T10:00:00.000Z' },
    { id: 'tx-5', user_id: A, card_id: 'card-a1', amount: -70, amount_stat: -70, category: 'Moves', is_transfer: true, created_at: '2026-11-14T10:00:00.000Z' },
    { id: 'tx-6', user_id: A, card_id: 'card-a1', amount: -30, amount_stat: -30, category: 'Food', archives: true, created_at: '2026-11-15T10:00:00.000Z' },
    { id: 'tx-7', user_id: A, card_id: 'card-a1', amount: -40, amount_stat: -40, category: 'Food', exclude_from_stats: true, created_at: '2026-11-16T10:00:00.000Z' },
    { id: 'tx-8', user_id: A, card_id: 'card-a2', amount: -5, amount_stat: -5, category: 'Coffee', note: 'x [refund_for:abc]', created_at: '2026-11-17T10:00:00.000Z' },
    // 22:30 UTC on 31 October is 00:30 on 1 November in Kyiv
    { id: 'tx-9', user_id: A, card_id: 'card-a2', amount: -9, amount_stat: -9, category: 'Coffee', created_at: '2026-10-31T22:30:00.000Z' },
    { id: 'tx-10', user_id: A, card_id: null, amount: 300, amount_stat: 300, category: 'Gift', created_at: '2026-10-10T10:00:00.000Z' },
    { id: 'tx-b1', user_id: B, card_id: 'card-b1', amount: -999, amount_stat: -999, category: 'Food', created_at: '2026-11-10T10:00:00.000Z' },
  ],
  user_preferences: [
    {
      id: 'prefs-a',
      user_id: A,
      preferences: {
        primaryCurrency: 'UAH',
        api_key: API_KEY_A,
        claude_connections: [{ id: 'old', client_name: 'Claude', redirect_host: 'claude.ai', created_at: '2026-11-01T00:00:00.000Z', active: true }],
      },
    },
    { id: 'prefs-b', user_id: B, preferences: { primaryCurrency: 'EUR' } },
  ],
  bank_connections: [],
  bank_connection_accounts: [],
  subscriptions: [],
}

// No network: outside calls (currency rates, banks) fail at once; the test's own server works
const realFetch = globalThis.fetch
globalThis.fetch = (url, opts) =>
  /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(url)) ? realFetch(url, opts) : Promise.reject(new Error('no network in tests'))

const { installFakeSupabase } = await import('./fakeSupabase.js')
const db = installFakeSupabase({ seed, tokens: { 'TOKEN-A': A, 'TOKEN-B': B } })
const { default: app } = await import('../index.js')

let server
let base
before(
  () =>
    new Promise(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${server.address().port}`
        resolve()
      })
    })
)
after(() => new Promise(resolve => server.close(resolve)))

const call = async (method, path, { token, body, headers = {}, form } = {}) => {
  const h = { ...headers }
  if (token) h.Authorization = `Bearer ${token}`
  let payload
  if (form) {
    h['Content-Type'] = 'application/x-www-form-urlencoded'
    payload = new URLSearchParams(form).toString()
  } else if (body !== undefined) {
    h['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const r = await realFetch(base + path, { method, headers: h, body: payload, redirect: 'manual' })
  const text = await r.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: r.status, json, text, headers: r.headers, raw: Buffer.from(text, 'latin1') }
}

// fetch() won't send a body with GET; the old sign-in hole took user_id from exactly that
const getWithBody = (path, body) =>
  new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const r = http.request(base + path, { method: 'GET', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
      res.resume()
      res.on('end', () => resolve(res.statusCode))
    })
    r.on('error', reject)
    r.end(data)
  })

test('a user_id sent by the client is never a sign-in', async () => {
  assert.equal(await getWithBody('/api/cards', { user_id: A }), 401)
  const before = db.transactions.length
  assert.equal((await call('POST', '/api/transactions', { body: { user_id: A, amount: -1, category: 'x' } })).status, 401)
  assert.equal(db.transactions.length, before)
})

test('the token counts only in the Authorization header', async () => {
  assert.equal((await call('GET', '/api/cards?token=TOKEN-A')).status, 401)
  assert.equal((await call('POST', '/api/preferences', { body: { token: 'TOKEN-A', preferences: {} } })).status, 401)
  assert.equal((await call('GET', '/api/cards', { headers: { Authorization: 'Bearer ' } })).status, 401)
  assert.equal((await call('GET', '/api/cards', { token: 'not-a-real-token' })).status, 401)
})

test('signed in: only your own cards, pictures by link', async () => {
  const r = await call('GET', '/api/cards', { token: 'TOKEN-A' })
  assert.equal(r.status, 200)
  assert.deepEqual(r.json.map(c => c.id).sort(), ['card-a1', 'card-a2'])
  const a1 = r.json.find(c => c.id === 'card-a1')
  assert.match(a1.bg_url, /\/api\/cards\/card-a1\/bg\?s=[\w-]{32}$/)
  assert.ok(!r.text.includes('data:image'), 'the list carries no picture data')
})

test("another user's card, bank or refund parent is refused", async () => {
  const before = db.transactions.length
  let r = await call('POST', '/api/transactions', { token: 'TOKEN-A', body: { card_id: 'card-b1', amount: -1, category: 'x' } })
  assert.equal(r.status, 404)
  r = await call('POST', '/api/transactions', { token: 'TOKEN-A', body: { refund_for: 'tx-b1', amount: 1, category: 'x' } })
  assert.equal(r.status, 404)
  assert.equal(db.transactions.length, before)
  r = await call('PUT', '/api/cards/card-a1', { token: 'TOKEN-A', body: { bank_id: 'bank-b' } })
  assert.equal(r.status, 404)
  assert.equal(db.cards.find(c => c.id === 'card-a1').bank_id, 'bank-a')
  r = await call('POST', '/api/transfers', { token: 'TOKEN-A', body: { fromCardId: 'card-a1', toCardId: 'card-b1', amount: 1 } })
  assert.equal(r.status, 404)
})

test('your own card is fine, and the row is yours whatever user_id is sent', async () => {
  const r = await call('POST', '/api/transactions', { token: 'TOKEN-A', body: { card_id: 'card-a1', amount: -1, category: 'Test', user_id: B } })
  assert.equal(r.status, 200)
  const row = db.transactions.find(t => t.id === r.json.id)
  assert.equal(row.user_id, A)
  db.transactions.splice(db.transactions.indexOf(row), 1)
})

test('card pictures: a signed link works, a forged one does not, a cached copy gets 304', async () => {
  const { json } = await call('GET', '/api/cards', { token: 'TOKEN-A' })
  const link = new URL(json.find(c => c.id === 'card-a1').bg_url)
  const r = await realFetch(base + link.pathname + link.search)
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('content-type'), 'image/png')
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), PNG_BYTES)
  const again = await realFetch(base + link.pathname + link.search, { headers: { 'If-None-Match': r.headers.get('etag') } })
  assert.equal(again.status, 304)
  assert.equal((await realFetch(`${base}/api/cards/card-a1/bg?s=${'x'.repeat(32)}`)).status, 404)
  assert.equal((await realFetch(base + link.pathname.replace('card-a1', 'card-b1') + link.search)).status, 404)
})

test("a card sent back with its picture's link keeps its picture", async () => {
  const { json } = await call('GET', '/api/cards', { token: 'TOKEN-A' })
  const a1 = json.find(c => c.id === 'card-a1')
  const r = await call('PUT', '/api/cards/card-a1', { token: 'TOKEN-A', body: { name: 'Black', bg_url: a1.bg_url } })
  assert.equal(r.status, 200)
  assert.match(db.cards.find(c => c.id === 'card-a1').bg_url, /^data:image\/png;base64,/)
})

test('/api/home adds up the months by the apps rules, in the user time zone', async () => {
  const start = encodeURIComponent('2026-09-30T21:00:00.000Z')
  const end = encodeURIComponent('2026-11-30T22:00:00.000Z')
  const r = await call('GET', `/api/home?start=${start}&end=${end}&tz=Europe/Kyiv`, { token: 'TOKEN-A' })
  assert.equal(r.status, 200)
  const cells = Object.fromEntries(r.json.months.rows.map(c => [`${c.m}|${c.c || ''}|${c.k || ''}`, [c.i, c.e]]))
  assert.deepEqual(cells, {
    '2026-11|card-a1|Food': [0, 250], // −100 and −150 after its refund; refund, archive and "not in stats" left out
    '2026-11|card-a1|Salary': [1000, 0],
    '2026-11|card-a2|Coffee': [0, 9], // 00:30 on 1 November in Kyiv; the "[refund_for:" note left out
    '2026-10||Gift': [300, 0], // cash
  })
  assert.deepEqual(r.json.sums, { 'card-a1': 640, 'card-a2': -14 })
  assert.equal(r.json.cash, 300)
  assert.equal(r.json.cards.find(c => c.id === 'card-a1').card_number, '1111')
  assert.ok(!('claude_connections' in r.json.preferences) && !('api_key' in r.json.preferences))
  assert.ok(!r.text.includes('UA-B-SECRET') && !r.text.includes('tx-b1'))
  const noMonths = await call('GET', '/api/home?months=0', { token: 'TOKEN-A' })
  assert.deepEqual(noMonths.json.months.rows, [])
})

test('preferences: Claude connections and the automation key stay on the server', async () => {
  const r = await call('GET', '/api/preferences', { token: 'TOKEN-A' })
  assert.equal(r.status, 200)
  assert.ok(!('claude_connections' in r.json) && !('api_key' in r.json))
  // A client saving its whole settings object (without those keys) must not wipe them
  await call('POST', '/api/preferences', { token: 'TOKEN-A', body: { preferences: { primaryCurrency: 'EUR' } } })
  await call('PATCH', '/api/preferences', { token: 'TOKEN-A', body: { updates: { claude_connections: [], api_key: 'x'.repeat(64) } } })
  const prefs = db.user_preferences.find(p => p.user_id === A).preferences
  assert.equal(prefs.primaryCurrency, 'EUR')
  assert.equal(prefs.claude_connections.length, 1)
  assert.equal(prefs.api_key, API_KEY_A)
})

test('the automation key signs in; a wrong one or a key-shaped object does not', async () => {
  assert.equal((await call('POST', '/api/bank-connections/sync', { headers: { 'X-API-Key': API_KEY_A }, body: {} })).status, 200)
  assert.equal((await call('POST', '/api/bank-connections/sync', { headers: { 'X-API-Key': 'z'.repeat(64) }, body: {} })).status, 401)
  assert.equal((await call('POST', '/api/syncMonoBank', { body: { api_key: { $ne: null } } })).status, 401)
})

test('paid and removed endpoints', async () => {
  assert.equal((await call('POST', '/api/parse-receipt')).status, 401)
  for (const path of ['/api/truelayer/data', '/api/truelayer/exchange']) {
    assert.equal((await call('POST', path, { token: 'TOKEN-A', body: {} })).status, 404)
  }
  assert.equal((await call('GET', '/api/truelayer/check-token', { token: 'TOKEN-A' })).status, 404)
})

test('Claude connector: sign-in, tools, and cut-off', async () => {
  const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'
  const meta = await call('GET', '/.well-known/oauth-protected-resource/mcp')
  assert.match(meta.json.resource, /\/mcp$/)
  const noToken = await call('POST', '/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'initialize' } })
  assert.equal(noToken.status, 401)
  assert.match(noToken.headers.get('www-authenticate'), /resource_metadata=/)

  const reg = await call('POST', '/oauth/register', { body: { client_name: 'Claude', redirect_uris: [REDIRECT] } })
  assert.equal(reg.status, 201)
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const auth = await call('GET', `/oauth/authorize?response_type=code&client_id=${encodeURIComponent(reg.json.client_id)}&redirect_uri=${encodeURIComponent(REDIRECT)}&code_challenge=${challenge}&code_challenge_method=S256&state=s1`)
  assert.equal(auth.status, 302)
  const req = decodeURIComponent(auth.headers.get('location').split('req=')[1])

  assert.equal((await call('POST', '/api/claude/approve', { body: { req, approve: true, user_id: A } })).status, 401)
  const approved = await call('POST', '/api/claude/approve', { token: 'TOKEN-A', body: { req, approve: true } })
  const code = new URL(approved.json.redirect).searchParams.get('code')
  const tokenForm = { grant_type: 'authorization_code', code, client_id: reg.json.client_id, redirect_uri: REDIRECT }
  assert.equal((await call('POST', '/oauth/token', { form: { ...tokenForm, code_verifier: 'wrong' } })).json.error, 'invalid_grant')
  const tok = await call('POST', '/oauth/token', { form: { ...tokenForm, code_verifier: verifier } })
  assert.ok(tok.json.access_token)
  assert.equal((await call('POST', '/oauth/token', { form: { ...tokenForm, code_verifier: verifier } })).json.error, 'invalid_grant')

  const mcp = body => call('POST', '/mcp', { token: tok.json.access_token, body })
  const tools = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
  assert.ok(tools.json.result.tools.some(t => t.name === 'add_transaction'))
  const accounts = await mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_accounts', arguments: {} } })
  const listed = JSON.parse(accounts.json.result.content[0].text).accounts.map(a => a.id).sort()
  assert.deepEqual(listed, ['card-a1', 'card-a2'])

  const conns = await call('GET', '/api/claude/connections', { token: 'TOKEN-A' })
  const mine = conns.json.connections.find(c => c.id !== 'old')
  await call('DELETE', `/api/claude/connections/${mine.id}`, { token: 'TOKEN-A' })
  assert.equal((await mcp({ jsonrpc: '2.0', id: 4, method: 'tools/list' })).status, 401)
  assert.equal((await call('POST', '/oauth/token', { form: { grant_type: 'refresh_token', refresh_token: tok.json.refresh_token, client_id: reg.json.client_id } })).json.error, 'invalid_grant')
})
