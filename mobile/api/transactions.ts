import { apiFetch } from '../lib/apiFetch'
import { supabase } from '../lib/supabase'
import { getCachedSumByCard, invalidateSumByCardCache } from '../utils/dataCache'
import { isSyncCategory } from '../utils/cardExclusion'

export interface Transaction {
  id: string
  amount: number
  amount_stat?: number | null
  currency?: string
  category?: string
  note?: string
  created_at: string
  card_id?: string | null
  card?: string
  is_expense?: boolean
  is_debt?: boolean
  refund_for?: string | null
  archives?: boolean
  subscription_id?: string | null
  exclude_from_stats?: boolean
  split_from?: string | null
  merchant_name?: string | null
  merchant_city?: string | null
  is_transfer?: boolean
}

export interface ListTransactionsParams {
  from?: number
  to?: number
  search?: string
  transactionType?: 'all' | 'expense' | 'income'
  category?: string
  categoryIn?: string[]
  hasPinnedTag?: boolean
  excludeUsdt?: boolean
  isDebt?: boolean
  cardId?: string
  startDate?: string
  endDate?: string
  archived?: boolean
}

export async function listTransactions(params: ListTransactionsParams = {}): Promise<Transaction[]> {
  const {
    from = 0, to = 49, search = '', transactionType = 'all',
    category = '', categoryIn = [], hasPinnedTag = false,
    excludeUsdt = false, isDebt, cardId, startDate, endDate, archived
  } = params

  try {
    const p = new URLSearchParams({
      from: from.toString(),
      to: to.toString(),
      ...(search && { search }),
      ...(transactionType && transactionType !== 'all' && { transaction_type: transactionType }),
      ...(category && { category }),
      ...(categoryIn.length > 0 && { category_in: categoryIn.join(',') }),
      ...(hasPinnedTag && { has_pinned_tag: 'true' }),
      ...(excludeUsdt && { exclude_usdt: 'true' }),
      ...(typeof isDebt === 'boolean' ? { is_debt: isDebt ? 'true' : 'false' } : {}),
      ...(cardId && { card_id: cardId }),
      ...(startDate && { start_date: startDate }),
      ...(endDate && { end_date: endDate }),
      ...(archived && { archived: 'true' }),
    })
    return await apiFetch<Transaction[]>(`/api/transactions?${p}`)
  } catch (err) {
    console.warn('Backend /api/transactions unreachable, fallback to Supabase:', err)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    let q = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)

    if (archived) {
      q = q.eq('archives', true)
    } else {
      q = q.or('archives.is.null,archives.eq.false')
    }

    if (startDate) q = q.gte('created_at', startDate)
    if (endDate) q = q.lte('created_at', endDate.includes('T') ? endDate : `${endDate}T23:59:59.999Z`)
    if (cardId) q = q.eq('card_id', cardId)
    if (category) q = q.eq('category', category)
    if (categoryIn.length > 0) q = q.in('category', categoryIn)
    if (typeof isDebt === 'boolean') q = q.eq('is_debt', isDebt)
    if (search) q = q.ilike('note', `%${search}%`)

    q = q.order('created_at', { ascending: false }).range(from, to)
    const { data, error } = await q
    if (error) {
      console.warn('Supabase direct query failed:', error)
      return []
    }
    return (data || []) as Transaction[]
  }
}

export interface FeedParams {
  from: number
  to: number
  transactionType?: 'all' | 'expense' | 'income'
  /** Cards whose transactions are hidden (excluded from statistics) */
  excludeCardIds?: string[]
}

/**
 * Transactions for the home feed, filtered in the query itself (so pagination stays exact):
 * no archived ones, no transfers, nothing from excluded cards.
 */
export async function listFeedTransactions({
  from,
  to,
  transactionType = 'all',
  excludeCardIds = [],
}: FeedParams): Promise<Transaction[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  let q = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .not('archives', 'is', true)
    .not('is_transfer', 'is', true)

  if (excludeCardIds.length > 0) {
    // `not in` alone would also drop transactions without a card (NULL), so keep those explicitly
    q = q.or(`card_id.is.null,card_id.not.in.(${excludeCardIds.join(',')})`)
  }
  if (transactionType === 'expense') q = q.lt('amount', 0)
  if (transactionType === 'income') q = q.gt('amount', 0)

  const { data, error } = await q.order('created_at', { ascending: false }).range(from, to)
  if (error) throw error
  return (data || []) as Transaction[]
}

