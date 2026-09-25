import { apiFetch } from '../lib/apiFetch'

export interface Subscription {
  id: string
  name: string
  amount: number
  card_id?: string | null
  frequency: 'weekly' | 'monthly'
  day_of_week?: number
  day_of_month?: number
  is_expense: boolean
  is_active: boolean
  category?: string
  note?: string
  next_execution_at?: string
  total_participants?: number
  participants?: string[]
}

export async function listSubscriptions(): Promise<Subscription[]> {
  return apiFetch<Subscription[]>('/api/subscriptions')
}

export async function createSubscription(payload: Partial<Subscription>): Promise<Subscription> {
  return apiFetch<Subscription>('/api/subscriptions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateSubscription(id: string, payload: Partial<Subscription>): Promise<Subscription> {
  return apiFetch<Subscription>(`/api/subscriptions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteSubscription(id: string): Promise<void> {
  await apiFetch(`/api/subscriptions/${id}`, { method: 'DELETE' })
}

export async function createTransactionFromSubscription(id: string): Promise<any> {
  return apiFetch(`/api/subscriptions/${id}/create-transaction`, { method: 'POST' })
}

export async function processSubscriptions(): Promise<{ processed: number }> {
  return apiFetch('/api/subscriptions/process', { method: 'POST' })
}
