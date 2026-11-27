// GET /api/home — everything the Home screen needs to draw, in one request (it used to be ~10, plus
// every transaction of the last 6 months downloaded to add up the months on the phone):
// the accounts, each account's sum, cash, the preferences, and the months already added up per
// account and category. The apps still apply their own rules on top (which accounts and
// categories count, the currency they show), so the numbers stay what they were.

import { withCardV2 } from './accountKind.js'
import { withBgLinks } from './cardBg.js'

const PREF_HIDDEN = ['claude_connections', 'api_key']
const PAGE = 1000
const MAX_ROWS = 50000

// Never the full card number, CVV or expiry (the apps show the last 4 digits at most), and not the
// background picture itself (a link to it instead, see cardBg.js)
const HOME_CARD_COLUMNS =
  'id, bank_id, name, currency, initial_balance, card_number, created_at, exclude_from_stats, banks(name, iban, bic, beneficiary, exclude_from_stats)'

const last4 = n => {
  const digits = String(n || '').replace(/\D/g, '')
  return digits ? digits.slice(-4) : null
}

function validTimeZone(tz) {
  try {
    if (!tz) return null
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return null
  }
}

function monthKeyer(timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' })
  return iso => {
    const parts = fmt.formatToParts(new Date(iso))
    const y = parts.find(p => p.type === 'year')?.value
    const m = parts.find(p => p.type === 'month')?.value
    return `${y}-${m}`
  }
}

/** Every row of a query, page by page (the database answers at most 1000 at a time) */
async function allRows(build) {
  const out = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return out
}

/**
 * The months, added up per (month, account, category): income and spending in the account's
 * currency, by the same per-transaction rules the apps use (no archive, transfers, refunds or
 * transactions switched out of statistics); amount_stat already has refunds taken off.
 */
async function monthAggregates(supabase, userId, start, end, timeZone) {
  const rows = await allRows(() =>
    supabase
      .from('transactions')
      .select('amount, amount_stat, created_at, card_id, category, exclude_from_stats, is_transfer, archives, refund_for, note')
      .eq('user_id', userId)
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: false })
  )
  const keyOf = monthKeyer(timeZone)
  const cells = new Map()
  for (const t of rows) {
    if (t.archives || t.is_transfer || t.refund_for) continue
    if (t.exclude_from_stats === true || t.exclude_from_stats === 'true' || t.exclude_from_stats === 1) continue
    if (String(t.note || '').includes('[refund_for:')) continue
    const amt = Number(t.amount_stat ?? t.amount ?? 0)
    if (!amt) continue
    const m = keyOf(t.created_at)
    const key = `${m}\u0001${t.card_id || ''}\u0001${t.category || ''}`
    let cell = cells.get(key)
    if (!cell) {
      cell = { m, c: t.card_id || null, k: t.category || null, i: 0, e: 0 }
      cells.set(key, cell)
    }
    if (amt > 0) cell.i += amt
    else cell.e += -amt
  }
  return [...cells.values()]
}

export function registerHome(app, { supabase, getUserFromToken }) {
  // GET /api/home?start=<ISO>&end=<ISO>&tz=<IANA time zone>
  app.get('/api/home', getUserFromToken, async (req, res) => {
    const userId = req.user_id
    try {
      const now = new Date()
      const startDate = new Date(String(req.query.start || ''))
      const endDate = new Date(String(req.query.end || ''))
      const start = Number.isNaN(startDate.getTime())
        ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)).toISOString()
        : startDate.toISOString()
      const end = Number.isNaN(endDate.getTime()) ? new Date(now.getTime() + 864e5).toISOString() : endDate.toISOString()
      const timeZone = validTimeZone(String(req.query.tz || '')) || 'Europe/Kyiv'

      const [cardsRes, sumsRes, cashRows, prefsRes, months] = await Promise.all([
        withCardV2(extra =>
          supabase
            .from('cards')
            .select(HOME_CARD_COLUMNS + extra)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
        ),
        supabase.rpc('sum_tx_by_card', { user_id_param: userId }),
        allRows(() =>
          supabase.from('transactions').select('amount').eq('user_id', userId).is('card_id', null).or('archives.is.null,archives.eq.false')
        ),
        supabase.from('user_preferences').select('preferences').eq('user_id', userId).maybeSingle(),
        monthAggregates(supabase, userId, start, end, timeZone),
      ])
      if (cardsRes.error) throw cardsRes.error
      if (sumsRes.error) throw sumsRes.error
      if (prefsRes.error) throw prefsRes.error

      const plain = (cardsRes.data || []).map(card => ({
        ...card,
        card_number: last4(card.card_number),
        bank: card.banks?.name || null,
        iban: card.banks?.iban || null,
        bic: card.banks?.bic || null,
        beneficiary: card.banks?.beneficiary || null,
        bank_exclude_from_stats: card.banks?.exclude_from_stats || false,
      }))
      // A link to each card's background picture, not the picture itself
      const cards = await withBgLinks(supabase, req, userId, plain)
      const sums = {}
      for (const row of sumsRes.data || []) if (row.card_id) sums[row.card_id] = Number(row.total || 0)
      const cash = cashRows.reduce((s, t) => s + Number(t.amount || 0), 0)
      const preferences = { ...(prefsRes.data?.preferences || {}) }
      for (const key of PREF_HIDDEN) delete preferences[key]

      res.set('Cache-Control', 'no-store')
      res.json({ v: 1, at: Date.now(), cards, sums, cash, preferences, months: { start, end, tz: timeZone, rows: months } })
    } catch (e) {
      console.error('[Home] load failed:', e.message)
      res.status(500).json({ error: 'Не вдалося завантажити головну' })
    }
  })
}
