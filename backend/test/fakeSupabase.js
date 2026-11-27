// An in-memory stand-in for Supabase, so the server's tests run without a database or secrets.
// It answers the query shapes the server uses (filters, ranges, single rows, inserts, updates,
// upserts, deletes, embedded `banks(...)`, the sum_tx_by_card RPC) with PostgREST's answers.
// Sign-in: tokens listed in `tokens` are those users; anything else is refused.

import { createClient } from '@supabase/supabase-js'

const eqv = (a, b) => (a === null || a === undefined ? b === null || b === undefined : String(a) === String(b))
const likeRegex = pattern =>
  new RegExp('^' + String(pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/\*/g, '.*') + '$', 'i')

function filterFor(col, op, value) {
  switch (op) {
    case 'is':
      return r => (value === null || value === 'null' ? r[col] == null : String(r[col]) === String(value))
    case 'eq':
      return r => eqv(r[col], value)
    case 'neq':
      return r => !eqv(r[col], value)
    case 'ilike':
      return r => r[col] != null && likeRegex(value).test(String(r[col]))
    case 'gte':
      return r => r[col] != null && r[col] >= value
    case 'lt':
      return r => r[col] != null && r[col] < value
    default:
      return () => true
  }
}

// "archives.is.null,archives.eq.false" → any of them
function parseOr(expr) {
  const parts = String(expr).split(',')
  const fns = parts.map(p => {
    const [col, ...rest] = p.split('.')
    if (rest[0] === 'not') {
      const f = filterFor(col, rest[1], rest.slice(2).join('.'))
      return r => !f(r)
    }
    return filterFor(col, rest[0], rest.slice(1).join('.'))
  })
  return r => fns.some(f => f(r))
}

