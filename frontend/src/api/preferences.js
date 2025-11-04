import { supabase } from '../lib/supabase'
import { apiFetch } from '../utils.jsx'

// Кеш для preferences щоб уникнути дублювання запитів
let preferencesCache = null
let preferencesCachePromise = null

/**
 * Завантажити налаштування користувача з БД
 * @returns {Promise<Object|null>} Preferences або null
 */
export async function getUserPreferences() {
  try {
    // Якщо кеш вже є, повертаємо його
    if (preferencesCache) {
      return preferencesCache
    }
    
    // Якщо вже є запит в процесі, чекаємо на нього
    if (preferencesCachePromise) {
      return preferencesCachePromise
    }
    
    // Робимо новий запит
    preferencesCachePromise = (async () => {
      const preferences = await apiFetch('/api/preferences') || {}
      
      // Зберігаємо в кеш
      preferencesCache = preferences
      preferencesCachePromise = null
      
      return preferences
    })()
    
    return preferencesCachePromise
  } catch (e) {
    console.error('getUserPreferences failed:', e)
    preferencesCachePromise = null
    return null
  }
}

// Функція для інвалідації кешу (викликати після збереження)
export function invalidatePreferencesCache() {
  preferencesCache = null
  preferencesCachePromise = null
}

/**
 * Зберегти налаштування користувача в БД
 * @param {Object} preferences - Об'єкт з налаштуваннями
 * @returns {Promise<void>}
 */
export async function saveUserPreferences(preferences) {
  try {
    await apiFetch('/api/preferences', {
      method: 'POST',
      body: JSON.stringify({ preferences })
    })
    
    // Інвалідувати кеш після збереження
    invalidatePreferencesCache()
  } catch (e) {
    console.error('saveUserPreferences failed:', e)
    // Не викидаємо помилку, щоб не ломати UI
  }
}

/**
 * Оновити частину налаштувань (merge)
 * @param {string} key - Ключ секції (напр. 'chart', 'cards')
 * @param {Object} value - Нове значення для секції
 * @returns {Promise<void>}
 */
export async function updatePreferencesSection(key, value) {
  try {
    // Special handling for apis - save to separate column
    if (key === 'apis' || key === 'APIs') {
      await apiFetch('/api/preferences/apis', {
        method: 'POST',
        body: JSON.stringify({ apis: value })
      })
      invalidatePreferencesCache()
      return
    }
    
    const current = await getUserPreferences()
    const updated = {
      ...current,
      [key]: value
    }
    await saveUserPreferences(updated)
  } catch (e) {
    console.error('updatePreferencesSection failed:', e)
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
    const all = await getUserPreferences()
    return all?.[key] || defaultValue
  } catch (e) {
    console.error('getPreferencesSection failed:', e)
    return defaultValue
  }
}