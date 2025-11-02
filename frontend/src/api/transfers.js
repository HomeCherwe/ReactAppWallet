import { supabase } from '../lib/supabase'

function genUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // fallback simple UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export async function createTransfer({ fromCardId = null, toCardId = null, amount = 0, amountTo = null, note = '' }) {
  const transferId = genUUID()
  const ids = [...new Set([fromCardId, toCardId].filter(Boolean))]
  let cards = []
  if (ids.length) {
    const { data } = await supabase.from('cards').select('id, bank, name, currency').in('id', ids)
    cards = data || []
  }

  const findCard = (id) => cards.find(c => c.id === id)
  const fromCard = findCard(fromCardId)
  const toCard = findCard(toCardId)

  const isSavings = (c) => ((c?.bank||'').toLowerCase().includes('збер') || (c?.bank||'').toLowerCase().includes('savings'))
  const fromBucket = fromCard ? (isSavings(fromCard) ? 'savings' : (fromCard.bank && fromCard.bank.toLowerCase().includes('гот') ? 'cash' : 'cards')) : 'cash'
  const toBucket   = toCard   ? (isSavings(toCard)   ? 'savings' : (toCard.bank   && toCard.bank.toLowerCase().includes('гот') ? 'cash' : 'cards')) : 'cash'

  const countAsIncome = (fromBucket === 'savings' && toBucket !== 'savings')

  const now = new Date().toISOString()
  const fromAmountAbs = Math.abs(Number(amount || 0))
  const toAmountAbs = Math.abs(Number((amountTo ?? amount) || 0))
  const src = {
    amount: -fromAmountAbs,
    card_id: fromCardId || null,
    card: fromCard ? `${fromCard.bank} ${fromCard.name}` : null,
    created_at: now,
    is_transfer: true,
    transfer_role: 'from',
    transfer_id: transferId,
    archives: false,
    category: 'ТРАНСФЕР',
    note: note || null,
  }
  const tgt = {
    amount: toAmountAbs,
    card_id: toCardId || null,
    card: toCard ? `${toCard.bank} ${toCard.name}` : null,
    created_at: now,
    is_transfer: true,
    transfer_role: 'to',
    transfer_id: transferId,
    count_as_income: countAsIncome,
    archives: false,
    category: 'ТРАНСФЕР',
    note: note || null,
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert([src, tgt])
    .select()

  if (error) throw error
  return data
}

// Mark two existing transactions as a transfer pair
// fromTxId: negative (source), toTxId: positive (target)
export async function markExistingAsTransfer({ fromTxId, toTxId, note = '' }) {
  if (!fromTxId || !toTxId) throw new Error('Необхідно вибрати дві транзакції')

  const transferId = genUUID()

  // Load both transactions
  const { data: txs, error: loadErr } = await supabase
    .from('transactions')
    .select('id, amount, card_id, card, created_at')
    .in('id', [fromTxId, toTxId])

  if (loadErr) throw loadErr
  if (!txs || txs.length !== 2) throw new Error('Не знайдено обидві транзакції')

  const t1 = txs.find(t => t.id === fromTxId)
  const t2 = txs.find(t => t.id === toTxId)
  if (!t1 || !t2) throw new Error('Не знайдено обидві транзакції')

  const a1 = Number(t1.amount || 0)
  const a2 = Number(t2.amount || 0)

  // Determine roles by sign
  const src = a1 <= 0 ? t1 : t2
  const tgt = a1 <= 0 ? t2 : t1
  // Note: Do not block on amount mismatch to allow flexible pairing of transactions

  // Update both with transfer flags and same transfer_id (avoid upsert to prevent partial inserts)
  const srcUpdate = {
    is_transfer: true,
    transfer_role: 'from',
    transfer_id: transferId,
    category: 'ТРАНСФЕР',
    ...(note ? { note } : {}),
  }
  const tgtUpdate = {
    is_transfer: true,
    transfer_role: 'to',
    transfer_id: transferId,
    category: 'ТРАНСФЕР',
    ...(note ? { note } : {}),
  }

  const { data: updatedSrc, error: errSrc } = await supabase
    .from('transactions')
    .update(srcUpdate)
    .eq('id', src.id)
    .select()
    .single()
  if (errSrc) throw errSrc

  const { data: updatedTgt, error: errTgt } = await supabase
    .from('transactions')
    .update(tgtUpdate)
    .eq('id', tgt.id)
    .select()
    .single()
  if (errTgt) throw errTgt

  return [updatedSrc, updatedTgt]
}