import { apiFetch } from '../lib/apiFetch'
import { supabase } from '../lib/supabase'
import { getCachedCards, invalidateCardsCache } from '../utils/dataCache'

export interface Card {
  id: string
  name: string
  bank: string
  bank_id?: string
  currency: string
  card_number?: string
  expiry_date?: string
  initial_balance?: number
  bg_url?: string | undefined
  bank_exclude_from_stats?: boolean
  /** Card excluded from statistics (cards.exclude_from_stats) */
  exclude_from_stats?: boolean
  color?: string
}

/**
 * Adds cards.exclude_from_stats to each card. Read separately (and failures ignored) so card
 * loading keeps working even before the column exists or if the backend doesn't return it.
 */
async function withExclusionFlags(cards: Card[]): Promise<Card[]> {
  if (cards.length === 0) return cards
  const { data, error } = await supabase
    .from('cards')
    .select('id, exclude_from_stats')
    .in('id', cards.map(c => c.id))
  if (error || !data) return cards
  const flags = new Map(data.map((r: any) => [r.id, !!r.exclude_from_stats]))
  return cards.map(c => ({ ...c, exclude_from_stats: flags.get(c.id) ?? false }))
}

/** Saves the "exclude from statistics" switch for one card. */
export async function setCardExcludedFromStats(id: string, excluded: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('cards')
    .update({ exclude_from_stats: excluded })
    .eq('id', id)
    .select('id')
  if (error) throw error
  // RLS silently skips rows it doesn't allow, so treat "nothing updated" as a failure
  if (!data || data.length === 0) throw new Error('Не вдалося зберегти: немає доступу до цієї картки')
  invalidateCardsCache()
}

async function _listCardsInternal(): Promise<Card[]> {
  return withExclusionFlags(await _listCardsBase())
}

async function _listCardsBase(): Promise<Card[]> {
  try {
    return await apiFetch<Card[]>('/api/cards')
  } catch (err) {
    console.warn('Backend /api/cards unreachable, fallback to Supabase:', err)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const { data, error } = await supabase
      .from('cards')
      .select('id, bank_id, name, currency, initial_balance, bg_url, card_number, expiry_date, cvv, created_at, banks(name, iban, bic, beneficiary, exclude_from_stats)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map((card: any) => ({
      ...card,
      bank: card.banks?.name || card.name,
      bank_exclude_from_stats: card.banks?.exclude_from_stats || false,
    }))
  }
}

export async function listCards(): Promise<Card[]> {
  return getCachedCards(_listCardsInternal)
}

export async function createCard(payload: {
  bank_id?: string
  name: string
  card_number?: string
  currency: string
  initial_balance?: number
  expiry_date?: string
  cvv?: string
  bg_url?: string | undefined
  bank_exclude_from_stats?: boolean
  color?: string
}): Promise<Card> {
  try {
    const data = await apiFetch<Card>('/api/cards', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    invalidateCardsCache()
    return data
  } catch (err) {
    console.warn('Backend /api/cards POST unreachable, fallback to Supabase:', err)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Користувач не авторизований')
    const { data, error } = await supabase
      .from('cards')
      .insert([{ ...payload, user_id: user.id }])
      .select()
      .single()
    if (error) throw error
    invalidateCardsCache()
    return data as Card
  }
}

export async function updateCard(id: string, patch: Partial<Card>): Promise<Card> {
  try {
    const data = await apiFetch<Card>(`/api/cards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    })
    invalidateCardsCache()
    return data
  } catch (err) {
    const { data, error } = await supabase
      .from('cards')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    invalidateCardsCache()
    return data as Card
  }
}

export async function deleteCard(id: string): Promise<void> {
  try {
    await apiFetch(`/api/cards/${id}`, { method: 'DELETE' })
  } catch (err) {
    const { error } = await supabase
      .from('cards')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
  invalidateCardsCache()
}