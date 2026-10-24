import { supabase } from '../lib/supabase'
import { apiFetch } from '../utils.jsx'
import { invalidateSumByCardCache } from '../utils/dataCache'

/** A new transfer between two accounts (both legs created); `createdAt` — when it happened, now when not given */
export async function createTransfer({ fromCardId = null, toCardId = null, amount = 0, amountTo = null, note = '', createdAt = null }) {
  const res = await apiFetch('/api/transfers', {
    method: 'POST',
    body: JSON.stringify({ fromCardId, toCardId, amount, amountTo, note, ...(createdAt ? { createdAt } : {}) })
  })
  invalidateSumByCardCache()
  return res
}

// Mark two existing transactions as a transfer pair
// fromTxId: negative (source), toTxId: positive (target)
export async function markExistingAsTransfer({ fromTxId, toTxId, note = '' }) {
  if (!fromTxId || !toTxId) throw new Error('Необхідно вибрати дві транзакції')

  const res = await apiFetch('/api/transfers/mark-existing', {
    method: 'POST',
    body: JSON.stringify({ fromTxId, toTxId, note })
  })
  invalidateSumByCardCache()
  return res
}

/** An existing transaction becomes one leg; the other is created on `cardId` with `amount` */
export async function transferFromExisting({ txId, cardId, amount }) {
  const res = await apiFetch('/api/transfers/from-existing', {
    method: 'POST',
    body: JSON.stringify({ txId, cardId, amount })
  })
  invalidateSumByCardCache()
  return res
}

/** The legs become ordinary transactions again; `deleteIds` (legs made in the app) are deleted instead */
export async function unlinkTransfer(transferId, deleteIds = []) {
  const res = await apiFetch('/api/transfers/unlink', {
    method: 'POST',
    body: JSON.stringify({ transferId, deleteIds })
  })
  invalidateSumByCardCache()
  return res
}

/** Both legs of the given transfers (by transfer_id), whatever card or page they're on */
export async function listTransferLegs(transferIds) {
  const ids = [...new Set((transferIds || []).filter(Boolean))]
  if (ids.length === 0) return []
  const out = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .in('transfer_id', ids.slice(i, i + 100))
      .not('archives', 'is', true)
      .order('created_at', { ascending: true })
    if (error) throw error
    out.push(...(data || []))
  }
  return out
}

/** transfer_id → its legs, the money out ('from') first */
export function groupTransferLegs(legs) {
  const map = {}
  for (const l of legs || []) {
    if (!l?.transfer_id) continue
    ;(map[l.transfer_id] ||= []).push(l)
  }
  for (const id of Object.keys(map)) {
    map[id].sort((a, b) => (a.transfer_role === 'from' ? -1 : 0) - (b.transfer_role === 'from' ? -1 : 0))
  }
  return map
}

/** Can this transaction become one side of a transfer? Only a plain booked one */
export function canBeTransfer(tx) {
  return !!tx && !tx.is_transfer && !tx.transfer_id && !tx.refund_for && !tx.is_debt && tx.status !== 'pending' && Number(tx.amount) !== 0
}

/**
 * Transactions that could be the other leg of `tx`: the opposite direction, on another account,
 * within a week of it, not already a transfer. Newest first; the modal ranks them.
 */
export async function listTransferCandidates(tx) {
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
  // Refunds belong to their expense, debts to the debt list, and «в обробці» rows may still be
  // cancelled by the bank
  return (data || []).filter(canBeTransfer)
}
