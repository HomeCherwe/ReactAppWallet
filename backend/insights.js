// Things the app works out from the user's own transactions:
// - auto-categories: bank imports get a category from the user's habits (rules in the database,
//   learned from their own edits), GPT only for merchants never seen before;
// - subscriptions: regular charges found in bank transactions (shown for information);
// - the month's report: a few sentences from GPT about the month's numbers.

const DAY = 864e5
const OPENAI_MODEL = 'gpt-5.1'
// New merchants asked about in one GPT request
const GPT_BATCH = 25
// Subscriptions are looked for again at most this often (after a sync or when the list opens)
const DETECT_EVERY_MS = 12 * 36e5

async function openaiJson(system, user, timeoutMs = 25000) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing')
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    // A slow answer must not hold up a bank sync
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  const raw = await r.text()
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${raw.slice(0, 300)}`)
  const content = JSON.parse(raw)?.choices?.[0]?.message?.content
  return typeof content === 'string' ? JSON.parse(content) : content
}

async function readPreferences(supabase, userId) {
  const { data } = await supabase.from('user_preferences').select('preferences').eq('user_id', userId).maybeSingle()
  return data?.preferences || {}
}

/** Merges values into one preferences section (e.g. "insights"), keeping everything else */
async function patchPreferences(supabase, userId, section, values) {
  const { data: row } = await supabase.from('user_preferences').select('id, preferences').eq('user_id', userId).maybeSingle()
  if (!row) return
  const preferences = { ...(row.preferences || {}) }
  preferences[section] = { ...(preferences[section] || {}), ...values }
  await supabase.from('user_preferences').update({ preferences }).eq('id', row.id)
}

// ---------------------------------------------------------------------------
// Auto-categories
// ---------------------------------------------------------------------------

/** The user's categories, most used first (what GPT may choose from) */
async function userCategories(supabase, userId) {
  const counts = new Map()
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from('transactions')
      .select('category')
      .eq('user_id', userId)
      .not('category', 'is', null)
      .range(from, from + 999)
    if (error) throw error
    for (const r of data || []) {
      const c = String(r.category || '').trim()
      if (c && !/sync$/i.test(c)) counts.set(c, (counts.get(c) || 0) + 1)
    }
    if (!data || data.length < 1000) break
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80).map(([c]) => c)
}

/** GPT picks one of the user's categories for each new merchant, or null when unsure */
export async function gptCategorize(items, categories) {
  const system = `You sort a person's bank transactions into THEIR OWN categories.
