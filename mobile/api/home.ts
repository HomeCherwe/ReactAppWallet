import { apiFetch } from '../lib/apiFetch'
import { Card } from './cards'
import { UserPreferences } from './preferences'
import { MonthStat, statsFromBuckets } from './transactions'
import { emptyTotals, TotalsData } from './totals'
import { getBucket, kindOutOfStats } from '../utils/accountKind'
import { convertCurrency, RatesMap } from '../utils/currency'
import { primeCardsCache, primeSumByCardCache } from '../utils/dataCache'
import { isCategoryExcluded } from '../utils/statsCategories'

// Home in one request (GET /api/home): the accounts, each account's sum, cash, the preferences and
// the last months already added up per account and category. It replaces ~10 requests and the
// download of every transaction of 6 months; the rules below are the ones Home always used.

export const HOME_MONTHS = 6

/** One month × account × category: income and spending in the account's currency */
export interface MonthCell {
  m: string
  c: string | null
  k: string | null
  i: number
  e: number
}

export interface HomeData {
  v: number
  at: number
  cards: Card[]
  sums: Record<string, number>
  cash: number
  preferences: UserPreferences
  months: { start: string; end: string; tz: string; rows: MonthCell[] }
}

export async function fetchHome(): Promise<HomeData> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - HOME_MONTHS + 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  let tz = ''
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {}
  const p = new URLSearchParams({ start: start.toISOString(), end: end.toISOString(), ...(tz && { tz }) })
  const data = await apiFetch<HomeData>(`/api/home?${p}`)
  // Other screens read the same cards and sums: no second download
  primeCardsCache(data.cards)
  primeSumByCardCache(data.sums)
  return data
}

/** Balance per group and currency — what fetchTotalsByBucket worked out with three more requests */
export function totalsFrom(cards: Card[], sums: Record<string, number>, cash: number): TotalsData {
  const out = emptyTotals()
  for (const card of cards) {
    if (card.bank_exclude_from_stats) continue
    const bucket = getBucket(card)
    const currency = (card.currency || 'UAH').toUpperCase()
    const total = Number(card.initial_balance || 0) + Number(sums[card.id] || 0)
    if (Math.abs(total) > 0.001) out[bucket][currency] = (out[bucket][currency] || 0) + total
  }
  if (Math.abs(cash) > 0.001) out.cash.UAH = (out.cash.UAH || 0) + cash
  return out
}

/**
 * Home's month cards from the added-up months, by the rules getRecentMonthsStats applies to each
 * transaction: accounts switched off or kept as savings / investments and categories left out of
 * statistics don't count; amounts are shown in the main currency.
 */
export function monthStatsFrom(
  rows: MonthCell[],
  cards: Card[],
  rates: RatesMap | null,
  targetCurrency: string,
  excludeCardIds: string[]
): MonthStat[] {
  const cardMap = new Map(cards.map(c => [c.id, { outOfStats: kindOutOfStats(c), currency: (c.currency || 'UAH').toUpperCase() }]))
  const excluded = new Set(excludeCardIds)
  const buckets = new Map<string, { income: number; expense: number }>()
  for (const r of rows) {
    if (r.c && excluded.has(r.c)) continue
    const info = (r.c ? cardMap.get(r.c) : null) || { outOfStats: false, currency: 'UAH' }
    if (info.outOfStats || isCategoryExcluded(r.k)) continue
    const convert = (v: number) => (rates && info.currency !== targetCurrency ? convertCurrency(v, info.currency, targetCurrency, rates) : v)
    const b = buckets.get(r.m) || { income: 0, expense: 0 }
    b.income += convert(Number(r.i) || 0)
    b.expense += Math.abs(convert(Number(r.e) || 0))
    buckets.set(r.m, b)
  }
  return statsFromBuckets(buckets, HOME_MONTHS)
}
