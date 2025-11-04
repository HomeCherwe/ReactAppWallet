import { supabase } from '../lib/supabase'
import { apiFetch } from '../utils.jsx'

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
  return await apiFetch('/api/transfers', {
    method: 'POST',
    body: JSON.stringify({ fromCardId, toCardId, amount, amountTo, note })
  })
}

// Mark two existing transactions as a transfer pair
// fromTxId: negative (source), toTxId: positive (target)
export async function markExistingAsTransfer({ fromTxId, toTxId, note = '' }) {
  if (!fromTxId || !toTxId) throw new Error('Необхідно вибрати дві транзакції')

  return await apiFetch('/api/transfers/mark-existing', {
    method: 'POST',
    body: JSON.stringify({ fromTxId, toTxId, note })
  })
}