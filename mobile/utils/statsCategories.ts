import { useSettingsStore } from '../store/useSettingsStore'

// Categories left out of all statistics (Налаштування → «Категорії поза статистикою»), e.g. money
// someone owes back. Same setting as the web: preferences.stats.excludedCategories.
export const EXCLUDED_CATEGORIES_PATH = 'stats.excludedCategories'
const NONE: string[] = []

/** The current list (for code outside React, e.g. stats in api/) */
export function excludedCategories(): string[] {
  return useSettingsStore.getState().getNestedSetting<string[]>(EXCLUDED_CATEGORIES_PATH, NONE)
}

export const isCategoryExcluded = (category?: string | null) => !!category && excludedCategories().includes(category)

/** The list as a hook: screens recompute their stats when it changes */
export function useExcludedCategories(): string[] {
  return useSettingsStore(s => s.getNestedSetting<string[]>(EXCLUDED_CATEGORIES_PATH, NONE))
}
