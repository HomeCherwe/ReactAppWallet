import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  const userId = 'aec17bc7-f8b5-40db-94cf-47e99f10d10b'

  // Fetch cards
  const { data: cards } = await supabase.from('cards').select('*').eq('user_id', userId)
  const cardMap = new Map((cards || []).map(c => [c.id, c]))

  // Fetch all transactions from beginning of time
  const { data: txs, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .or('archives.is.null,archives.eq.false')
    .or('exclude_from_stats.is.null,exclude_from_stats.eq.false')
    .order('created_at', { ascending: true })

  if (error) {
    console.error(error)
    return
  }

  // Set initial balances
  const balances = {}
  cards.forEach(c => {
    balances[c.id] = Number(c.initial_balance || 0)
  })

  console.log('--- Initial Balances Set on Cards ---')
  cards.forEach(c => {
    console.log(`${c.bank} ${c.name} (${c.currency}): ${c.initial_balance}`)
  })

  console.log('\n--- Cards going negative in 2024 / early 2025 ---')
  const printed = new Set()
  
  txs.forEach(t => {
    if (!t.card_id) return // skip cash transactions without card_id
    const card = cardMap.get(t.card_id)
    if (!card) return

    const oldBal = balances[card.id]
    balances[card.id] += Number(t.amount || 0)

    // Check if UAH/EUR/USD balance of the card goes below 0 before April 1, 2025
    const txDate = new Date(t.created_at)
    if (balances[card.id] < 0 && txDate < new Date('2025-04-01')) {
      const key = `${card.id}_${Math.floor(balances[card.id])}`
      if (!printed.has(card.id)) {
        console.log(`[NEGATIVE] Date: ${t.created_at.slice(0, 10)} | Card: ${card.bank} ${card.name} (${card.currency}) | Amount: ${t.amount} | Balance went from ${oldBal.toFixed(2)} to ${balances[card.id].toFixed(2)} | Category: ${t.category}`)
        printed.add(card.id)
      }
    }
  })
}

run()