/**
 * Pinned transactions (note tag "[pinned]" or a pinned category), newest first.
 * Two plain queries merged client-side — avoids quoting category names inside an `or()` filter.
 */
export async function listPinnedTransactions({
  pinnedCategories = [],
  excludeCardIds = [],
}: { pinnedCategories?: string[]; excludeCardIds?: string[] }): Promise<Transaction[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const base = () => {
    let q = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .not('archives', 'is', true)
    if (excludeCardIds.length > 0) {
      q = q.or(`card_id.is.null,card_id.not.in.(${excludeCardIds.join(',')})`)
    }
    return q
  }

  const requests = [base().ilike('note', '%[pinned]%').order('created_at', { ascending: false }).limit(100)]
  const cats = pinnedCategories.filter(c => c && c.trim())
  if (cats.length > 0) {
    requests.push(base().in('category', cats).order('created_at', { ascending: false }).limit(100))
  }

  const results = await Promise.all(requests)
  const byId = new Map<string, Transaction>()
  for (const { data, error } of results) {
    if (error) throw error
    for (const tx of (data || []) as Transaction[]) byId.set(tx.id, tx)
  }
  return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function listArchivedTransactions(params: Omit<ListTransactionsParams, 'archived'> = {}): Promise<Transaction[]> {
  return listTransactions({ ...params, archived: true, from: 0, to: 9999 })
}

export async function getTransaction(id: string): Promise<Transaction> {
  try {
    return await apiFetch<Transaction>(`/api/transactions/${id}`)
  } catch {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data as Transaction
  }
}

export async function createTransaction(payload: Partial<Transaction>): Promise<Transaction> {
  try {
    const data = await apiFetch<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    invalidateSumByCardCache()
    return data
  } catch (err) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Користувач не авторизований')
    const { data, error } = await supabase
      .from('transactions')
      .insert([{ ...payload, user_id: user.id }])
      .select()
      .single()
    if (error) throw error
    invalidateSumByCardCache()
    return data as Transaction
  }
}

