import { supabase } from '../lib/supabase'
import { listCards } from './cards'
import { sumTransactionsByCard } from './transactions'
import { apiFetch } from '../utils.jsx'

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
  try {
    // Use RPC function from database (it was working correctly before)
    const result = await apiFetch('/api/totals/by-bucket')
    
    // RPC should return { cash: {}, cards: {}, savings: {} }
    if (result && typeof result === 'object') {
      return result
    }
    
    // Fallback to empty structure if result is invalid
    return emptyOut()
  } catch (e) {
    console.error('fetchTotalsByBucket error', e)
    // Fallback to client-side calculation if RPC fails
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
      try {
        const cashTransactions = await apiFetch('/api/transactions?card_id=null&fields=amount,created_at,archives')

        if (cashTransactions && cashTransactions.length > 0) {
          // Filter out archived transactions
          const activeCash = cashTransactions.filter(tx => !tx.archives)
          
          // Group by currency - for cash we'll default to UAH
          const cashSum = activeCash.reduce((sum, tx) => sum + Number(tx.amount || 0), 0)
          if (cashSum !== 0) {
            out.cash['UAH'] = (out.cash['UAH'] || 0) + cashSum
          }
        }
      } catch (cashErr) {
        console.error('Failed to fetch cash transactions:', cashErr)
      }

      return out
    } catch (fallbackErr) {
      console.error('Fallback calculation failed:', fallbackErr)
      return emptyOut()
    }
  }
}