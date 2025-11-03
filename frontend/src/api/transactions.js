
import { supabase } from '../lib/supabase'

const notArchived = (q) => q.or('archives.is.null,archives.eq.false')

export async function listTransactions({ from = 0, to = 9, search = '' } = {}) {
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return [] // Return empty if not authenticated

  let q = supabase
    .from('transactions')
    .select('id, created_at, amount, category, note, archives, card, card_id')
    .eq('user_id', user.id) // Filter by current user
    .order('created_at', { ascending: false })
    .range(from, to)

  q = notArchived(q)

  if (search) {
    const isNumeric = !isNaN(parseFloat(search)) && isFinite(search)
    if (isNumeric) {
      q = q.or(`amount.eq.${search},category.ilike.%${search}%,card.ilike.%${search}%`)
    } else {
      q = q.or(`category.ilike.%${search}%,card.ilike.%${search}%`)
    }
  }

  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function createTransaction(payload) {
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  
  const { data, error } = await supabase
    .from('transactions')
    .insert([{ ...payload, user_id: user?.id }])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTransaction(id, payload) {
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  
  const { error } = await supabase
    .from('transactions')
    .update(payload)
    .eq('id', id)
    .eq('user_id', user.id) // Ensure user can only update their own transactions
  if (error) throw error
}

export async function deleteTransaction(id) {
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id) // Ensure user can only delete their own transactions
  if (error) throw error
}

export async function archiveTransaction(id) {
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  
  const { error } = await supabase
    .from('transactions')
    .update({ archives: true })
    .eq('id', id)
    .eq('user_id', user.id) // Ensure user can only archive their own transactions
  if (error) throw error
}


export async function sumTransactionsByCard() {
  // Try server RPC first for performance. If it fails (missing RPC or error),
  // fall back to client-side aggregation so we can derive sums even when the
  // DB schema doesn't include transaction currency.
  try {
    const { data, error } = await supabase.rpc('sum_tx_by_card')
    if (!error && data) {
      const out = {}
      for (const row of data || []) {
        if (!row.card_id) continue
        out[row.card_id] = Number(row.total || 0)
      }
      return out
    }
  } catch (e) {
    console.warn('sum_tx_by_card RPC failed, falling back to client aggregation', e)
  }

  // Fallback: query transactions and aggregate by card_id
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return {} // Return empty if not authenticated

    let q = supabase.from('transactions').select('id, amount, card_id, archives')
    q = q.eq('user_id', user.id) // Filter by current user
    q = notArchived(q)
    const { data, error } = await q
    if (error) throw error
    const out = {}
    for (const row of data || []) {
      if (!row.card_id) continue
      out[row.card_id] = (out[row.card_id] || 0) + Number(row.amount || 0)
    }
    return out
  } catch (e) {
    console.error('client-side sumTransactionsByCard failed', e)
    return {}
  }
}