Allowed categories (use the exact name): ${JSON.stringify(categories)}
For each item, choose the category that fits the merchant/description best. If none fits or you are not fairly sure, use null — a wrong guess is worse than none.
Return ONLY JSON: {"results": [{"key": "<the item's key>", "category": "<one of the allowed names>" | null}]}`
  const parsed = await openaiJson(system, JSON.stringify(items))
  const out = new Map()
  for (const r of parsed?.results || []) {
    if (!r?.key) continue
    out.set(String(r.key), categories.includes(r.category) ? r.category : null)
  }
  return out
}

/**
 * Categorizes the user's waiting bank imports ("… Sync"), all of them or the given ids:
 * rules first (database: auto_categorize_transactions), then GPT for merchants it never saw —
 * GPT's answer is only a suggestion until the user confirms it (then it becomes their rule).
 * Mode from preferences.autoCategories.mode: 'auto' (default) | 'suggest' | 'off'.
 */
export async function autoCategorize(supabase, userId, ids = null, { useGpt = true } = {}) {
  const prefs = await readPreferences(supabase, userId)
  const mode = ['auto', 'suggest', 'off'].includes(prefs.autoCategories?.mode) ? prefs.autoCategories.mode : 'auto'
  if (mode === 'off') return { applied: 0, suggested: 0, mode }

  const run = async idList => {
    const { data, error } = await supabase.rpc('auto_categorize_transactions', { p_user_id: userId, p_ids: idList, p_mode: mode })
    if (error) throw error
    return data || []
  }
  const rows = await run(ids)
  let applied = rows.filter(r => r.applied).length
  let suggested = rows.filter(r => r.suggested).length

  const open = rows.filter(r => !r.applied && !r.suggested && r.merchant)
  if (useGpt && open.length > 0 && process.env.OPENAI_API_KEY) {
    try {
      const keys = [...new Set(open.map(r => r.merchant))]
      const { data: known } = await supabase.from('category_rules').select('merchant_key').eq('user_id', userId).in('merchant_key', keys)
      const knownKeys = new Set((known || []).map(k => k.merchant_key))
      const newKeys = keys.filter(k => !knownKeys.has(k)).slice(0, GPT_BATCH)
      if (newKeys.length > 0) {
        const sampleIds = newKeys.map(k => open.find(r => r.merchant === k).tx_id)
        const { data: samples } = await supabase.from('transactions').select('id, amount, note, merchant_name').in('id', sampleIds)
        const items = newKeys.map(k => {
          const t = (samples || []).find(s => s.id === open.find(r => r.merchant === k).tx_id) || {}
          return {
            key: k,
            text: String(t.merchant_name || t.note || k).replace(/\[pinned\]/g, '').trim().slice(0, 100),
            kind: Number(t.amount) < 0 ? 'expense' : 'income',
          }
        })
        const categories = await userCategories(supabase, userId)
        const guesses = categories.length ? await gptCategorize(items, categories) : new Map()
        // Asked once per merchant: a "don't know" is kept too, so it isn't asked again
        await supabase.from('category_rules').upsert(
          items.map(it => ({
            user_id: userId,
            merchant_key: it.key,
            category: guesses.get(it.key) ?? null,
            source: 'gpt',
            samples: 0,
            confidence: guesses.get(it.key) ? 0.6 : 0,
            example: it.text.slice(0, 80),
          })),
          { onConflict: 'user_id,merchant_key', ignoreDuplicates: true }
        )
        const again = await run(open.filter(r => newKeys.includes(r.merchant)).map(r => r.tx_id))
        applied += again.filter(r => r.applied).length
        suggested += again.filter(r => r.suggested).length
      }
    } catch (e) {
      console.warn('[AutoCategories] GPT step failed:', e.message)
    }
  }
  return { applied, suggested, mode }
}

// ---------------------------------------------------------------------------
// Subscriptions found in bank transactions
// ---------------------------------------------------------------------------

const median = list => {
  const s = [...list].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/*
  How each kind of subscription charges: `days` between charges, how far off a charge may be
  (more for a later one: banks post after weekends, months differ), how many periods in a row may be
  missing, how many payments prove it (`steady` of them exactly one period apart), and how long after
  the due date it still counts as active.
*/
const PERIODS = {
  weekly: { days: 7, tol: () => 2, maxSkip: 3, min: 4, steady: 3, grace: 5 },
  monthly: { days: 30.44, tol: k => Math.min(4 + k, 8), maxSkip: 6, min: 3, steady: 2, grace: 15 },
  yearly: { days: 365.25, tol: () => 15, maxSkip: 1, min: 2, steady: 1, grace: 45 },
}

/** Charges of one merchant split into groups of similar amounts (iCloud 0.99 and Apple Music 10.99) */
function clusterByAmount(charges) {
  const clusters = []
  for (const c of [...charges].sort((a, b) => a.abs - b.abs)) {
    const cl = clusters[clusters.length - 1]
    if (cl && c.abs - cl.min <= Math.max(cl.min * 0.08, 0.2)) cl.items.push(c)
    else clusters.push({ min: c.abs, items: [c] })
  }
  return clusters.map(cl => cl.items.sort((a, b) => a.date - b.date))
}

/** Charges a few days apart are one payment (two YouTube accounts paid the same day) */
function toEvents(items) {
  const events = []
  for (const c of items) {
    const last = events[events.length - 1]
    if (last && (c.date - last.date) / DAY <= 3) last.items.push(c)
    else events.push({ date: c.date, items: [c] })
  }
  return events
}

/** The longest run of payments that repeats every period, walking back from one of the latest */
function periodicRun(events, p) {
  let best = null
  for (let start = events.length - 1; start >= Math.max(0, events.length - 3); start--) {
    const run = [events[start]]
    let steady = 0
    for (let i = start - 1; i >= 0; i--) {
      const gap = (run[0].date - events[i].date) / DAY
      const k = Math.round(gap / p.days)
      if (k < 1) continue // something else in between
      if (k > p.maxSkip) break
      if (Math.abs(gap - k * p.days) <= p.tol(k)) {
        run.unshift(events[i])
        if (k === 1) steady++
      }
    }
    if (!best || run.length > best.run.length) best = { run, steady }
  }
  return best
}

/**
 * Whether similar charges are a subscription, and how often it charges (null if not).
 * `all` — every charge of that merchant: a shop the user visits all the time isn't a subscription,
 * even if some purchases there happen to be a month apart.
 */
export function classifyCharges(items, all = items) {
  const events = toEvents(items)
  for (const [frequency, p] of Object.entries(PERIODS)) {
    if (events.length < p.min) continue
    const r = periodicRun(events, p)
    if (!r || r.run.length < p.min || r.steady < p.steady) continue
    const first = r.run[0].date
    const last = r.run[r.run.length - 1].date
    const periods = Math.round((last - first) / DAY / p.days) + 1
    if (r.run.length / periods < 0.5) continue
    const charges = r.run.reduce((n, e) => n + e.items.length, 0)
    const around = all.filter(c => c.date >= first && c.date - last <= 3 * DAY).length
    if (charges / around < 0.6) continue
    return { frequency, run: r.run }
  }
  return null
}

/**
 * Charges right before or after a subscription's run that came on time but for another amount:
 * the price changed (EDF 37 → 62, two YouTube charges → one family charge). Added to the run.
 */
function extendRun(run, all, used, p) {
  const total = e => e.items.reduce((s, c) => s + c.abs, 0)
  const onTime = (from, to) => Math.abs((to - from) / DAY - p.days) <= p.tol(1)
  const similar = (c, e) => c.abs >= total(e) / 2 && c.abs <= total(e) * 2.2
  for (;;) {
    const last = run[run.length - 1]
    const next = all.find(c => !used.has(c.id) && c.date > last.date && onTime(last.date, c.date) && similar(c, last))
    if (!next) break
    used.add(next.id)
    run.push({ date: next.date, items: [next] })
  }
  for (;;) {
    const first = run[0]
    const prev = [...all].reverse().find(c => !used.has(c.id) && c.date < first.date && onTime(c.date, first.date) && similar(c, first))
    if (!prev) break
    used.add(prev.id)
    run.unshift({ date: prev.date, items: [prev] })
  }
}

function nextCharge(last, frequency) {
  const d = new Date(last)
  if (frequency === 'weekly') return new Date(d.getTime() + 7 * DAY)
  if (frequency === 'yearly') {
    d.setUTCFullYear(d.getUTCFullYear() + 1)
    return d
  }
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + 1)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
}

const NAME_NOISE = /(^|\s)(paypal|sumup|paiement|payment|carte|cb|prlv|sepa|achat|purchase|pos|to|from|zahlung|kartenzahlung|lastschrift)(?=\s|$)/gi

/**
 * A short name from the bank's description: "PAYPAL *SPOTIFY" → "Spotify", "Sfr Paiement Cb" → "Sfr",
 * "Carte 12/09 BOCAZUR CANNES" → "Bocazur Cannes", "apple.com/bill" → "Apple",
 * "To France Properties" → "France Properties", "KAUFLAND MAGDEBURG SUD, MAGDEBURG DE Karte…" → "Kaufland Magdeburg Sud"
 */
export function prettyName(label, key) {
  let s = String(label || '').replace(/\b\d{1,2}[./]\d{1,2}([./]\d{2,4})?\b/g, ' ') // dates: "Carte 12/09 …\
  s = s.split(/[|,(/]/)[0]
  s = s.replace(/\s*[*#/]\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]{3,}.*$/i, '') // reference codes: "SCOR/57363A"
  s = s.replace(/^.*?\*\s*(?=\p{L})/u, '') // "GOOGLE *YouTube", "SQ *COFFEE SHOP": the shop comes after *
  s = s.replace(/\s+\S*\d{4,}.*$/, '') // account and card numbers and whatever follows
  s = s.replace(/\.(de|com|fr|net|org|eu|ua)\b/gi, '')
  s = s.replace(NAME_NOISE, ' ').replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, ' ').trim()
  s = s.replace(/\s+\d[\d\s./-]*$/, '').split(' ').slice(0, 4).join(' ')
  if (s && s === s.toUpperCase() && /\p{L}/u.test(s)) s = s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())
  if (/^\p{Ll}/u.test(s)) s = s[0].toUpperCase() + s.slice(1)
  if (!s && key) s = key.replace(/(^|\s)\S/g, c => c.toUpperCase())
  return s.slice(0, 40) || 'Підписка'
}

/** The groups of charges that look like subscriptions (pure: easy to test) */
export function findSubscriptions(rows, now = new Date()) {
  const byKey = new Map()
  for (const r of rows) {
    if (!r.mkey) continue
    const list = byKey.get(r.mkey) || []
    list.push({ ...r, abs: Math.abs(Number(r.amount)), date: new Date(r.created_at) })
    byKey.set(r.mkey, list)
  }
  const out = []
  for (const [key, list] of byKey) {
    const all = list.sort((a, b) => a.date - b.date)
    if (all.length < 2) continue
    const used = new Set()
    // Earliest first: when the price changed, the older run takes the newer charges along
    const clusters = clusterByAmount(all).sort((a, b) => a[0].date - b[0].date)
    for (const cluster of clusters) {
      const items = cluster.filter(c => !used.has(c.id))
      const kind = classifyCharges(items, all)
      if (!kind) continue
      const run = kind.run
      for (const e of run) for (const c of e.items) used.add(c.id)
      const p = PERIODS[kind.frequency]
      extendRun(run, all, used, p)

      const lastEvent = run[run.length - 1]
      const charges = run.flatMap(e => e.items)
      const latest = lastEvent.items[lastEvent.items.length - 1]
      const next = nextCharge(lastEvent.date, kind.frequency)
      const catCounts = new Map()
      for (const c of charges) {
        if (c.category && !/sync$/i.test(c.category)) catCounts.set(c.category, (catCounts.get(c.category) || 0) + 1)
      }
      out.push({
        key,
        name: prettyName(latest.label, key),
        amount: Math.round(median(lastEvent.items.map(c => c.abs)) * 100) / 100,
        frequency: kind.frequency,
        perPeriod: lastEvent.items.length,
        last: lastEvent.date,
        next,
        active: now.getTime() <= next.getTime() + p.grace * DAY,
        cardId: latest.card_id,
        category: [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        ids: charges.map(c => c.id),
        linkedTo: charges.map(c => c.subscription_id || null),
      })
    }
  }
  return out
}

/**
 * Finds the user's subscriptions in their bank charges of the last ~13 months, keeps the list in
 * `subscriptions` (source 'detected'; ones the user hid stay hidden) and links each charge to its
 * subscription, so the app can show them. Never creates transactions.
 */
export async function detectSubscriptions(supabase, userId) {
  const since = new Date(Date.now() - 400 * DAY).toISOString()
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.rpc('subscription_candidates', { p_user_id: userId, p_since: since }).range(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  const found = findSubscriptions(rows)

  const [{ data: subs, error: subsError }, { data: cards }] = await Promise.all([
    supabase.from('subscriptions').select('id, name, amount, category, merchant_key, frequency, source, hidden, is_active').eq('user_id', userId),
    supabase.from('cards').select('id, currency').eq('user_id', userId),
  ])
  if (subsError) throw subsError
  const existing = (subs || []).filter(s => s.source === 'detected')
  // Bank charges that hand-made subscriptions from before took: they belong to what the bank shows now
  const oldManual = new Set((subs || []).filter(s => s.source !== 'detected' && !s.is_active).map(s => s.id))
  const currencyOf = id => (cards || []).find(c => c.id === id)?.currency || null
  const seen = new Set()
  let active = 0

  for (const f of found) {
    const free = s => !seen.has(s.id) && s.merchant_key === f.key
    const match =
      existing.find(s => free(s) && f.linkedTo.includes(s.id)) ||
      existing.find(s => free(s) && s.frequency === f.frequency && Math.abs(Number(s.amount) - f.amount) <= Math.max(Number(s.amount), f.amount) * 0.25)
    if (match) seen.add(match.id)
    if (match?.hidden) continue
    const payload = {
      user_id: userId,
      name: match?.name || f.name,
      amount: f.amount,
      frequency: f.frequency,
      charges_per_period: f.perPeriod,
      day_of_month: f.frequency === 'monthly' ? f.last.getUTCDate() : null,
      day_of_week: f.frequency === 'weekly' ? ((f.last.getUTCDay() + 6) % 7) + 1 : null,
      is_expense: true,
      is_active: f.active,
      last_executed_at: f.last.toISOString(),
      next_execution_at: f.next.toISOString(),
      card_id: f.cardId,
      currency: currencyOf(f.cardId),
      category: match?.category || f.category,
      merchant_key: f.key,
      source: 'detected',
      updated_at: new Date().toISOString(),
    }
    let id = match?.id
    if (id) {
      const { error } = await supabase.from('subscriptions').update(payload).eq('id', id)
      if (error) throw error
    } else {
      const { data, error } = await supabase.from('subscriptions').insert([payload]).select('id').single()
      if (error) throw error
      id = data.id
    }
    if (f.active) active++
    const toLink = f.ids.filter((_, i) => !f.linkedTo[i] || oldManual.has(f.linkedTo[i]))
    if (toLink.length > 0) {
      const { error } = await supabase.from('transactions').update({ subscription_id: id }).in('id', toLink)
      if (error) throw error
    }
  }

  // Found before but not any more (no charges in ~13 months): not active
  const gone = existing.filter(s => !seen.has(s.id) && s.is_active).map(s => s.id)
  if (gone.length > 0) await supabase.from('subscriptions').update({ is_active: false }).in('id', gone)

  await patchPreferences(supabase, userId, 'insights', { subscriptionsDetectedAt: new Date().toISOString() })
  return { found: found.length, active }
}

/** Runs the subscription finder unless it ran recently */
export async function detectSubscriptionsIfDue(supabase, userId, force = false) {
  if (!force) {
    const prefs = await readPreferences(supabase, userId)
    const last = Date.parse(prefs.insights?.subscriptionsDetectedAt || '')
    if (last && Date.now() - last < DETECT_EVERY_MS) return null
  }
  return detectSubscriptions(supabase, userId)
}

/**
 * After a bank sync: categorize what came in (`imported` — anything new or changed), look for
 * subscriptions now and then. Never throws: a sync never fails because of this.
 */
export async function afterBankSync(supabase, userId, { imported = true } = {}) {
  if (imported) {
    try {
      await autoCategorize(supabase, userId)
    } catch (e) {
      console.warn('[AutoCategories] failed:', e.message)
    }
  }
  try {
    await detectSubscriptionsIfDue(supabase, userId)
  } catch (e) {
    console.warn('[Subscriptions] detection failed:', e.message)
  }
}

// ---------------------------------------------------------------------------
// The month's report
// ---------------------------------------------------------------------------

// The report's parts, in the order the apps show them
const REPORT_SECTIONS = ['changes', 'overspend', 'good', 'tip']

/**
 * GPT's report, structured so the apps can lay it out: a one-line summary and short points under
 * «Що змінилось», «Де перевитрата», «Що вийшло добре», «Порада». Kept in monthly_reports.report as
 * JSON text ({ v: 2, summary, sections }); older reports there are plain text.
 */
export async function writeMonthlyReport(month, currency, stats) {
  const system = `Ти — фінансовий помічник у застосунку MyWallet. Тобі дають підсумки місяця користувача (суми в ${currency}).
