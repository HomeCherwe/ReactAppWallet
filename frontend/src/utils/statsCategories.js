import { useSettingsStore } from '../store/useSettingsStore'

// Categories left out of all statistics (Налаштування → «Категорії поза статистикою»), e.g. money
// someone owes back. Same setting as the iPhone app: preferences.stats.excludedCategories.
export const EXCLUDED_CATEGORIES_PATH = 'stats.excludedCategories'
const NONE = []

/** The current list (for code outside React, e.g. stats helpers) */
export function excludedCategories() {
  const list = useSettingsStore.getState().settings?.stats?.excludedCategories
  return Array.isArray(list) ? list : NONE
}

export const isCategoryExcluded = category => !!category && excludedCategories().includes(category)

/** The list as a hook: components recompute their stats when it changes */
export function useExcludedCategories() {
  const list = useSettingsStore(state => state.settings?.stats?.excludedCategories)
  return Array.isArray(list) ? list : NONE
}
