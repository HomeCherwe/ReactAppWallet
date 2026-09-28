import { supabase } from '../lib/supabase'
import { invalidateSumByCardCache } from '../utils/dataCache'
import { Transaction } from './transactions'

/**
 * "Можливі дублі": a bank transaction and one on the same card with no bank id (entered by hand or
 * created by a subscription), same amount to the cent, within 3 days (SQL find_possible_duplicates).
 */
export interface DuplicatePair {
  manual: Transaction
  bank: Transaction
  card_name: string | null
  card_currency: string | null
}

export const pairKey = (p: DuplicatePair) => `${p.manual.id}:${p.bank.id}`

export async function listPossibleDuplicates(): Promise<DuplicatePair[]> {
  const { data, error } = await supabase.rpc('find_possible_duplicates')
  if (error) throw error
  return (data || []) as DuplicatePair[]
}

/** Keeps the hand-made one (category, note) with the bank's id and date; the bank copy is deleted */
export async function mergeDuplicate(pair: DuplicatePair): Promise<void> {
  const { error } = await supabase.rpc('merge_duplicate_transactions', { p_keep: pair.manual.id, p_drop: pair.bank.id })
  if (error) throw error
  invalidateSumByCardCache()
}