Напиши короткий структурований звіт українською, звертаючись на «ти», дружньо й по суті.
Поверни ТІЛЬКИ JSON:
{
  "summary": "<одне коротке речення — головне про місяць>",
  "sections": [
    {"type": "changes", "points": ["..."]},
    {"type": "overspend", "points": ["..."]},
    {"type": "good", "points": ["..."]},
    {"type": "tip", "points": ["..."]}
  ]
}
- changes — що змінилось порівняно з попереднім місяцем: доходи, витрати, помітні категорії (2–3 пункти);
- overspend — де перевитрата або що виросло найбільше (1–2 пункти; якщо нічого не виросло — пропусти розділ);
- good — що вийшло добре, наприклад категорія зменшилась (0–2 пункти; нічого доброго — пропусти розділ);
- tip — рівно одна конкретна порада на наступний місяць.
Кожен пункт — одне коротке речення (до 110 символів) з цифрами. Без привітань і вигаданих фактів — лише з наданих цифр.
Суми округлюй і пиши з валютою. Якщо є поле partial — місяць ще триває: порівнюй обережно, бо це лише частина місяця.
Не вгадуй рід: без дієслів минулого часу про людину («ти витратив») — пиши «витрати зросли», «на кафе пішло».`
  const parsed = await openaiJson(system, JSON.stringify({ month, currency, ...stats }))
  const summary = String(parsed?.summary || '').trim().slice(0, 200)
  const sections = REPORT_SECTIONS.map(type => {
    const found = (Array.isArray(parsed?.sections) ? parsed.sections : []).find(s => s?.type === type)
    const points = (Array.isArray(found?.points) ? found.points : [])
      .map(p => String(p || '').trim().slice(0, 220))
      .filter(Boolean)
      .slice(0, type === 'tip' ? 1 : 3)
    return { type, points }
  }).filter(s => s.points.length > 0)
  if (!summary && sections.length === 0) throw new Error('empty report')
  return JSON.stringify({ v: 2, summary, sections })
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
export function registerInsights(app, { supabase, getUserFromToken }) {
  // POST /api/auto-categorize { gpt? } — sort every waiting bank import now («Розкласти закріплені»);
  // gpt: false — rules only, right after the user categorized one (the same merchant's others follow)
  app.post('/api/auto-categorize', getUserFromToken, async (req, res) => {
    try {
      const useGpt = req.body?.gpt !== false
      res.json({ success: true, ...(await autoCategorize(supabase, req.user_id, null, { useGpt })) })
    } catch (e) {
      console.error('[AutoCategories] route error:', e.message)
      res.status(500).json({ success: false, error: e.message })
    }
  })

  // POST /api/category-rules/rebuild — rules from the user's history again (Налаштування)
  app.post('/api/category-rules/rebuild', getUserFromToken, async (req, res) => {
    try {
      const { data, error } = await supabase.rpc('rebuild_category_rules', { p_user_id: req.user_id })
      if (error) throw error
      res.json({ success: true, rules: data })
    } catch (e) {
      res.status(500).json({ success: false, error: e.message })
    }
  })

  // POST /api/subscriptions/detect { force? } — look for subscriptions in bank charges
  app.post('/api/subscriptions/detect', getUserFromToken, async (req, res) => {
    try {
      const result = await detectSubscriptionsIfDue(supabase, req.user_id, !!req.body?.force)
      res.json({ success: true, ran: !!result, ...(result || {}) })
    } catch (e) {
      console.error('[Subscriptions] detect route error:', e.message)
      res.status(500).json({ success: false, error: e.message })
    }
  })

  // POST /api/insights/monthly-report { month: 'YYYY-MM', currency, stats, force? }
  // Stats come from the app (the same numbers it shows); the text is kept per month.
  app.post('/api/insights/monthly-report', getUserFromToken, async (req, res) => {
    try {
      const month = String(req.body?.month || '')
      if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' })
      const currency = String(req.body?.currency || 'UAH').slice(0, 5)
      const stats = req.body?.stats
      if (!stats || typeof stats !== 'object' || JSON.stringify(stats).length > 12000) {
        return res.status(400).json({ error: 'stats missing or too large' })
      }
      if (!req.body?.force) {
        const { data: saved } = await supabase
          .from('monthly_reports')
          .select('report, created_at, currency')
          .eq('user_id', req.user_id)
          .eq('month', month)
          .maybeSingle()
        if (saved) return res.json({ success: true, ...saved, cached: true })
      }
      const report = await writeMonthlyReport(month, currency, stats)
      const row = { user_id: req.user_id, month, currency, report, stats, created_at: new Date().toISOString() }
      const { error } = await supabase.from('monthly_reports').upsert(row, { onConflict: 'user_id,month' })
      if (error) throw error
      res.json({ success: true, report, created_at: row.created_at, currency })
    } catch (e) {
      console.error('[MonthlyReport] error:', e.message)
      res.status(500).json({ success: false, error: 'Не вдалося написати звіт — спробуйте пізніше' })
    }
  })
}
