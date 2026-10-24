import crypto from 'crypto'
import { cardBucket, withCardV2 } from './accountKind.js'

/** "Revolut Chameleon": the card's bank and name, the way transactions show their account */
export function cardLabelOf(card) {
  if (!card) return null
  const bank = String(card.banks?.name || card.bank || '').trim()
  const name = String(card.name || '').trim()
  if (!bank) return name || null
  if (!name) return bank
  if (name.toLowerCase().startsWith(bank.toLowerCase())) return name
  return `${bank} ${name}`
}

/**
 * An existing transaction becomes one leg of a transfer; the other leg is created on `otherCardId`
 * (opposite sign, same date; `amountAbs` defaults to the transaction's own). For money that left one
 * account when the other side was never recorded — a card that isn't synced, a bank's savings it
 * doesn't share. The caller checks that `tx` can be a transfer (not one already, not a refund, a
 * debt or pending). Returns [from leg, to leg].
 */
export async function makeTransferFromExisting(supabase, userId, tx, otherCardId, { amountAbs, note } = {}) {
  const abs = Math.abs(Number(amountAbs || tx.amount))
  const ids = [...new Set([tx.card_id, otherCardId].filter(Boolean))]
  const { data: cards, error: cardsErr } = await withCardV2(extra =>
    supabase
      .from('cards')
      .select('id, bank, name, currency' + extra)
      .eq('user_id', userId)
      .in('id', ids)
  )
  if (cardsErr) throw cardsErr
  const other = (cards || []).find(c => c.id === otherCardId)
  if (!other) throw Object.assign(new Error('Рахунок не знайдено'), { status: 404 })
  const own = (cards || []).find(c => c.id === tx.card_id) || null

  // Money left this transaction's account → it is the "from" leg; arrived → the "to" leg
  const isOutgoing = Number(tx.amount) < 0
  const fromCard = isOutgoing ? own : other
  const toCard = isOutgoing ? other : own
  // Money taken out of savings counts as income
  const countAsIncome = cardBucket(fromCard) === 'savings' && cardBucket(toCard) !== 'savings'
  const transferId = crypto.randomUUID()

  const { data: created, error: insErr } = await supabase
    .from('transactions')
    .insert([{
      amount: isOutgoing ? abs : -abs,
      card_id: other.id,
      card: cardLabelOf(other),
      created_at: tx.created_at,
      is_transfer: true,
      transfer_role: isOutgoing ? 'to' : 'from',
      transfer_id: transferId,
      count_as_income: isOutgoing ? countAsIncome : false,
      archives: false,
      category: 'ТРАНСФЕР',
      note: note || null,
      user_id: userId,
      exclude_from_stats: true,
    }])
    .select()
    .single()
  if (insErr) throw insErr

  const { data: updated, error: updErr } = await supabase
    .from('transactions')
    .update({
      is_transfer: true,
      transfer_role: isOutgoing ? 'from' : 'to',
      transfer_id: transferId,
      category: 'ТРАНСФЕР',
      exclude_from_stats: true,
      ...(isOutgoing ? {} : { count_as_income: countAsIncome }),
    })
    .eq('id', tx.id)
    .eq('user_id', userId)
    .select()
    .single()
  if (updErr) {
    // Don't leave half a transfer behind
    await supabase.from('transactions').delete().eq('id', created.id).eq('user_id', userId)
    throw updErr
  }
  return isOutgoing ? [updated, created] : [created, updated]
}
