import { apiFetch } from '../lib/apiFetch'
import { supabase } from '../lib/supabase'
import { invalidateSumByCardCache } from '../utils/dataCache'
import { Transaction } from './transactions'

/** A new transfer between two accounts (both legs created) */
export async function createTransfer(payload: {
  from_card_id: string
  to_card_id: string
  amount?: number
  amount_from?: number
  amount_to?: number
  note?: string
  /** When it happened; now when not given */
  created_at?: string
}): Promise<any> {
  const data = await apiFetch('/api/transfers', {
    method: 'POST',
    // The route reads camelCase (it used to get snake_case from here and lost both cards)
    body: JSON.stringify({
      fromCardId: payload.from_card_id,
      toCardId: payload.to_card_id,
      amount: payload.amount_from ?? payload.amount ?? 0,
      amountTo: payload.amount_to,
      note: payload.note,
      createdAt: payload.created_at,
    }),
  })
  invalidateSumByCardCache()
  return data
}

/** Two existing transactions (money out on one account, in on another) become one transfer */
export async function markExistingAsTransfer(fromTxId: string, toTxId: string): Promise<void> {
  await apiFetch('/api/transfers/mark-existing', { method: 'POST', body: JSON.stringify({ fromTxId, toTxId }) })
  invalidateSumByCardCache()
}

/** An existing transaction becomes one leg; the other is created on `cardId` with `amount` */
export async function transferFromExisting(txId: string, cardId: string, amount: number): Promise<void> {
  await apiFetch('/api/transfers/from-existing', { method: 'POST', body: JSON.stringify({ txId, cardId, amount }) })
  invalidateSumByCardCache()
}

/** Both legs become ordinary transactions again */
export async function unlinkTransfer(transferId: string): Promise<void> {
  await apiFetch('/api/transfers/unlink', { method: 'POST', body: JSON.stringify({ transferId }) })
  invalidateSumByCardCache()
}

/**
 * Transactions that could be the other leg of `tx`: the opposite direction, on another account,
 * within a week of it, not already a transfer. Newest first; the sheet ranks them.
 */
export async function listTransferCandidates(tx: Transaction): Promise<Transaction[]> {
  const at = new Date(tx.created_at).getTime()
  const week = 7 * 864e5
  let q = supabase
    .from('transactions')
    .select('*')
    .gte('created_at', new Date(at - week).toISOString())
    .lte('created_at', new Date(at + week).toISOString())
    .not('archives', 'is', true)
    .not('is_transfer', 'is', true)
    .neq('id', tx.id)
    .order('created_at', { ascending: false })
    .limit(300)
  q = Number(tx.amount) < 0 ? q.gt('amount', 0) : q.lt('amount', 0)
  q = tx.card_id ? q.or(`card_id.neq.${tx.card_id},card_id.is.null`) : q.not('card_id', 'is', null)
  const { data, error } = await q
  if (error) throw error
  return (data || []) as Transaction[]
}
