import { supabase } from '../lib/supabase'
import { apiFetch } from '../utils.jsx'
import { invalidateSumByCardCache } from '../utils/dataCache'

// Same as the iPhone app (mobile/api/insights.ts): auto-categories, subscriptions found in bank
// charges, the month's report.

// These may ask GPT: more time than apiFetch's default 15 s
const post = (endpoint, body) => apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body), timeoutMs: 45000 })

// ---- Auto-categories ----

/** Налаштування → «Автокатегорії»: preferences.autoCategories.mode */
export const AUTO_CATEGORIES_MODE_PATH = 'autoCategories.mode'

/** Sorts the waiting bank imports by the user's rules; `gpt: false` — rules only (quick) */
export function autoCategorize({ gpt = true } = {}) {
  return post('/api/auto-categorize', { gpt })
}

/** Accepts the suggested categories: from now on they're the user's rules too */
export async function acceptSuggestions(txs) {
  const byCategory = new Map()
  for (const t of txs) {
    if (!t.suggested_category) continue
    byCategory.set(t.suggested_category, [...(byCategory.get(t.suggested_category) || []), t.id])
  }
  for (const [category, ids] of byCategory) {
    const { error } = await supabase.from('transactions').update({ category }).in('id', ids)
    if (error) throw error
  }
  invalidateSumByCardCache()
  return [...byCategory.values()].reduce((n, ids) => n + ids.length, 0)
}

export async function listCategoryRules() {
  const { data, error } = await supabase
    .from('category_rules')
    .select('id, merchant_key, category, source, samples, confidence, hits, example, updated_at')
    .not('category', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return data || []
}

export async function deleteCategoryRule(id) {
  const { error } = await supabase.from('category_rules').delete().eq('id', id)
  if (error) throw error
}

/** Whether a rule sets the category by itself (else it only suggests) — same as the database */
export const ruleIsSure = r => r.source === 'learned' || (r.source === 'history' && r.samples >= 3 && r.confidence >= 0.8)

// ---- Subscriptions found in bank charges ----

export const listSubscriptions = () => apiFetch('/api/subscriptions')

/** Looks for subscriptions in the bank charges (the server skips it if it did it recently) */
export const detectSubscriptions = (force = false) => post('/api/subscriptions/detect', { force })

export const updateSubscription = (id, patch) =>
  apiFetch(`/api/subscriptions/${id}`, { method: 'PUT', body: JSON.stringify(patch) })

export const deleteSubscription = id => apiFetch(`/api/subscriptions/${id}`, { method: 'DELETE' })

/** What one subscription costs a month (weekly ×52/12, yearly /12) */
export function monthlyCost(s) {
  const per = Number(s.amount) * Math.max(1, s.charges_per_period || 1)
  return s.frequency === 'weekly' ? (per * 52) / 12 : s.frequency === 'yearly' ? per / 12 : per
}

// ---- The month's report ----

/** GPT's few sentences about the month; kept on the server, `force` writes it again */
export const getMonthlyReport = (month, currency, stats, force = false) =>
  post('/api/insights/monthly-report', { month, currency, stats, force })

/** A report written before (without asking GPT) */
export async function readMonthlyReport(month) {
  const { data } = await supabase.from('monthly_reports').select('report, created_at, currency').eq('month', month).maybeSingle()
  return data ?? null
}

/**
 * The report as parts to lay out (same as the iPhone app). New reports are JSON
 * ({ v: 2, summary, sections }); older ones are plain text — then the first sentence is the summary
 * and the last one (the tip) its own part.
 */
export function parseReport(text) {
  try {
    const j = JSON.parse(text)
    if (j?.v === 2) return { summary: String(j.summary || ''), sections: Array.isArray(j.sections) ? j.sections : [] }
  } catch {}
  const sentences = String(text || '')
    .split(/(?<=[.!?…])\s+(?=[A-ZА-ЯІЇЄҐ«"])/u)
    .map(s => s.trim())
    .filter(Boolean)
  const [summary = '', ...rest] = sentences
  const sections = []
  if (rest.length > 1) sections.push({ type: 'changes', points: rest.slice(0, -1) })
  if (rest.length > 0) sections.push({ type: rest.length > 1 ? 'tip' : 'changes', points: rest.slice(-1) })
  return { summary, sections }
}
