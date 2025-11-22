import { supabase } from '../lib/supabase'
import { apiFetch } from '../utils.jsx'

// Глобальний кеш синхронізований з PreferencesContext
// Це дозволяє API функціям використовувати той самий кеш що і контекст
let globalPreferencesCache = null

// Callback для сповіщення контексту про зміни кешу
let cacheUpdateCallback = null

/**
 * Встановити callback для сповіщення про зміни кешу
 * @param {Function} callback - Функція яка викликається при зміні кешу
 */
export function setCacheUpdateCallback(callback) {
  cacheUpdateCallback = callback
}

// Debounce система для збереження preferences
let saveTimeout = null
let pendingUpdates = new Map() // key -> value
const SAVE_DEBOUNCE_MS = 1000 // 1 секунда debounce

/**
 * Отримати поточний кеш preferences (без запиту до API)
 * Використовується для синхронізації між контекстом і API функціями
 * @returns {Object|null} Preferences або null
 */
export function getCachedPreferences() {
  return globalPreferencesCache
}

/**
 * Встановити кеш preferences (викликається з контексту)
 * @param {Object|null} prefs - Preferences для кешування
 * @param {boolean} skipCallback - Пропустити виклик callback
 */
export function setCachedPreferences(prefs, skipCallback = false) {
  globalPreferencesCache = prefs
  // Сповіщаємо контекст про зміну (якщо callback встановлений і не пропущено)
  if (!skipCallback && cacheUpdateCallback) {
    cacheUpdateCallback(prefs)
  }
}

/**
 * Завантажити налаштування користувача з БД
 * УВАГА: Ця функція тепер використовується ТІЛЬКИ в PreferencesContext
 * Всі компоненти повинні використовувати usePreferences() з контексту!
 * @returns {Promise<Object|null>} Preferences або null
 */
export async function getUserPreferences() {
  // Якщо кеш вже є, повертаємо його (не робимо запит)
  if (globalPreferencesCache) {
    return globalPreferencesCache
  }
  
  // Якщо кешу немає, робимо запит (це має відбуватись тільки в контексті)
  try {
    const preferences = await apiFetch('/api/preferences') || {}
    globalPreferencesCache = preferences
    return preferences
  } catch (e) {
    console.error('getUserPreferences failed:', e)
    return null
  }
}

// Функція для інвалідації кешу (викликати після збереження)
export function invalidatePreferencesCache() {
  globalPreferencesCache = null
}

/**
 * Зберегти налаштування користувача в БД
 * @param {Object} preferences - Об'єкт з налаштуваннями
 * @param {boolean} skipCacheUpdate - Пропустити оновлення кешу (якщо вже оновлено оптимістично)
 * @returns {Promise<void>}
 */
export async function saveUserPreferences(preferences, skipCacheUpdate = false) {
  try {
    console.log('[saveUserPreferences] Зберігаю в БД:', preferences, 'skipCacheUpdate:', skipCacheUpdate)
    
    const response = await apiFetch('/api/preferences', {
      method: 'POST',
      body: JSON.stringify({ preferences })
    })
    
    console.log('[saveUserPreferences] Відповідь від сервера:', response)
    
    // Оновлюємо кеш тільки якщо не пропущено (щоб не викликати callback двічі)
    if (!skipCacheUpdate) {
      setCachedPreferences(preferences)
      console.log('[saveUserPreferences] Кеш оновлено з callback')
    } else {
      // Тільки оновлюємо значення без виклику callback
      globalPreferencesCache = preferences
      console.log('[saveUserPreferences] Кеш оновлено без callback')
    }
  } catch (e) {
    console.error('[saveUserPreferences] Помилка збереження:', e)
    // Не викидаємо помилку, щоб не ломати UI
  }
}

/**
 * Внутрішня функція для фактичного збереження preferences
 */