class Query {
  constructor(db, name) {
    this.db = db
    this.name = name
    this.op = 'select'
    this.filters = []
    this.cols = '*'
    this.returning = false
    this.mode = null
    this.orderBy = null
    this.from = 0
    this.to = Infinity
    this.count = null
    this.head = false
  }
  get rows() {
    return (this.db.tables[this.name] ||= [])
  }
  select(cols = '*', opts = {}) {
    if (this.op === 'select') this.cols = cols
    else this.returning = true
    if (opts.count) this.count = opts.count
    if (opts.head) this.head = true
    return this
  }
  insert(rows) {
    this.op = 'insert'
    this.payload = Array.isArray(rows) ? rows : [rows]
    return this
  }
  update(patch) {
    this.op = 'update'
    this.payload = patch
    return this
  }
  upsert(rows, opts = {}) {
    this.op = 'upsert'
    this.payload = Array.isArray(rows) ? rows : [rows]
    this.conflict = String(opts.onConflict || 'id').split(',').map(s => s.trim())
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  eq(c, v) {
    this.filters.push(filterFor(c, 'eq', v))
    return this
  }
  neq(c, v) {
    this.filters.push(filterFor(c, 'neq', v))
    return this
  }
  in(c, vs) {
    const set = (vs || []).map(String)
    this.filters.push(r => set.includes(String(r[c])))
    return this
  }
  is(c, v) {
    this.filters.push(filterFor(c, 'is', v))
    return this
  }
  not(c, op, v) {
    const f = filterFor(c, op, v)
    this.filters.push(r => !f(r))
    return this
  }
  gte(c, v) {
    this.filters.push(filterFor(c, 'gte', v))
    return this
  }
  gt(c, v) {
    this.filters.push(r => r[c] != null && r[c] > v)
    return this
  }
  lt(c, v) {
    this.filters.push(filterFor(c, 'lt', v))
    return this
  }
  lte(c, v) {
    this.filters.push(r => r[c] != null && r[c] <= v)
    return this
  }
  ilike(c, v) {
    this.filters.push(filterFor(c, 'ilike', v))
    return this
  }
  contains(c, obj) {
    this.filters.push(r => Object.entries(obj).every(([k, v]) => JSON.stringify(r[c]?.[k]) === JSON.stringify(v)))
    return this
  }
  or(expr) {
    this.filters.push(parseOr(expr))
    return this
  }
  order(c, { ascending = true } = {}) {
    this.orderBy = { c, ascending }
    return this
  }
  range(a, b) {
    this.from = a
    this.to = b
    return this
  }
  limit(n) {
    this.to = this.from + n - 1
    return this
  }
  maybeSingle() {
    this.mode = 'maybe'
    return this
  }
  single() {
    this.mode = 'one'
    return this
  }
  then(resolve, reject) {
    try {
      resolve(this.run())
    } catch (e) {
      reject(e)
    }
  }
  match(r) {
    return this.filters.every(f => f(r))
  }
  shape(rows) {
    const withBanks = /\bbanks\(/.test(this.cols)
    return rows.map(r => {
      const out = structuredClone(r)
      if (withBanks) out.banks = structuredClone((this.db.tables.banks || []).find(b => b.id === r.bank_id) || null)
      return out
    })
  }
  finish(rows, count) {
    if (this.mode === 'one') {
      if (rows.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
      return { data: rows[0], error: null }
    }
    if (this.mode === 'maybe') {
      if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } }
      return { data: rows[0] ?? null, error: null }
    }
    return { data: this.head ? null : rows, error: null, count }
  }
  run() {
    const now = new Date().toISOString()
    if (this.op === 'insert') {
      const added = this.payload.map(p => ({ id: this.db.newId(), created_at: now, ...p }))
      this.rows.push(...added)
      return this.returning || this.mode ? this.finish(this.shape(added)) : { data: null, error: null }
    }
    if (this.op === 'upsert') {
      const out = []
      for (const p of this.payload) {
        const hit = this.rows.find(r => this.conflict.every(k => eqv(r[k], p[k])))
        if (hit) {
          Object.assign(hit, p)
          out.push(hit)
        } else {
          const row = { id: this.db.newId(), created_at: now, ...p }
          this.rows.push(row)
          out.push(row)
        }
      }
      return this.returning || this.mode ? this.finish(this.shape(out)) : { data: null, error: null }
    }
    const matched = this.rows.filter(r => this.match(r))
    if (this.op === 'update') {
      for (const r of matched) Object.assign(r, this.payload)
      return this.returning || this.mode ? this.finish(this.shape(matched)) : { data: null, error: null }
    }
    if (this.op === 'delete') {
      this.db.tables[this.name] = this.rows.filter(r => !matched.includes(r))
      return this.returning || this.mode ? this.finish(this.shape(matched)) : { data: null, error: null }
    }
    let rows = matched
    if (this.orderBy) {
      const { c, ascending } = this.orderBy
      rows = [...rows].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (ascending ? 1 : -1))
    }
    const count = this.count ? rows.length : undefined
    rows = rows.slice(this.from, this.to === Infinity ? undefined : this.to + 1)
    return this.finish(this.shape(rows), count)
  }
}

/**
 * Replaces Supabase for everything imported after this call: `seed` holds the tables, `tokens`
 * maps sign-in tokens to user ids. Returns the live tables (to look at what the server wrote).
 */
export function installFakeSupabase({ seed = {}, tokens = {} } = {}) {
  let n = 1
  const db = {
    tables: structuredClone(seed),
    newId: () => `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`,
  }
  const probe = createClient('http://fake.local', 'fake-key')
  const clientProto = Object.getPrototypeOf(probe)
  clientProto.from = function (name) {
    return new Query(db, name)
  }
  clientProto.rpc = async function (fn, args = {}) {
    if (fn === 'sum_tx_by_card') {
      const sums = new Map()
      for (const t of db.tables.transactions || []) {
        if (String(t.user_id) !== String(args.user_id_param) || t.archives || !t.card_id) continue
        sums.set(t.card_id, (sums.get(t.card_id) || 0) + Number(t.amount || 0))
      }
      return { data: [...sums].map(([card_id, total]) => ({ card_id, total })), error: null }
    }
    return { data: null, error: { message: `rpc ${fn} is not faked` } }
  }
  const authProto = Object.getPrototypeOf(probe.auth)
  authProto.getUser = async function (jwt) {
    const id = tokens[jwt]
    return id ? { data: { user: { id, email: `${id}@test.local` } }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } }
  }
  return db.tables
}
