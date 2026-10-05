import { apiFetch } from '../lib/apiFetch'
import { supabase } from '../lib/supabase'
import { Transaction, updateTransactionsBulk } from './transactions'

/** Requests that may ask GPT: longer than apiFetch's default timeout */
async function slowPost<T>(endpoint: string, body: object, ms = 45000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await apiFetch<T>(endpoint, { method: 'POST', body: JSON.stringify(body), signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Auto-categories
// ---------------------------------------------------------------------------

/** Settings → «Автокатегорії»: preferences.autoCategories.mode (same as the web) */
export const AUTO_CATEGORIES_MODE_PATH = 'autoCategories.mode'
export type AutoCategoriesMode = 'auto' | 'suggest' | 'off'

export interface AutoCategorizeResult {
  applied: number
  suggested: number
  mode: AutoCategoriesMode
}

/**
 * Sorts the waiting bank imports by the user's rules. `gpt: false` — rules only (quick, e.g. right
 * after the user categorized one: the others from that merchant follow).
 */
export async function autoCategorize({ gpt = true }: { gpt?: boolean } = {}): Promise<AutoCategorizeResult> {
  return slowPost('/api/auto-categorize', { gpt })
}

/** Accepts the suggested categories: from now on they're the user's rules too */
export async function acceptSuggestions(txs: Transaction[]): Promise<number> {
  const byCategory = new Map<string, string[]>()
  for (const t of txs) {
    if (!t.suggested_category) continue
    byCategory.set(t.suggested_category, [...(byCategory.get(t.suggested_category) || []), t.id])
  }
  for (const [category, ids] of byCategory) await updateTransactionsBulk(ids, { category })
  return [...byCategory.values()].reduce((n, ids) => n + ids.length, 0)
}

export interface CategoryRule {
  id: string
  merchant_key: string
  category: string | null
  source: 'learned' | 'history' | 'gpt'
  samples: number
  confidence: number
  hits: number
  example: string | null
  updated_at: string
}

/** The rules the app sorts by (merchants with a category; GPT's «don't know» ones left out) */
export async function listCategoryRules(): Promise<CategoryRule[]> {
  const { data, error } = await supabase
    .from('category_rules')
    .select('id, merchant_key, category, source, samples, confidence, hits, example, updated_at')
    .not('category', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return (data || []) as CategoryRule[]
}

export async function deleteCategoryRule(id: string): Promise<void> {
  const { error } = await supabase.from('category_rules').delete().eq('id', id)
  if (error) throw error
}

/** Whether a rule sets the category by itself (else it only suggests) — same as the database */
export const ruleIsSure = (r: CategoryRule) =>
  r.source === 'learned' || (r.source === 'history' && r.samples >= 3 && r.confidence >= 0.8)

// ---------------------------------------------------------------------------
// Subscriptions found in bank charges
// ---------------------------------------------------------------------------

export interface DetectedSubscription {
  id: string
  name: string
  amount: number
  currency?: string | null
  frequency: 'weekly' | 'monthly' | 'yearly'
  charges_per_period?: number
  is_active: boolean
  hidden?: boolean
  source: 'detected' | 'manual'
  category?: string | null
  card_id?: string | null
  last_executed_at?: string | null
  next_execution_at?: string | null
  created_at?: string
}

export async function listSubscriptions(): Promise<DetectedSubscription[]> {
  return apiFetch<DetectedSubscription[]>('/api/subscriptions')
}

/** Looks for subscriptions in the bank charges (the server skips it if it did it recently) */
export async function detectSubscriptions(force = false): Promise<{ ran: boolean; found?: number; active?: number }> {
  return slowPost('/api/subscriptions/detect', { force }, 30000)
}

export async function updateSubscription(id: string, patch: Partial<Pick<DetectedSubscription, 'name' | 'hidden'>>): Promise<void> {
  await apiFetch(`/api/subscriptions/${id}`, { method: 'PUT', body: JSON.stringify(patch) })
}

/** Every charge of a subscription, newest first */
export async function listSubscriptionCharges(id: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('subscription_id', id)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data || []) as Transaction[]
}

/** What one subscription costs a month (weekly ×52/12, yearly /12) */
export function monthlyCost(s: DetectedSubscription): number {
  const per = Number(s.amount) * Math.max(1, s.charges_per_period || 1)
  return s.frequency === 'weekly' ? (per * 52) / 12 : s.frequency === 'yearly' ? per / 12 : per
}

// ---------------------------------------------------------------------------
// The month's report
// ---------------------------------------------------------------------------

export interface MonthlyReportStats {
  income: number
  expense: number
  previous: { income: number; expense: number }
  topCategories: { name: string; amount: number; previous: number }[]
  biggest: { title: string; amount: number; date: string }[]
  transactions: number
  /** The month isn't over yet, e.g. '5 з 31 днів' */
  partial?: string
}

export interface MonthlyReport {
  report: string
  created_at: string
  currency: string
  cached?: boolean
}

/** GPT's few sentences about the month; kept on the server, `force` writes it again */
export async function getMonthlyReport(month: string, currency: string, stats: MonthlyReportStats, force = false): Promise<MonthlyReport> {
  return slowPost('/api/insights/monthly-report', { month, currency, stats, force }, 40000)
}

/** A report written before (without asking GPT) */
export async function readMonthlyReport(month: string): Promise<MonthlyReport | null> {
  const { data } = await supabase.from('monthly_reports').select('report, created_at, currency').eq('month', month).maybeSingle()
  return (data as MonthlyReport) ?? null
}
