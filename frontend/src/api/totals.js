import { supabase } from '../lib/supabase'
import { listCards } from './cards'
import { sumTransactionsByCard } from './transactions'

function emptyOut() { return { cash: {}, cards: {}, savings: {} } }

// Helper to determine bucket type
function getBucket(card) {
  if (!card) return 'cash'
  const bank = (card.bank || '').toLowerCase()
  const name = (card.name || '').toLowerCase()
  const full = `${bank} ${name}`
  
  if (full.includes('збер') || full.includes('savings')) return 'savings'
  if (full.includes('гот') || full.includes('cash')) return 'cash'
  return 'cards'
}

export async function fetchTotalsByBucket() {
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return emptyOut()

  try {
    // Fetch all user's cards
    const cards = await listCards()
    const cardMap = new Map(cards.map(c => [c.id, c]))

    // Get sums by card_id (already filtered by user_id in sumTransactionsByCard)
    const sumsByCard = await sumTransactionsByCard()

    // Initialize output
    const out = emptyOut()

    // Process each card
    for (const card of cards) {
      const bucket = getBucket(card)
      const currency = (card.currency || 'UAH').toUpperCase()
      const initialBalance = Number(card.initial_balance || 0)
      const transactionSum = Number(sumsByCard[card.id] || 0)
      const total = initialBalance + transactionSum

      // Only add currency if total is not zero
      if (total !== 0) {
        if (!out[bucket][currency]) {
          out[bucket][currency] = 0
        }
        out[bucket][currency] += total
      }
    }

    // Also handle cash (cards without card_id in transactions)
    // Transactions with card_id = null are considered cash
    const { data: cashTransactions } = await supabase
      .from('transactions')
      .select('amount, created_at, archives')
      .eq('user_id', user.id)
      .is('card_id', null)
      .or('archives.is.null,archives.eq.false')

    if (cashTransactions && cashTransactions.length > 0) {
      // Group by currency - for cash we'll default to UAH
      // (since cash transactions don't have currency directly)
      const cashSum = cashTransactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0)
      // Only add if sum is not zero
      if (cashSum !== 0) {
        out.cash['UAH'] = (out.cash['UAH'] || 0) + cashSum
      }
    }

    return out
  } catch (e) {
    console.error('fetchTotalsByBucket error', e)
    return emptyOut()
  }
}
