import { supabase } from '../lib/supabase'
import { convertAmount } from './primaryCurrency'

// Same as the iPhone app (mobile/utils/statsCount.ts): what statistics count, in the main currency —
// no archived rows, transfers, refunds (amount_stat already takes them off their expense), "not in
// stats" transactions, categories or cards, savings or Binance.

const cardExcluded = c => !!(c.exclude_from_stats || c.bank_exclude_from_stats || c.banks?.exclude_from_stats)
const lower = v => String(v || '').toLowerCase()

/** [{ tx, value, income }] — value in `currency`, positive for expenses too */
export function countedTransactions(transactions, { cards = [], rates, currency, excludedCategories = [] }) {
  const info = new Map(
    cards.map(c => {
      const bank = lower(c.bank)
      const name = lower(c.name)
      return [
        c.id,
        {
          currency: String(c.currency || 'UAH').toUpperCase(),
          skip:
            cardExcluded(c) ||
            ['накопич', 'savings', 'збер', 'binance'].some(w => bank.includes(w) || name.includes(w)),
        },
      ]
    })
  )
  const out = []
  for (const tx of transactions) {
    if (tx.archives || tx.is_transfer || tx.exclude_from_stats || tx.refund_for) continue
    if (tx.category === 'ТРАНСФЕР') continue
    if (tx.category && excludedCategories.includes(tx.category)) continue
    const card = tx.card_id ? info.get(tx.card_id) : undefined
    if (card?.skip) continue
    const amount = Number(tx.amount_stat ?? tx.amount ?? 0)
    if (!amount) continue
    const value = Math.abs(convertAmount(amount, card?.currency || 'UAH', currency, rates) ?? amount)
    out.push({ tx, value, income: amount > 0 })
  }
  return out
}

/** Every transaction in [from, to) (not archived), straight from the database */
export async function listPeriodTransactions(from, to) {
  const out = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())
      .not('archives', 'is', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return out
}
