// «AI-асистент»: a chat about the user's money. GPT answers from the user's data, which it can only
// read through the fixed functions below (each one limited to this user, no free-form queries).
// Read-only for now: it can't add, change or delete anything.

import { readPreferences, userCategories } from './insights.js'

const OPENAI_MODEL = 'gpt-5.1'
const MAX_TOOL_ROUNDS = 6
const MAX_HISTORY = 16
const MAX_MESSAGE_CHARS = 2000
const MAX_SHOWN = 15
// Soft limit per user (per server instance): questions per hour
const RATE_LIMIT = 60
const RATE_WINDOW_MS = 36e5
const DAY = 864e5

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Rates against EUR (open.er-api.com, the same source the apps use), kept for a few hours
let ratesCache = null
async function eurRates() {
  if (ratesCache && Date.now() - ratesCache.at < 6 * 36e5) return ratesCache.rates
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/EUR', { signal: AbortSignal.timeout(5000) })
    const j = await r.json()
    if (j?.rates) ratesCache = { at: Date.now(), rates: j.rates }
  } catch {}
  return ratesCache?.rates || null
}

const normCurrency = c => {
  const up = String(c || 'UAH').toUpperCase()
  return up === 'USDT' ? 'USD' : up
}

function converter(rates) {
  return (amount, from, to) => {
    const f = normCurrency(from)
    const t = normCurrency(to)
    if (f === t || !rates?.[f] || !rates?.[t]) return amount
    return (amount / rates[f]) * rates[t]
  }
}

const round2 = v => Math.round(v * 100) / 100

/** A day in the user's time zone → UTC instant ("2026-10-01" + offset) */
function dayStartUtc(day, offsetMin) {
  const [y, m, d] = String(day).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d) - offsetMin * 60000)
}

