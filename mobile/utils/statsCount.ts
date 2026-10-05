import { Transaction } from '../api/transactions'
import { Card } from '../api/cards'
import { convertCurrency, RatesMap } from './currency'

export interface CountedTx {
  tx: Transaction
  /** In the main currency, positive (expenses too) */
  value: number
  income: boolean
}

/**
 * What statistics count, in the main currency — the same rules everywhere (Analytics, the month's
 * report, Wrapped): no archived rows, transfers, refunds (they're taken off their expense through
 * amount_stat), "not in stats" transactions, categories or cards, and no savings accounts.
 */
export function countedTransactions(
  transactions: Transaction[],
  {
    cards,
    rates,
    currency,
    excludedCardIds,
    excludedCategories,
  }: { cards: Card[]; rates: RatesMap | null; currency: string; excludedCardIds: string[]; excludedCategories: string[] }
): CountedTx[] {
  const excludedCards = new Set(excludedCardIds)
  const cardInfo = new Map(
    cards.map(c => {
      const bank = String(c.bank || '').toLowerCase()
      return [c.id, { currency: (c.currency || 'UAH').toUpperCase(), savings: bank.includes('накопич') || bank.includes('savings') }]
    })
  )
  const out: CountedTx[] = []
  for (const tx of transactions) {
    if (tx.archives || tx.is_transfer || tx.exclude_from_stats || tx.refund_for) continue
    if (tx.category && excludedCategories.includes(tx.category)) continue
    if (tx.card_id && excludedCards.has(tx.card_id)) continue
    const info = tx.card_id ? cardInfo.get(tx.card_id) : undefined
    if (info?.savings) continue
    const amount = Number(tx.amount_stat ?? tx.amount ?? 0)
    if (!amount) continue
    const value = Math.abs(convertCurrency(amount, info?.currency || 'UAH', currency, rates))
    out.push({ tx, value, income: amount > 0 })
  }
  return out
}
