import { apiFetch } from '../lib/apiFetch'

export interface Bank {
  id: string
  name: string
  color?: string
  logo_url?: string
}

export async function listBanks(): Promise<Bank[]> {
  try {
    return await apiFetch<Bank[]>('/api/banks')
  } catch { return [] }
}

/** Creates a bank of your own (no sync) — cards can then be added to it. */
export async function createBank(name: string): Promise<Bank> {
  return apiFetch<Bank>('/api/banks', {
    method: 'POST',
    body: JSON.stringify({ name: name.trim() }),
  })
}
