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
 * Очистити всі pending оновлення
 * Викликається при завантаженні preferences, щоб не записувати старі дані
 */
export function clearPendingUpdates() {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }
  pendingUpdates.clear()
  console.log('[clearPendingUpdates] Очищено всі pending оновлення')
}

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
    console.log('[saveUserPreferences] ========== ПОЧАТОК ЗБЕРЕЖЕННЯ ==========')
    console.log('[saveUserPreferences] Зберігаю в БД:', JSON.stringify(preferences, null, 2))
    console.log('[saveUserPreferences] skipCacheUpdate:', skipCacheUpdate)
    console.log('[saveUserPreferences] dashboard секція:', JSON.stringify(preferences?.dashboard, null, 2))
    
    const response = await apiFetch('/api/preferences', {
      method: 'POST',
      body: JSON.stringify({ preferences })
    })
    
    console.log('[saveUserPreferences] Відповідь від сервера:', response)
    
    if (!response) {
      throw new Error('Сервер не повернув відповідь')
    }
    
    if (response.error) {
      throw new Error(response.error)
    }
    
    if (response.success === false) {
      throw new Error('Сервер повернув success: false')
    }
    
    console.log('[saveUserPreferences] ✅ Збереження підтверджено сервером')
    
    // Оновлюємо кеш тільки якщо не пропущено (щоб не викликати callback двічі)
    if (!skipCacheUpdate) {
      setCachedPreferences(preferences)
      console.log('[saveUserPreferences] Кеш оновлено з callback')
    } else {
      // Тільки оновлюємо значення без виклику callback
      globalPreferencesCache = preferences
      console.log('[saveUserPreferences] Кеш оновлено без callback')
    }
    
    console.log('[saveUserPreferences] ========== ЗБЕРЕЖЕННЯ ЗАВЕРШЕНО ==========')
  } catch (e) {
    console.error('[saveUserPreferences] ❌ ПОМИЛКА ЗБЕРЕЖЕННЯ:', e)
    console.error('[saveUserPreferences] Stack:', e.stack)
    throw e // Викидаємо помилку, щоб компонент міг її обробити
  }
}

// Promise для відстеження поточного процесу збереження
let currentFlushPromise = null

/**
 * Внутрішня функція для фактичного збереження preferences
 * @returns {Promise<void>}
 */
async function flushPendingUpdates() {
  if (pendingUpdates.size === 0) {
    console.log('[flushPendingUpdates] Немає pending updates, пропускаю')
    return
  }
  
  // Якщо вже йде процес збереження, повертаємо той самий Promise
  if (currentFlushPromise) {
    console.log('[flushPendingUpdates] Вже йде процес збереження, чекаю...')
    return currentFlushPromise
  }
  
  console.log('[flushPendingUpdates] Початок збереження, pending updates:', Array.from(pendingUpdates.entries()))
  
  // Створюємо новий Promise для поточного процесу збереження
  currentFlushPromise = (async () => {
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
        // ВАЖЛИВО: Завжди завантажуємо повні preferences з БД перед збереженням
        // Це гарантує, що ми не втратимо інші секції, які могли змінитися
        // або які не були в кеші
        let current = {}
        try {
          current = await apiFetch('/api/preferences') || {}
          console.log('[flushPendingUpdates] Завантажено повні preferences з БД для merge:', current)
        } catch (e) {
          console.error('[flushPendingUpdates] Помилка завантаження preferences з БД, використовую кеш:', e)
          // Fallback до кешу якщо запит не вдався
          current = getCachedPreferences() || {}
          console.log('[flushPendingUpdates] Використовую кеш:', current)
        }
        
        const updated = { ...current }
        
        // Застосовуємо всі pending оновлення з merge для кожної секції
        for (const [key, value] of pendingUpdates.entries()) {
          console.log('[flushPendingUpdates] Обробляю секцію:', key, 'значення:', value)
          // Якщо значення - об'єкт, merge-имо з існуючими налаштуваннями секції
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            updated[key] = {
              ...(updated[key] || {}),
              ...value
            }
            console.log('[flushPendingUpdates] Merged секцію', key, 'результат:', updated[key])
          } else {
            // Якщо не об'єкт (наприклад, null або примітив), просто замінюємо
            updated[key] = value
            console.log('[flushPendingUpdates] Замінив секцію', key, 'на:', value)
          }
        }
        
        console.log('[flushPendingUpdates] Фінальний об\'єкт для збереження:', JSON.stringify(updated, null, 2))
        console.log('[flushPendingUpdates] Pending updates були:', Array.from(pendingUpdates.entries()))
        
        // Зберігаємо в БД
        await saveUserPreferences(updated, true) // skipCacheUpdate = true, щоб не викликати callback
        console.log('[flushPendingUpdates] Preferences збережено успішно в БД')
        
        // Оновлюємо кеш після успішного збереження (без callback, щоб не перезаписати локальний стан компонентів)
        globalPreferencesCache = updated
        console.log('[flushPendingUpdates] Кеш оновлено')
        
        pendingUpdates.clear()
        console.log('[flushPendingUpdates] Pending updates очищено')
      }
    } catch (e) {
      console.error('[flushPendingUpdates] Помилка збереження:', e)
      pendingUpdates.clear()
      throw e // Прокидаємо помилку далі
    } finally {
      // Очищаємо Promise після завершення
      currentFlushPromise = null
      console.log('[flushPendingUpdates] Процес збереження завершено')
    }
  })()
  
  return currentFlushPromise
}

