import { apiFetch } from '../lib/apiFetch'
import { listCards, Card } from './cards'
import { sumTransactionsByCard } from './transactions'
import { supabase } from '../lib/supabase'
import { getBucket } from '../utils/currency'

export interface TotalsBucket {
  [currency: string]: number
}

export interface TotalsData {
  cash: TotalsBucket
  cards: TotalsBucket
  savings: TotalsBucket
}

function emptyOut(): TotalsData {
  return { cash: {}, cards: {}, savings: {} }
}

export async function fetchTotalsByBucket(): Promise<TotalsData> {
  try {
    const cards = await listCards()
    const sumsByCard = await sumTransactionsByCard()

    const out = emptyOut()

    for (const card of cards) {
      if (card.bank_exclude_from_stats) continue

      const bucket = getBucket(card)
      const currency = (card.currency || 'UAH').toUpperCase()
      const initialBalance = Number(card.initial_balance || 0)
      const transactionSum = Number(sumsByCard[card.id] || 0)
      const total = initialBalance + transactionSum

      if (Math.abs(total) > 0.001) {
        out[bucket][currency] = (out[bucket][currency] || 0) + total
      }
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: cashTxs } = await supabase
          .from('transactions')
          .select('amount, archives, card_id')
          .eq('user_id', user.id)
          .is('card_id', null)
          .or('archives.is.null,archives.eq.false')

        if (cashTxs && cashTxs.length > 0) {
          const cashSum = cashTxs.reduce((sum: number, tx: any) => sum + Number(tx.amount || 0), 0)
          if (Math.abs(cashSum) > 0.001) {
            out.cash['UAH'] = (out.cash['UAH'] || 0) + cashSum
          }
        }
      }
    } catch {
      // Ignore cash fallback error
    }

    return out
  } catch (err) {
    console.error('fetchTotalsByBucket fallback error:', err)
    return emptyOut()
  }
}

export async function fetchBalanceHistory(params: {
  bucket?: 'all' | 'cash' | 'cards' | 'savings',
  period?: 'day' | 'week' | 'month' | 'year',
  currency?: string,
  start?: string,
  end?: string
} = {}) {
  try {
    const p = new URLSearchParams()
    if (params.bucket) p.set('bucket', params.bucket)
    if (params.period) p.set('period', params.period)
    if (params.currency) p.set('currency', params.currency)
    if (params.start) p.set('start', params.start)
    if (params.end) p.set('end', params.end)

    const result = await apiFetch<any>(`/api/balance/history?${p}`)
    if (result && result.changes) return result
    throw new Error('apiFetch failed or empty')
  } catch (e) {
    console.warn('fetchBalanceHistory fallback to Supabase')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { changes: [], futureChanges: [] }

      const cards = await listCards()
      const cardMap = new Map(cards.map(c => [c.id, c]))
      const excludedBankIds = new Set(cards.filter(c => c.bank_exclude_from_stats).map(c => c.bank_id))

      const filteredCards = cards.filter(c => {
        if (c.bank_id && excludedBankIds.has(c.bank_id)) return false
        if (params.bucket !== 'all' && params.bucket && getBucket(c) !== params.bucket) return false
        return true
      })
      const cardIds = filteredCards.map(c => c.id)

      const now = new Date()
      let startDateStr = params.start || ''
      const endDateStr = params.end || now.toISOString().slice(0, 10)

      if (!params.start) {
        if (params.period === 'day') {
          const d = new Date(now); d.setDate(d.getDate() - 30); startDateStr = d.toISOString().slice(0, 10)
        } else if (params.period === 'week') {
          const d = new Date(now); d.setDate(d.getDate() - 12 * 7); startDateStr = d.toISOString().slice(0, 10)
        } else if (params.period === 'year') {
          const d = new Date(now); d.setFullYear(d.getFullYear() - 5); startDateStr = `${d.getFullYear()}-01-01`
        } else {
          const d = new Date(now); d.setMonth(d.getMonth() - 12); startDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
        }
      }

      let allTxs: any[] = []
      let offset = 0
      const pageSize = 1000
      while (true) {
        let txQuery = supabase
          .from('transactions')
          .select('id, amount, created_at, card_id, archives, exclude_from_stats')
          .eq('user_id', user.id)
          .or('archives.is.null,archives.eq.false')
          .or('exclude_from_stats.is.null,exclude_from_stats.eq.false')
          .gte('created_at', startDateStr)
          .order('created_at', { ascending: true })
          .range(offset, offset + pageSize - 1)

        if (params.bucket !== 'all' && params.bucket) {
          if (cardIds.length > 0) {
            if (params.bucket === 'cash') {
              txQuery = txQuery.or(`card_id.in.(${cardIds.join(',')}),card_id.is.null`)
            } else {
              txQuery = txQuery.in('card_id', cardIds)
            }
          } else if (params.bucket === 'cash') {
            txQuery = txQuery.is('card_id', null)
          } else {
            break
          }
        }

        const { data: chunk, error } = await txQuery
        if (error) throw error
        if (!chunk || chunk.length === 0) break
        allTxs.push(...chunk)
        if (chunk.length < pageSize) break
        offset += pageSize
      }

      const periodKey = (dateStr: string) => {
        const d = new Date(dateStr)
        if (params.period === 'day') return dateStr.slice(0, 10)
        if (params.period === 'week') {
          const day = d.getDay() === 0 ? 7 : d.getDay()
          const monday = new Date(d)
          monday.setDate(d.getDate() - day + 1)
          return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
        }
        if (params.period === 'year') return `${d.getFullYear()}-01-01`
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      }

      const periodTotals = new Map<string, { income: number; expense: number }>()
      const futureTotals = new Map<string, number>()

      for (const tx of allTxs) {
        if (!tx.created_at) continue
        const card = tx.card_id ? cardMap.get(tx.card_id) : null
        if (card && card.bank_id && excludedBankIds.has(card.bank_id)) continue
        const cardCurrency = card ? (card.currency || 'UAH').toUpperCase() : 'UAH'
        
        const amount = Number(tx.amount || 0)
        const txDate = tx.created_at.slice(0, 10)

        if (txDate <= endDateStr) {
          const key = `${periodKey(tx.created_at)}_${cardCurrency}`
          const currentObj = periodTotals.get(key) || { income: 0, expense: 0 }
          if (amount > 0) currentObj.income += amount
          else currentObj.expense += amount
          periodTotals.set(key, currentObj)
        } else {
          futureTotals.set(cardCurrency, (futureTotals.get(cardCurrency) || 0) + amount)
        }
      }

      const changes = []
      for (const [key, val] of periodTotals.entries()) {
        const [date, currency] = key.split('_')
        changes.push({ date, currency, income: val.income, expense: val.expense })
      }

      const futureChanges = []
      for (const [currency, change] of futureTotals.entries()) {
        futureChanges.push({ currency, change })
      }

      const { data: oldestTx } = await supabase
        .from('transactions')
        .select('created_at')
        .eq('user_id', user.id)
        .or('archives.is.null,archives.eq.false')
        .or('exclude_from_stats.is.null,exclude_from_stats.eq.false')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      const minDate = oldestTx ? oldestTx.created_at.slice(0, 10) : '2024-01-01'

      return { changes, futureChanges, minDate }
    } catch (fallbackError) {
      console.error('fetchBalanceHistory fallback failed', fallbackError)
      return { changes: [], futureChanges: [] }
    }
  }
}