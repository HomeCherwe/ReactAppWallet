
import { supabase } from '../lib/supabase'

const notArchived = (q) => q.or('archives.is.null,archives.eq.false')

export async function listTransactions({ from = 0, to = 9, search = '' } = {}) {
  let q = supabase
    .from('transactions')
    .select('id, created_at, amount, category, note, archives, card, card_id')
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
  const { data, error } = await supabase
    .from('transactions')
    .insert([payload])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTransaction(id, payload) {
  const { error } = await supabase.from('transactions').update(payload).eq('id', id)
  if (error) throw error
}

export async function deleteTransaction(id) {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
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
    let q = supabase.from('transactions').select('id, amount, card_id, archives')
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