export async function updateTransaction(id: string, payload: Partial<Transaction>): Promise<void> {
  try {
    await apiFetch(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  } catch {
    const { error } = await supabase
      .from('transactions')
      .update(payload)
      .eq('id', id)
    if (error) throw error
  }
  invalidateSumByCardCache()
}

export async function deleteTransaction(id: string): Promise<void> {
  try {
    await apiFetch(`/api/transactions/${id}`, { method: 'DELETE' })
  } catch {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
  invalidateSumByCardCache()
}

export async function deleteTransactions(ids: string[]): Promise<void> {
  try {
    await apiFetch('/api/transactions/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
  } catch {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .in('id', ids)
    if (error) throw error
  }
  invalidateSumByCardCache()
}

export async function archiveTransaction(id: string): Promise<void> {
  try {
    await apiFetch(`/api/transactions/${id}/archive`, { method: 'PATCH' })
  } catch {
    const { error } = await supabase
      .from('transactions')
      .update({ archives: true })
      .eq('id', id)
    if (error) throw error
  }
  invalidateSumByCardCache()
}

export async function unarchiveTransaction(id: string): Promise<void> {
  try {
    await apiFetch(`/api/transactions/${id}/unarchive`, { method: 'PATCH' })
  } catch {
    const { error } = await supabase
      .from('transactions')
      .update({ archives: false })
      .eq('id', id)
    if (error) throw error
  }
  invalidateSumByCardCache()
}

async function _sumByCardInternal(): Promise<Record<string, any>> {
  try {
    return await apiFetch<Record<string, any>>('/api/transactions/sum-by-card') || {}
  } catch {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return {}
      const { data, error } = await supabase.rpc('sum_tx_by_card', { user_id_param: user.id })
      if (!error && data) {
        const map: Record<string, number> = {}
        data.forEach((r: any) => { map[r.card_id] = Number(r.total || 0) })
        return map
      }
      const { data: txs } = await supabase
        .from('transactions')
        .select('card_id, amount')
        .eq('user_id', user.id)
        .or('archives.is.null,archives.eq.false')
      const map: Record<string, number> = {}
      ;(txs || []).forEach((t: any) => {
        if (t.card_id) {
          map[t.card_id] = (map[t.card_id] || 0) + Number(t.amount || 0)
        }
      })
      return map
    } catch {
      return {}
    }
  }
}

export async function sumTransactionsByCard(): Promise<Record<string, any>> {
  return getCachedSumByCard(_sumByCardInternal)
}

// Categories cache
let categoriesCache: string[] | null = null
let categoriesCacheTs = 0
const CATEGORIES_TTL = 60000

export async function getTransactionCategories(): Promise<string[]> {
  const now = Date.now()
  if (categoriesCache && (now - categoriesCacheTs) < CATEGORIES_TTL) return categoriesCache
  try {
    const cats = await apiFetch<string[]>('/api/transactions/categories') || []
    categoriesCache = cats
    categoriesCacheTs = now
    return cats
  } catch {
    return [
      'Їжа та продукти',
      'Кафе та ресторани',
      'Здоров\'я та краса',
      'Авто та транспорт',
      'Одяг та взуття',
      'Комунальні послуги',
      'Зв\'язок та інтернет',
      'Дім та затишок',
      'Інше'
    ]
  }
}

export interface RecentUsage {
  /** Expense categories, most recently used first */
  expense: string[]
  /** Income categories, most recently used first */
  income: string[]
  /** Card ids, most recently used first */
  cardIds: string[]
}

type UsageRow = { category: string | null; amount: number; card_id: string | null; is_transfer: boolean | null }
let recentUsageCache: { rows: UsageRow[]; ts: number } | null = null

/**
 * The user's own categories (split by expense/income) and cards, ordered by last use.
 * Skips transfers, excluded cards and service "… Sync" categories.
 * Reads Supabase directly (one light query), so it works even when the backend is down.
 */
export async function getRecentUsage(excludeCardIds: string[] = []): Promise<RecentUsage> {
  if (!recentUsageCache || Date.now() - recentUsageCache.ts >= CATEGORIES_TTL) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { expense: [], income: [], cardIds: [] }

    const { data, error } = await supabase
      .from('transactions')
      .select('category, amount, card_id, is_transfer')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3000)
    if (error) throw error
    recentUsageCache = { rows: (data || []) as UsageRow[], ts: Date.now() }
  }

  const excluded = new Set(excludeCardIds)
  // Rows are newest-first, so first-seen order == most-recently-used order
  const expense = new Set<string>()
  const income = new Set<string>()
  const cardIds = new Set<string>()
  for (const row of recentUsageCache.rows) {
    if (row.is_transfer || (row.card_id && excluded.has(row.card_id))) continue
    const cat = (row.category || '').trim()
    if (cat && !isSyncCategory(cat)) (Number(row.amount) > 0 ? income : expense).add(cat)
    if (row.card_id) cardIds.add(row.card_id)
  }
  return { expense: [...expense], income: [...income], cardIds: [...cardIds] }
}

export function invalidateCategoriesCache() {
  categoriesCache = null
  categoriesCacheTs = 0
  recentUsageCache = null
}

// Debt parties
let debtPartiesCache: string[] | null = null
let debtPartiesCacheTs = 0
const DEBT_TTL = 60000

export async function getDebtParties(): Promise<string[]> {
  const now = Date.now()
  if (debtPartiesCache && (now - debtPartiesCacheTs) < DEBT_TTL) return debtPartiesCache
  try {
    const parties = await apiFetch<string[]>('/api/transactions/debt-parties') || []
    debtPartiesCache = parties
    debtPartiesCacheTs = now
    return parties
  } catch { return [] }
}

export function invalidateDebtPartiesCache() {
  debtPartiesCache = null
  debtPartiesCacheTs = 0
}

