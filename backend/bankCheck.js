// «Немає в банку»: a transaction entered by hand on a card the bank syncs, that the bank never
// brought — usually cash put on the bank card by mistake. A bank charge the user entered by hand
// too gets paired with it on import (bankConnections.js, findManualTwins); one that stays alone for
// days is shown in «Закріплені» on the web and the iPhone until it's moved, deleted or confirmed.

import { patchPreferences, readPreferences } from './insights.js'

const DAY = 864e5
// The bank has had time to bring it (Revolut settles in 1–3 days, a hotel or fuel hold later)
const GRACE_DAYS = 5
// Only recent ones: a mistake is caught while fresh, old history isn't questioned
const LOOKBACK_DAYS = 30
// A bank row of the same amount this close: it's there (a duplicate — the duplicates check shows it)
const TWIN_DAYS = 3
// Made by the app, not entered: parts of a split transaction, old subscription rows
const MADE_BY_APP = /(розділено|автоматично створено)/i
// Balance corrections have nothing in the bank by design
const CORRECTION = /(перерах|коригув|корекц)/i
// Confirmed ones kept (the oldest drop off)
const MAX_CONFIRMED = 300

/** The user's cards the bank fills, with the bank's name and the last day it could have brought a transaction */
async function syncedCards(supabase, userId) {
  const { data: conns, error } = await supabase
    .from('bank_connections')
    .select('id, provider_name, last_sync_at')
    .eq('user_id', userId)
    .eq('status', 'active')
  if (error) throw error
  if (!conns?.length) return new Map()
  const { data: links, error: linksError } = await supabase
    .from('bank_connection_accounts')
    .select('connection_id, card_id, account_id')
    .eq('user_id', userId)
    .in('connection_id', conns.map(c => c.id))
    .not('card_id', 'is', null)
  if (linksError) throw linksError

  const cards = new Map()
  for (const l of links || []) {
    if (String(l.account_id).startsWith('manual:')) continue // added by hand: the bank doesn't list its transactions
    const conn = conns.find(c => c.id === l.connection_id)
    if (!conn?.last_sync_at) continue
    const until = Math.min(Date.now(), Date.parse(conn.last_sync_at)) - GRACE_DAYS * DAY
    const prev = cards.get(l.card_id)
    if (!prev || until > prev.until) cards.set(l.card_id, { bank: conn.provider_name, until })
  }
  return cards
}

/**
 * The user's hand-entered transactions on synced cards the bank doesn't have, newest first; each
 * with `bank_check: { bank }`. Confirmed ones («Все правильно») are left out.
 */
export async function findNotInBank(supabase, userId) {
  const cards = await syncedCards(supabase, userId)
  if (!cards.size) return []
  const since = Date.now() - LOOKBACK_DAYS * DAY
  const confirmed = new Set((await readPreferences(supabase, userId)).bankCheck?.ok || [])

  const out = []
  for (const [cardId, { bank, until }] of cards) {
    if (until <= since) continue
    const { data: rows, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('card_id', cardId)
      .is('transaction_id_card', null)
      .eq('status', 'booked')
      .not('archives', 'is', true)
      .is('refund_for', null)
      .not('is_transfer', 'is', true)
      .gte('created_at', new Date(since).toISOString())
      .lte('created_at', new Date(until).toISOString())
    if (error) throw error
    const entered = (rows || []).filter(
      t => !confirmed.has(t.id) && Number(t.amount) && !MADE_BY_APP.test(t.note || '') && !CORRECTION.test(t.category || '')
    )
    if (!entered.length) continue

    // The bank's own rows of those days (pending too), and where its history starts
    const [{ data: bankRows, error: bankError }, { data: first }] = await Promise.all([
      supabase
        .from('transactions')
        .select('amount, created_at')
        .eq('user_id', userId)
        .eq('card_id', cardId)
        .not('transaction_id_card', 'is', null)
        .gte('created_at', new Date(since - TWIN_DAYS * DAY).toISOString()),
      supabase
        .from('transactions')
        .select('created_at')
        .eq('user_id', userId)
        .eq('card_id', cardId)
        .not('transaction_id_card', 'is', null)
        .order('created_at')
        .limit(1),
    ])
    if (bankError) throw bankError
    const bankFrom = first?.[0] ? Date.parse(first[0].created_at) : Infinity

    for (const t of entered) {
      const at = Date.parse(t.created_at)
      if (at < bankFrom) continue // before the bank's history: nothing to compare with
      const inBank = (bankRows || []).some(
        b => Math.abs(Number(b.amount) - Number(t.amount)) <= 0.005 && Math.abs(Date.parse(b.created_at) - at) <= TWIN_DAYS * DAY
      )
      if (!inBank) out.push({ ...t, bank_check: { bank } })
    }
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function registerBankCheck(app, { supabase, getUserFromToken }) {
  // GET /api/bank-check — hand-entered transactions on synced cards that the bank doesn't have
  app.get('/api/bank-check', getUserFromToken, async (req, res) => {
    try {
      res.json(await findNotInBank(supabase, req.user_id))
    } catch (e) {
      console.error('[BankCheck] error:', e.message)
      res.status(500).json({ error: e.message })
    }
  })

  // POST /api/bank-check/ok { id } — «Все правильно»: not shown as missing from the bank again
  app.post('/api/bank-check/ok', getUserFromToken, async (req, res) => {
    try {
      const id = String(req.body?.id || '')
      const { data: tx } = await supabase.from('transactions').select('id').eq('id', id).eq('user_id', req.user_id).maybeSingle()
      if (!tx) return res.status(404).json({ error: 'Транзакцію не знайдено' })
      const prev = (await readPreferences(supabase, req.user_id)).bankCheck?.ok || []
      await patchPreferences(supabase, req.user_id, 'bankCheck', { ok: [...prev.filter(x => x !== id), id].slice(-MAX_CONFIRMED) })
      res.json({ success: true })
    } catch (e) {
      console.error('[BankCheck] ok error:', e.message)
      res.status(500).json({ error: e.message })
    }
  })
}
