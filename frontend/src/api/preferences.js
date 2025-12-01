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
    
    
    const response = await apiFetch('/api/preferences', {
      method: 'POST',
      body: JSON.stringify({ preferences })
    })
    
    
    
    if (!response) {
      throw new Error('Сервер не повернув відповідь')
    }
    
    if (response.error) {
      throw new Error(response.error)
    }
    
    if (response.success === false) {
      throw new Error('Сервер повернув success: false')
    }
    
    
    
    // Оновлюємо кеш тільки якщо не пропущено (щоб не викликати callback двічі)
    if (!skipCacheUpdate) {
      setCachedPreferences(preferences)
      
    } else {
      // Тільки оновлюємо значення без виклику callback
      globalPreferencesCache = preferences
      
    }
    
    
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
    
    return
  }
  
  // Якщо вже йде процес збереження, повертаємо той самий Promise
  if (currentFlushPromise) {
    
    return currentFlushPromise
  }
  
  
  // Створюємо новий Promise для поточного процесу збереження
  currentFlushPromise = (async () => {
    try {
      // Special handling for apis - save to separate column
      const apisUpdate = pendingUpdates.get('apis') || pendingUpdates.get('APIs')
      if (apisUpdate !== undefined) {
        
        await apiFetch('/api/preferences/apis', {
          method: 'POST',
          body: JSON.stringify({ apis: apisUpdate })
        })
        pendingUpdates.delete('apis')
        pendingUpdates.delete('APIs')
        invalidatePreferencesCache()
        
      }
      
      // Якщо є інші оновлення (не apis), зберігаємо їх разом
      if (pendingUpdates.size > 0) {
        // ВАЖЛИВО: Завжди завантажуємо повні preferences з БД перед збереженням
        // Це гарантує, що ми не втратимо інші секції, які могли змінитися
        // або які не були в кеші
        let current = {}
        try {
          current = await apiFetch('/api/preferences') || {}
          
        } catch (e) {
          console.error('[flushPendingUpdates] Помилка завантаження preferences з БД, використовую кеш:', e)
          // Fallback до кешу якщо запит не вдався
          current = getCachedPreferences() || {}
          
        }
        
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
        


        
        // Зберігаємо в БД
        await saveUserPreferences(updated, true) // skipCacheUpdate = true, щоб не викликати callback
        
        
        // Оновлюємо кеш після успішного збереження (без callback, щоб не перезаписати локальний стан компонентів)
        globalPreferencesCache = updated
        
        
        pendingUpdates.clear()
        
      }
    } catch (e) {
      console.error('[flushPendingUpdates] Помилка збереження:', e)
      pendingUpdates.clear()
      throw e // Прокидаємо помилку далі
    } finally {
      // Очищаємо Promise після завершення
      currentFlushPromise = null
      
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
      
      // Якщо preferences не завантажені, встановлюємо прапорець, щоб дозволити запис
      if (!preferencesLoaded) {
        
        preferencesLoaded = true
      }
    } else {
      // Якщо не immediate, перевіряємо чи preferences завантажені
      if (!preferencesLoaded) {
        
        return Promise.resolve()
      }
    }
    
    
    
    // Якщо значення - об'єкт, merge-имо з існуючими pending оновленнями для цієї секції
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const existingPending = pendingUpdates.get(key)
      if (existingPending && typeof existingPending === 'object' && !Array.isArray(existingPending)) {
        // Merge з існуючими pending оновленнями
        pendingUpdates.set(key, {
          ...existingPending,
          ...value
        })

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
      
      try {
        await flushPendingUpdates()
        
      } catch (error) {
        console.error('[updatePreferencesSection] Immediate save failed:', error)
        throw error
      }
      return
    }
    
    // Встановлюємо новий timeout для збереження
    return new Promise((resolve, reject) => {
      saveTimeout = setTimeout(async () => {
        
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