async function flushPendingUpdates() {
  if (pendingUpdates.size === 0) return
  
  console.log('[flushPendingUpdates] Початок збереження, pending updates:', Array.from(pendingUpdates.entries()))
  
  try {
    // Special handling for apis - save to separate column
    const apisUpdate = pendingUpdates.get('apis') || pendingUpdates.get('APIs')
    if (apisUpdate !== undefined) {
      console.log('[flushPendingUpdates] Зберігаю APIs...')
      await apiFetch('/api/preferences/apis', {
        method: 'POST',
        body: JSON.stringify({ apis: apisUpdate })
      })
      pendingUpdates.delete('apis')
      pendingUpdates.delete('APIs')
      invalidatePreferencesCache()
      console.log('[flushPendingUpdates] APIs збережено')
    }
    
    // Якщо є інші оновлення (не apis), зберігаємо їх разом
    if (pendingUpdates.size > 0) {
      const current = getCachedPreferences() || {}
      const updated = { ...current }
      
      // Застосовуємо всі pending оновлення з merge для кожної секції
      for (const [key, value] of pendingUpdates.entries()) {
        // Якщо значення - об'єкт, merge-имо з існуючими налаштуваннями секції
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          updated[key] = {
            ...(updated[key] || {}),
            ...value
          }
        } else {
          // Якщо не об'єкт (наприклад, null або примітив), просто замінюємо
          updated[key] = value
        }
      }
      
      console.log('[flushPendingUpdates] Зберігаю preferences:', updated)
      
      // Зберігаємо в БД
      await saveUserPreferences(updated, true) // skipCacheUpdate = true, щоб не викликати callback
      console.log('[flushPendingUpdates] Preferences збережено успішно')
      
      // Оновлюємо кеш після успішного збереження (без callback, щоб не перезаписати локальний стан компонентів)
      globalPreferencesCache = updated
      
      pendingUpdates.clear()
    }
  } catch (e) {
    console.error('[flushPendingUpdates] Помилка збереження:', e)
    pendingUpdates.clear()
  }
}

/**
 * Оновити частину налаштувань (merge) з debounce
 * @param {string} key - Ключ секції (напр. 'chart', 'cards')
 * @param {Object} value - Нове значення для секції
 * @returns {Promise<void>}
 */
export async function updatePreferencesSection(key, value) {
  try {
    console.log('[updatePreferencesSection] Оновлення:', key, value)
    
    // Якщо значення - об'єкт, merge-имо з існуючими pending оновленнями для цієї секції
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const existingPending = pendingUpdates.get(key)
      if (existingPending && typeof existingPending === 'object' && !Array.isArray(existingPending)) {
        // Merge з існуючими pending оновленнями
        pendingUpdates.set(key, {
          ...existingPending,
          ...value
        })
        console.log('[updatePreferencesSection] Merged with existing pending:', key, pendingUpdates.get(key))
      } else {
        // Просто встановлюємо нове значення
        pendingUpdates.set(key, value)
      }
    } else {
      // Якщо не об'єкт, просто замінюємо
      pendingUpdates.set(key, value)
    }
    
    // НЕ оновлюємо кеш одразу - дозволяємо компонентам працювати з локальним станом
    // Кеш оновиться тільки після успішного збереження в БД
    
    // Очищаємо попередній timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }
    
    // Встановлюємо новий timeout для збереження
    saveTimeout = setTimeout(() => {
      console.log('[updatePreferencesSection] Timeout вийшов, викликаю flushPendingUpdates')
      flushPendingUpdates()
      saveTimeout = null
    }, SAVE_DEBOUNCE_MS)
  } catch (e) {
    console.error('[updatePreferencesSection] Помилка:', e)
  }
}

/**
 * Отримати API ключі з окремої колонки APIs
 * @returns {Promise<Object|null>} APIs або null
 */
export async function getUserAPIs() {
  try {
    const response = await apiFetch('/api/preferences/apis')
    return response || null
  } catch (e) {
    console.error('getUserAPIs failed:', e)
    return null
  }
}

/**
 * Отримати конкретну секцію налаштувань
 * @param {string} key - Ключ секції
 * @param {*} defaultValue - Значення за замовчуванням
 * @returns {Promise<*>}
 */
export async function getPreferencesSection(key, defaultValue = {}) {
  try {
    // Використовуємо кеш замість нового запиту
    const all = getCachedPreferences() || {}
    return all?.[key] || defaultValue
  } catch (e) {
    console.error('getPreferencesSection failed:', e)
    return defaultValue
  }
}

/**
 * Отримати поточний API Key користувача
 * @returns {Promise<{success: boolean, has_api_key: boolean, api_key: string|null}>}
 */
export async function getApiKey() {
  try {
    const response = await apiFetch('/api/api-key')
    return response || { success: false, has_api_key: false, api_key: null }
  } catch (e) {
    console.error('getApiKey failed:', e)
    return { success: false, has_api_key: false, api_key: null }
  }
}

/**
 * Згенерувати новий API Key
 * @returns {Promise<{success: boolean, api_key: string|null, message: string}>}
 */
export async function generateApiKey() {
  try {
    const response = await apiFetch('/api/generate-api-key', {
      method: 'POST',
      body: JSON.stringify({})
    })
    return response || { success: false, api_key: null, message: 'Failed to generate API key' }
  } catch (e) {
    console.error('generateApiKey failed:', e)
    return { success: false, api_key: null, message: e.message || 'Failed to generate API key' }
  }
}