/** The transaction's date and time in the user's time zone */
function localStamp(iso, offsetMin) {
  const d = new Date(new Date(iso).getTime() + offsetMin * 60000)
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

function titleOf(t) {
  const note = String(t.note || '').replace(/\[pinned\]/g, '').split('|')[0].split('\n')[0].trim()
  return (t.merchant_name || note || t.category || '').slice(0, 60)
}

// Text the user typed, safe inside a PostgREST or() filter
const likeSafe = s => String(s || '').replace(/[%,()*\\"]/g, ' ').trim().slice(0, 60)

// ---------------------------------------------------------------------------
// What the assistant knows about the user before asking anything
// ---------------------------------------------------------------------------

async function loadContext(supabase, userId, offsetMin) {
  const [prefs, { data: cards }, categories, rates] = await Promise.all([
    readPreferences(supabase, userId),
    // Never card numbers, CVV or IBAN
    supabase
      .from('cards')
      .select('id, name, bank, currency, initial_balance, exclude_from_stats, banks(exclude_from_stats)')
      .eq('user_id', userId),
    userCategories(supabase, userId).catch(() => []),
    eurRates(),
  ])
  const list = (cards || []).map(c => {
    const label = `${c.bank || ''} ${c.name || ''}`.toLowerCase()
    return {
      id: c.id,
      name: c.name,
      bank: c.bank,
      currency: normCurrency(c.currency),
      initial: Number(c.initial_balance || 0),
      bankOff: !!c.banks?.exclude_from_stats,
      // Left out of statistics: switched off, savings, crypto
      notInStats:
        !!c.exclude_from_stats ||
        !!c.banks?.exclude_from_stats ||
        ['збер', 'накопич', 'savings', 'binance'].some(w => label.includes(w)),
    }
  })
  return {
    cards: list,
    cardById: new Map(list.map(c => [c.id, c])),
    currency: ['UAH', 'EUR', 'USD', 'PLN', 'GBP'].includes(prefs.primaryCurrency) ? prefs.primaryCurrency : 'UAH',
    excludedCategories: Array.isArray(prefs.stats?.excludedCategories) ? prefs.stats.excludedCategories : [],
    categories,
    convert: converter(rates),
    offsetMin,
  }
}

/** Whether a row counts in statistics — the same rules as the apps' Analytics */
function countsInStats(t, ctx) {
  if (t.archives || t.is_transfer || t.exclude_from_stats || t.refund_for || t.status === 'pending') return false
  if (t.category && ctx.excludedCategories.includes(t.category)) return false
  if (t.card_id && ctx.cardById.get(t.card_id)?.notInStats) return false
  return true
}

const TX_FIELDS =
  'id, amount, amount_stat, created_at, category, note, merchant_name, card_id, is_transfer, exclude_from_stats, refund_for, status, archives, category_source, subscription_id'

function compactRow(t, ctx) {
  const card = t.card_id ? ctx.cardById.get(t.card_id) : null
  const flags = []
  if (t.is_transfer) flags.push('transfer')
  if (t.refund_for) flags.push('refund')
  if (t.exclude_from_stats) flags.push('not_in_stats')
  if (t.status === 'pending') flags.push('pending')
  if (t.category_source === 'auto') flags.push('auto_category')
  if (t.subscription_id) flags.push('subscription')
  const amount = Number(t.amount_stat ?? t.amount)
  return {
    id: t.id,
    date: localStamp(t.created_at, ctx.offsetMin),
    amount: round2(amount),
    currency: card?.currency || 'UAH',
    category: t.category || null,
    title: titleOf(t),
    card: card ? card.name : 'Готівка',
    ...(flags.length && { flags }),
  }
}

async function fetchRows(supabase, userId, ctx, { from, to, category, cards, kind, text, limit = 2000 }) {
  const out = []
  if (cards?.ids && cards.ids.length === 0) return out
  for (let offset = 0; offset < limit; offset += 1000) {
    let q = supabase
      .from('transactions')
      .select(TX_FIELDS)
      .eq('user_id', userId)
      .not('archives', 'is', true)
      .order('created_at', { ascending: false })
      .range(offset, Math.min(offset + 999, limit - 1))
    const start = from ? dayStartUtc(from, ctx.offsetMin) : null
    const end = to ? dayStartUtc(to, ctx.offsetMin) : null
    if (start) q = q.gte('created_at', start.toISOString())
    if (end) q = q.lt('created_at', new Date(end.getTime() + DAY).toISOString())
    if (category) q = q.eq('category', category)
    if (cards?.cash) q = q.is('card_id', null)
    else if (cards?.ids) q = q.in('card_id', cards.ids)
    if (kind === 'expense') q = q.lt('amount', 0)
    if (kind === 'income') q = q.gt('amount', 0)
    const words = likeSafe(text)
    if (words) q = q.or(`note.ilike.%${words}%,merchant_name.ilike.%${words}%,category.ilike.%${words}%`)
    const { data, error } = await q
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

/** Which cards a card filter means: { cash: true } for cash, else the ids of cards whose name or bank contains the text */
function cardsMatching(ctx, card) {
  if (!card) return null
  const s = String(card).toLowerCase().trim()
  if (/готів|cash/.test(s)) return { cash: true }
  return { ids: ctx.cards.filter(c => `${c.bank || ''} ${c.name || ''}`.toLowerCase().includes(s)).map(c => c.id) }
}

// ---------------------------------------------------------------------------
// The functions GPT may call
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_transactions',
      description:
        'Find the user\'s transactions. Returns the matching rows (newest first unless sorted otherwise) and their totals. Amounts: negative = spending, positive = income, in the card\'s currency. sum_main is in the main currency and follows the statistics rules (no transfers, refunds, "not in stats", excluded categories or cards).',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Words to find in the merchant, note or category, e.g. "uber", "lidl", "кава"' },
          from: { type: 'string', description: 'First day, YYYY-MM-DD (user time zone)' },
          to: { type: 'string', description: 'Last day, YYYY-MM-DD, inclusive' },
          category: { type: 'string', description: 'Exact category name' },
          card: { type: 'string', description: 'Part of the card or bank name, or "Готівка" for cash' },
          kind: { type: 'string', enum: ['expense', 'income', 'all'] },
          min_amount: { type: 'number', description: 'Smallest absolute amount' },
          max_amount: { type: 'number', description: 'Largest absolute amount' },
          sort: { type: 'string', enum: ['newest', 'oldest', 'largest'] },
          limit: { type: 'integer', description: 'Rows to return, up to 40 (default 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spending_summary',
      description:
        'Totals for a period in the main currency, grouped — exactly how the app\'s Analytics counts (statistics rules apply). Use it for "how much", "where most", comparisons between periods (call it once per period).',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'First day, YYYY-MM-DD' },
          to: { type: 'string', description: 'Last day, YYYY-MM-DD, inclusive' },
          kind: { type: 'string', enum: ['expense', 'income'] },
          group_by: { type: 'string', enum: ['category', 'merchant', 'month', 'week', 'weekday', 'card'] },
          category: { type: 'string', description: 'Only this category (e.g. to see its merchants)' },
          top: { type: 'integer', description: 'Groups to return, up to 30 (default 12)' },
        },
        required: ['from', 'to', 'kind', 'group_by'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_balances',
      description: 'Current balance of every card / account (as the app shows it) and the total in the main currency.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_subscriptions',
      description: 'Subscriptions found in the bank charges: amount, how often, next charge, active or not.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_transaction',
      description:
        'One transaction in full, plus the history of the same merchant (how often, how much on average, the last few) — to explain or judge a charge.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
]

async function runTool(name, args, { supabase, userId, ctx, seen }) {
  const remember = rows => rows.forEach(r => seen.add(r.id))

  if (name === 'search_transactions') {
    const cards = cardsMatching(ctx, args.card)
    let rows = await fetchRows(supabase, userId, ctx, { ...args, cards, limit: 2000 })
    const min = Number(args.min_amount) || 0
    const max = Number(args.max_amount) || Infinity
    rows = rows.filter(t => {
      const a = Math.abs(Number(t.amount))
      return a >= min && a <= max
    })
    if (args.sort === 'oldest') rows.reverse()
    if (args.sort === 'largest') rows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    const counted = rows.filter(t => countsInStats(t, ctx))
    const sumMain = counted.reduce(
      (s, t) => s + ctx.convert(Number(t.amount_stat ?? t.amount), ctx.cardById.get(t.card_id)?.currency || 'UAH', ctx.currency),
      0
    )
    const shown = rows.slice(0, Math.min(Math.max(Number(args.limit) || 20, 1), 40)).map(t => compactRow(t, ctx))
    remember(shown)
    return {
      found: rows.length,
      ...(rows.length >= 2000 && { note: 'too many matches — only the newest 2000 are counted; narrow the period' }),
      counted_in_stats: counted.length,
      sum_main: round2(sumMain),
      main_currency: ctx.currency,
      rows: shown,
    }
  }

  if (name === 'spending_summary') {
    const rows = await fetchRows(supabase, userId, ctx, { from: args.from, to: args.to, category: args.category, kind: args.kind, limit: 20000 })
    const counted = rows.filter(t => countsInStats(t, ctx))
    const groups = new Map()
    let total = 0
    for (const t of counted) {
      const value = Math.abs(ctx.convert(Number(t.amount_stat ?? t.amount), ctx.cardById.get(t.card_id)?.currency || 'UAH', ctx.currency))
      if (!value) continue
      const local = new Date(new Date(t.created_at).getTime() + ctx.offsetMin * 60000)
      let key
      if (args.group_by === 'category') key = t.category || 'Без категорії'
      else if (args.group_by === 'merchant') key = titleOf(t) || 'Без назви'
      else if (args.group_by === 'month') key = local.toISOString().slice(0, 7)
      else if (args.group_by === 'week') {
        const monday = new Date(local.getTime() - ((local.getUTCDay() + 6) % 7) * DAY)
        key = `тиждень з ${monday.toISOString().slice(0, 10)}`
      } else if (args.group_by === 'weekday') key = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][local.getUTCDay()]
      else key = t.card_id ? ctx.cardById.get(t.card_id)?.name || 'Картка' : 'Готівка'
      const g = groups.get(key) || { key, total: 0, count: 0 }
      g.total += value
      g.count += 1
      groups.set(key, g)
      total += value
    }
    const top = Math.min(Math.max(Number(args.top) || 12, 1), 30)
    const sorted = [...groups.values()].sort((a, b) =>
      ['month', 'week'].includes(args.group_by) ? a.key.localeCompare(b.key) : b.total - a.total
    )
    return {
      period: `${args.from} — ${args.to}`,
      kind: args.kind,
      currency: ctx.currency,
      total: round2(total),
      count: counted.length,
      groups: sorted.slice(0, top).map(g => ({ ...g, total: round2(g.total), share: total ? round2((g.total / total) * 100) : 0 })),
      ...(sorted.length > top && { more_groups: sorted.length - top }),
    }
  }

  if (name === 'get_balances') {
    const [{ data: sums }, { data: cash }] = await Promise.all([
      supabase.rpc('sum_tx_by_card', { user_id_param: userId }),
      supabase.from('transactions').select('amount').eq('user_id', userId).is('card_id', null).not('archives', 'is', true),
    ])
    const sumBy = new Map((sums || []).map(s => [s.card_id, Number(s.total || 0)]))
    // Like Home: every card except those of a bank switched off
    const cards = ctx.cards
      .filter(c => !c.bankOff)
      .map(c => {
        const balance = c.initial + (sumBy.get(c.id) || 0)
        return { name: c.name, bank: c.bank, currency: c.currency, balance: round2(balance), in_main: round2(ctx.convert(balance, c.currency, ctx.currency)) }
      })
    const cashSum = (cash || []).reduce((s, t) => s + Number(t.amount || 0), 0)
    if (Math.abs(cashSum) > 0.005) cards.push({ name: 'Готівка', bank: null, currency: 'UAH', balance: round2(cashSum), in_main: round2(ctx.convert(cashSum, 'UAH', ctx.currency)) })
    return { currency: ctx.currency, total: round2(cards.reduce((s, c) => s + c.in_main, 0)), accounts: cards }
  }

  if (name === 'list_subscriptions') {
    const { data } = await supabase
      .from('subscriptions')
      .select('name, amount, currency, frequency, charges_per_period, is_active, next_execution_at, last_executed_at, category')
      .eq('user_id', userId)
      .eq('source', 'detected')
      .eq('hidden', false)
    const monthly = s => {
      const per = Number(s.amount) * Math.max(1, s.charges_per_period || 1)
      const m = s.frequency === 'weekly' ? (per * 52) / 12 : s.frequency === 'yearly' ? per / 12 : per
      return ctx.convert(m, s.currency || 'UAH', ctx.currency)
    }
    const active = (data || []).filter(s => s.is_active)
    return {
      currency: ctx.currency,
      active_total_per_month_main: round2(active.reduce((sum, s) => sum + monthly(s), 0)),
      subscriptions: (data || []).map(s => ({
        name: s.name,
        per_month_main: round2(monthly(s)),
        amount: Number(s.amount),
        currency: s.currency || 'UAH',
        frequency: s.frequency,
        charges_per_period: s.charges_per_period || 1,
        active: s.is_active,
        next_charge: s.next_execution_at?.slice(0, 10) || null,
        last_charge: s.last_executed_at?.slice(0, 10) || null,
        category: s.category,
      })),
    }
  }

  if (name === 'get_transaction') {
    const { data: t } = await supabase.from('transactions').select(TX_FIELDS).eq('user_id', userId).eq('id', String(args.id || '')).maybeSingle()
    if (!t) return { error: 'not found' }
    seen.add(t.id)
    // The same merchant over the last ~13 months
    const name = t.merchant_name || String(t.note || '').split('|')[0].split('\n')[0].replace(/\[pinned\]/g, '').trim()
    let similar = []
    if (name) {
      const since = new Date(Date.now() - 400 * DAY).toISOString()
      let q = supabase.from('transactions').select(TX_FIELDS).eq('user_id', userId).not('archives', 'is', true).gte('created_at', since).neq('id', t.id)
      q = t.merchant_name ? q.eq('merchant_name', t.merchant_name) : q.ilike('note', `${likeSafe(name)}%`)
      const { data } = await q.order('created_at', { ascending: false }).limit(300)
      similar = data || []
    }
    const amounts = similar.map(s => Math.abs(Number(s.amount)))
    const months = new Set(similar.map(s => s.created_at.slice(0, 7))).size
    const last = similar.slice(0, 5).map(s => compactRow(s, ctx))
    last.forEach(r => seen.add(r.id))
    return {
      transaction: { ...compactRow(t, ctx), note: String(t.note || '').replace(/\[pinned\]/g, '').trim().slice(0, 300) },
      same_merchant: {
        count: similar.length,
        months_with_charges: months,
        average: amounts.length ? round2(amounts.reduce((s, a) => s + a, 0) / amounts.length) : null,
        min: amounts.length ? round2(Math.min(...amounts)) : null,
        max: amounts.length ? round2(Math.max(...amounts)) : null,
        last,
      },
    }
  }

  return { error: `unknown function ${name}` }
}

// ---------------------------------------------------------------------------
// The conversation
// ---------------------------------------------------------------------------

function systemPrompt(ctx, today, focus) {
  const cards = ctx.cards.filter(c => !c.bankOff).map(c => `${c.name}${c.bank ? ` (${c.bank})` : ''}, ${c.currency}`)
  return `Ти — AI-асистент у застосунку MyWallet (облік особистих фінансів). Допомагаєш людині розібратися з її грошима.
Сьогодні ${today}. Основна валюта: ${ctx.currency}.
Рахунки: ${cards.join('; ') || 'немає'}.
Категорії користувача: ${ctx.categories.slice(0, 60).join(', ') || 'немає'}.
Поза статистикою (користувач сам виключив): ${ctx.excludedCategories.join(', ') || 'нічого'}.

Правила:
- Відповідай українською, коротко й по суті (зазвичай до 6–8 рядків), на «ти», дружньо. Цифри — обов'язково, з валютою; великі суми округлюй. Суми пиши по-українськи: «2 858 €», «12,50 €», «299 ₴».
- Дані бери ЛИШЕ з функцій. Нічого не вигадуй; якщо даних немає — так і скажи. Не повторюй ті самі виклики без потреби.
- «Скільки витрачено / де найбільше / порівняй» — spending_summary (рахує як «Аналітика» в застосунку). Пошук конкретних покупок — search_transactions.
- Транзакції, які показуєш у "show", застосунок покаже списком під відповіддю — у тексті НЕ перелічуй їх по одній, дай підсумок (скільки, на яку суму, що помітно).
- Не вгадуй рід: без «ти витратив» — пиши «витрачено», «пішло», «вийшло».
- Ти поки лише читаєш дані. Додати, змінити, видалити транзакцію не можеш — якщо просять, скажи, що це з'явиться згодом, і як зробити вручну в застосунку.
- Не давай персональних інвестиційних порад; загальні поради щодо бюджету — можна.
${focus ? `\nКористувач відкрив чат з транзакції — питання, найімовірніше, про неї (id ${focus.id}): ${JSON.stringify(focus)}. Щоб пояснити її або порівняти з минулими, виклич get_transaction.\n` : ''}
Формат відповіді — ЛИШЕ JSON:
{"answer": "<текст; можна **жирний** і списки, де кожен пункт з нового рядка й починається з '- '>", "show": ["<id транзакцій з результатів функцій, які варто показати під відповіддю списком — до ${MAX_SHOWN}; [] якщо не треба>"]}`
}

async function openaiChat(messages) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(40000),
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      response_format: { type: 'json_object' },
    }),
  })
  const raw = await r.text()
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${raw.slice(0, 300)}`)
  return JSON.parse(raw)?.choices?.[0]?.message
}

function cleanHistory(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter(m => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
}

const hits = new Map()
function rateLimited(userId) {
  const now = Date.now()
  const list = (hits.get(userId) || []).filter(t => now - t < RATE_WINDOW_MS)
  list.push(now)
  hits.set(userId, list)
  return list.length > RATE_LIMIT
}

export function registerAssistant(app, { supabase, getUserFromToken }) {
  // POST /api/assistant/chat { messages: [{ role, content }], transactionId?, client?: { now, offsetMin } }
  // → { answer, transactions }
  app.post('/api/assistant/chat', getUserFromToken, async (req, res) => {
    const userId = req.user_id
    try {
      if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Асистент не налаштований (немає ключа GPT)' })
      if (rateLimited(userId)) return res.status(429).json({ error: 'Забагато питань за годину — спробуй трохи пізніше' })
      const history = cleanHistory(req.body?.messages)
      if (!history.length || history[history.length - 1].role !== 'user') return res.status(400).json({ error: 'Немає питання' })

      // The user's time zone: dates in answers and filters are theirs, not the server's
      const offsetMin = Math.max(-840, Math.min(840, Math.round(Number(req.body?.client?.offsetMin) || 0)))
      const ctx = await loadContext(supabase, userId, offsetMin)
      const now = new Date(Date.now() + offsetMin * 60000)
      const today = `${now.toISOString().slice(0, 10)} (${['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота'][now.getUTCDay()]})`

      // Opened from a transaction (long press → «Запитати AI»)
      const seen = new Set()
      let focus = null
      if (req.body?.transactionId) {
        const { data: t } = await supabase.from('transactions').select(TX_FIELDS).eq('user_id', userId).eq('id', String(req.body.transactionId)).maybeSingle()
        if (t) {
          focus = compactRow(t, ctx)
          seen.add(t.id)
        }
      }

      const messages = [{ role: 'system', content: systemPrompt(ctx, today, focus) }, ...history]
      let reply = null
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const msg = await openaiChat(messages)
        if (!msg) throw new Error('empty answer')
        if (msg.tool_calls?.length && round < MAX_TOOL_ROUNDS) {
          messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls })
          for (const call of msg.tool_calls) {
            let result
            try {
              const args = JSON.parse(call.function?.arguments || '{}')
              result = await runTool(call.function?.name, args, { supabase, userId, ctx, seen })
            } catch (e) {
              result = { error: String(e.message || e).slice(0, 200) }
            }
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 30000) })
          }
          continue
        }
        reply = msg.content
        break
      }

      let parsed = {}
      try {
        parsed = JSON.parse(reply || '{}')
      } catch {
        parsed = { answer: String(reply || '') }
      }
      const answer = String(parsed.answer || '').trim() || 'Не вдалося відповісти — спробуй переформулювати питання.'
      // Only transactions the functions returned for this user
      const ids = (Array.isArray(parsed.show) ? parsed.show : []).map(String).filter(id => seen.has(id)).slice(0, MAX_SHOWN)
      let transactions = []
      if (ids.length) {
        const { data } = await supabase.from('transactions').select('*').eq('user_id', userId).in('id', ids)
        const byId = new Map((data || []).map(t => [t.id, t]))
        transactions = ids.map(id => byId.get(id)).filter(Boolean)
      }
      res.json({ answer, transactions })
    } catch (e) {
      console.error('[Assistant] error:', e.message)
      res.status(500).json({ error: 'Асистент зараз не відповідає — спробуй ще раз' })
    }
  })
}
