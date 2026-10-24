import { listCards } from './cards'
import { sumTransactionsByCard } from './transactions'
import { apiFetch } from '../utils.jsx'
import { getBucket } from '../utils/accountKind'

function emptyOut() { return { cards: {}, savings: {}, cash: {}, investments: {} } }

/**
 * Balance per group (cards, savings, cash, investments) and currency — the same numbers as the
 * iPhone app (mobile/api/totals.ts): every account except those of a bank switched off, plus
 * transactions without an account as cash in UAH. `accounts` are those accounts with their balance
 * (`_balance`), for the group's list in the balance window.
 */
export async function fetchBalances() {
  const out = emptyOut()
  const accounts = []
  try {
    const cards = await listCards()
    const sumsByCard = await sumTransactionsByCard()

    for (const card of cards) {
      if (card.bank_exclude_from_stats) continue
      const bucket = getBucket(card)
      const currency = (card.currency || 'UAH').toUpperCase()
      const total = Number(card.initial_balance || 0) + Number(sumsByCard[card.id] || 0)
      accounts.push({ ...card, _balance: total, _bucket: bucket })
      if (Math.abs(total) > 0.001) out[bucket][currency] = (out[bucket][currency] || 0) + total
    }

    try {
      const cashTransactions = await apiFetch('/api/transactions?card_id=null&fields=amount,created_at,archives')
      const cashSum = (cashTransactions || []).filter(tx => !tx.archives).reduce((sum, tx) => sum + Number(tx.amount || 0), 0)
      if (Math.abs(cashSum) > 0.001) out.cash.UAH = (out.cash.UAH || 0) + cashSum
    } catch (cashErr) {
      console.error('Failed to fetch cash transactions:', cashErr)
    }
  } catch (e) {
    console.error('fetchBalances error', e)
  }
  return { totals: out, accounts }
}

export async function fetchTotalsByBucket() {
  return (await fetchBalances()).totals
}

/**
 * Fetch balance history for a given bucket and period
 * @param {{ bucket?: 'all'|'cash'|'cards'|'savings'|'investments', period?: 'week'|'month'|'year', currency?: string }} params
 * @returns {Promise<Array<{ date: string, balance: number, change: number }>>}
 */
export async function fetchBalanceHistory({ bucket = 'all', period = 'month', currency = 'UAH', start, end } = {}) {
  try {
    const queryObj = { bucket, period, currency }
    if (start) queryObj.start = start
    if (end) queryObj.end = end
    const params = new URLSearchParams(queryObj)
    const result = await apiFetch(`/api/balance/history?${params}`)
    return result || { changes: [], futureChanges: [] }
  } catch (e) {
    console.error('fetchBalanceHistory error', e)
    return { changes: [], futureChanges: [] }
  }
}

