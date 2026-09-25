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