export async function getTransactionsBySubscription(subscriptionId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, amount, created_at, note, category, card, card_id')
    .eq('subscription_id', subscriptionId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Aliases for HomeScreen compatibility
export const listRecentTransactions = (params?: ListTransactionsParams) =>
  listTransactions({ from: 0, to: 49, ...params })

export const getSumByCard = sumTransactionsByCard

export interface MonthStat {
  id: string;
  label: string;
  income: number;
  expense: number;
  incomeDiffPercent: number;
  expenseDiffPercent: number;
}

export async function getRecentMonthsStats(
  targetCurrency: string = "UAH",
  cards: any[] = [],
  rates: any = null,
  numMonths: number = 6,
  excludeUsdt: boolean = false,
  excludeCardIds: string[] = []
): Promise<MonthStat[]> {
  try {
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth() - numMonths + 1, 1)
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const txs = await listTransactions({
      from: 0,
      to: 9999,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      excludeUsdt,
    })

    const cardMap = new Map<string, { isSavings: boolean; isBinance: boolean; currency: string }>()
    ;(cards || []).forEach(c => {
      const bank = String(c.bank || '').toLowerCase()
      const name = String(c.name || '').toLowerCase()
      const isSavings = bank.includes('накопич') || bank.includes('savings')
      const isBinance = bank.includes('binance') || name.includes('binance')
      cardMap.set(c.id, { isSavings, isBinance, currency: (c.currency || 'UAH').toUpperCase() })
    })

    const isExcludedFromStats = (tx: any) => {
      if (!tx) return false
      if (tx.exclude_from_stats === true || tx.exclude_from_stats === 'true' || tx.exclude_from_stats === 1) return true
      if (tx.refund_for) return true
      const note = String(tx.note || '')
      if (note.includes('[refund_for:')) return true
      return false
    }

    const monthBuckets = new Map<string, { income: number; expense: number }>()

    const excludedCards = new Set(excludeCardIds)
    for (const tx of txs) {
      if (tx.archives || tx.is_transfer || isExcludedFromStats(tx)) continue
      if (tx.card_id && excludedCards.has(tx.card_id)) continue

      const cardInfo = (tx.card_id ? cardMap.get(tx.card_id) : null) || {
        isSavings: false,
        isBinance: false,
        currency: 'UAH',
      }
      if (cardInfo.isSavings) continue

      const amt = Number(tx.amount_stat ?? tx.amount ?? 0)
      const txCur = cardInfo.currency

      let convertedAmt = amt
      if (rates && txCur !== targetCurrency) {
        const { convertCurrency } = require('../utils/currency')
        convertedAmt = convertCurrency(amt, txCur, targetCurrency, rates)
      }

      const txDate = new Date(tx.created_at)
      const mKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`

      if (!monthBuckets.has(mKey)) {
        monthBuckets.set(mKey, { income: 0, expense: 0 })
      }

      const b = monthBuckets.get(mKey)!
      if (amt > 0) {
        b.income += convertedAmt
      } else if (amt < 0) {
        b.expense += Math.abs(convertedAmt)
      }
    }

    const result: MonthStat[] = []
    const formatter = new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric' })

    for (let i = 0; i < numMonths; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      
      const stats = monthBuckets.get(mKey) || { income: 0, expense: 0 }
      
      // Calculate diffs with previous month
      const prevD = new Date(now.getFullYear(), now.getMonth() - i - 1, 1)
      const prevMKey = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`
      const prevStats = monthBuckets.get(prevMKey) || { income: 0, expense: 0 }

      let incDiff = 0
      if (prevStats.income > 0) {
        incDiff = ((stats.income - prevStats.income) / prevStats.income) * 100
      } else if (stats.income > 0) {
        incDiff = 100 // From 0 to something is a 100% increase conceptually for UI
      }

      let expDiff = 0
      if (prevStats.expense > 0) {
        expDiff = ((stats.expense - prevStats.expense) / prevStats.expense) * 100
      } else if (stats.expense > 0) {
        expDiff = 100
      }

      // capitalize month name
      let label = formatter.format(d)
      label = label.charAt(0).toUpperCase() + label.slice(1)

      result.push({
        id: mKey,
        label,
        income: stats.income,
        expense: stats.expense,
        incomeDiffPercent: incDiff,
        expenseDiffPercent: expDiff,
      })
    }

    return result
  } catch (err) {
    console.error('getRecentMonthsStats error:', err)
    return []
  }
}
