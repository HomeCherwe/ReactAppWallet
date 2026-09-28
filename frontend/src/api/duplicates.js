import { supabase } from '../lib/supabase'
import { invalidateSumByCardCache } from '../utils/dataCache'

/**
 * "Можливі дублі" (same as the iPhone app): a bank transaction and one on the same card with no bank
 * id (entered by hand or created by a subscription), same amount to the cent, within 3 days.
 * Pairs: [{ manual, bank, card_name, card_currency }]
 */
export async function listPossibleDuplicates() {
  const { data, error } = await supabase.rpc('find_possible_duplicates')
  if (error) throw error
  return data || []
}

export const pairKey = p => `${p.manual.id}:${p.bank.id}`

/** Keeps the hand-made one (category, note) with the bank's id and date; the bank copy is deleted */
export async function mergeDuplicate(pair) {
  const { error } = await supabase.rpc('merge_duplicate_transactions', { p_keep: pair.manual.id, p_drop: pair.bank.id })
  if (error) throw error
  invalidateSumByCardCache()
}
