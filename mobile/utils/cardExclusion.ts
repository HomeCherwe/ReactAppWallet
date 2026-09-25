import { useMemo } from 'react'
import { Card, setCardExcludedFromStats } from '../api/cards'
import { useSettingsStore } from '../store/useSettingsStore'

/**
 * Legacy location of excluded card ids (user_preferences), used before the
 * cards.exclude_from_stats column existed. Still honoured until migrated into the DB.
 */
export const EXCLUDED_CARDS_PATH = 'cards.excludedCardIds'

const EMPTY: string[] = []

/** Whether a card is excluded: its own DB flag or its whole bank (set in the web app). */
export function isCardExcluded(card: Card): boolean {
  return !!card.exclude_from_stats || !!card.bank_exclude_from_stats
}

/** Excluded ids for the given cards (DB flags + legacy preference list). */
export function excludedIdsOf(cards: Card[], legacy: string[] = EMPTY): string[] {
  const ids = new Set(legacy)
  for (const c of cards) if (isCardExcluded(c)) ids.add(c.id)
  return [...ids].sort()
}

export function useExcludedCardIds(cards: Card[]): string[] {
  const legacy = useSettingsStore(s => s.getNestedSetting<string[]>(EXCLUDED_CARDS_PATH, EMPTY))
  return useMemo(() => excludedIdsOf(cards, legacy), [cards, legacy])
}

export function getLegacyExcludedIds(): string[] {
  return useSettingsStore.getState().getNestedSetting<string[]>(EXCLUDED_CARDS_PATH, EMPTY)
}

/**
 * Moves exclusions saved in preferences into cards.exclude_from_stats, then clears the
 * preference. Does nothing (and keeps the preference) if the DB column isn't there yet.
 * Returns the ids that were written to the DB.
 */
export async function migrateLegacyExclusions(cards: Card[]): Promise<string[]> {
  const legacy = getLegacyExcludedIds()
  if (legacy.length === 0) return []
  const toWrite = cards.filter(c => legacy.includes(c.id) && !c.exclude_from_stats).map(c => c.id)
  try {
    for (const id of toWrite) await setCardExcludedFromStats(id, true)
    useSettingsStore.getState().updateNestedSetting(EXCLUDED_CARDS_PATH, [])
    return toWrite
  } catch {
    return []
  }
}

/**
 * Service categories written by balance sync (e.g. "Binance Sync", "MonoBank Sync",
 * "Revolut Sync") — hidden from category pickers for every user.
 */
export function isSyncCategory(category: string): boolean {
  return /\bsync$/i.test(category.trim())
}