// Прапорець для відстеження, чи preferences завантажені з БД
let preferencesLoaded = false

/**
 * Встановити прапорець, що preferences завантажені
 * Викликається з PreferencesContext після успішного завантаження
 */
export function setPreferencesLoaded(loaded) {
  preferencesLoaded = loaded
}

/**
 * Оновити частину налаштувань (merge) з debounce
 * @param {string} key - Ключ секції (напр. 'chart', 'cards')
 * @param {Object} value - Нове значення для секції
 * @param {boolean} immediate - Якщо true, зберегти одразу без debounce
 * @returns {Promise<void>} Promise який резолвиться після збереження
 */
export async function updatePreferencesSection(key, value, immediate = false) {
  try {
    // Якщо immediate=true, завжди дозволяємо запис (навіть якщо preferences не завантажені)
    // Це для критичних налаштувань, які мають зберігатися одразу
    if (immediate) {
      console.log('[updatePreferencesSection] ⚠️ Immediate save requested, preferencesLoaded:', preferencesLoaded, 'key:', key, 'value:', value)
      // Якщо preferences не завантажені, встановлюємо прапорець, щоб дозволити запис
      if (!preferencesLoaded) {
        console.log('[updatePreferencesSection] Встановлюю preferencesLoaded=true для immediate save')
        preferencesLoaded = true
      }
    } else {
      // Якщо не immediate, перевіряємо чи preferences завантажені
      if (!preferencesLoaded) {
        console.log('[updatePreferencesSection] Пропускаю запис - preferences ще не завантажені:', key, value)
        return Promise.resolve()
      }
    }
    
    console.log('[updatePreferencesSection] Оновлення:', key, value, 'immediate:', immediate, 'preferencesLoaded:', preferencesLoaded)
    
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
      saveTimeout = null
    }
    
    // Якщо immediate, зберігаємо одразу
    if (immediate) {
      console.log('[updatePreferencesSection] Immediate save requested, pendingUpdates.size:', pendingUpdates.size)
      try {
        await flushPendingUpdates()
        console.log('[updatePreferencesSection] Immediate save completed successfully')
      } catch (error) {
        console.error('[updatePreferencesSection] Immediate save failed:', error)
        throw error
      }
      return
    }
    
    // Встановлюємо новий timeout для збереження
    return new Promise((resolve, reject) => {
      saveTimeout = setTimeout(async () => {
        console.log('[updatePreferencesSection] Timeout вийшов, викликаю flushPendingUpdates')
        try {
          await flushPendingUpdates()
          saveTimeout = null
          resolve()
        } catch (error) {
          saveTimeout = null
          reject(error)
        }
      }, SAVE_DEBOUNCE_MS)
    })
  } catch (e) {
    console.error('[updatePreferencesSection] Помилка:', e)
    throw e
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