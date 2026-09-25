import { apiFetch } from '../lib/apiFetch'
import { invalidateSumByCardCache } from '../utils/dataCache'

export async function createTransfer(payload: {
  from_card_id: string
  to_card_id: string
  amount?: number
  amount_from?: number
  amount_to?: number
  note?: string
}): Promise<any> {
  const data = await apiFetch('/api/transfers', {
    method: 'POST',
    body: JSON.stringify({
      from_card_id: payload.from_card_id,
      to_card_id: payload.to_card_id,
      amount: payload.amount_from ?? payload.amount ?? 0,
      amount_from: payload.amount_from,
      amount_to: payload.amount_to,
      note: payload.note,
    }),
  })
  invalidateSumByCardCache()
  return data
}