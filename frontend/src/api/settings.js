/**
 * Новий API для роботи з налаштуваннями
 * Використовує PATCH-логіку (тільки змінені поля)
 */

import { apiFetch } from '../utils.jsx'

/**
 * Завантажити всі налаштування з БД
 * Використовується тільки при ініціалізації
 */
export async function loadSettings() {
  try {
    const settings = await apiFetch('/api/preferences') || {}
    return settings
  } catch (error) {
    console.error('[loadSettings] Помилка:', error)
    throw error
  }
}

/**
 * Оновити налаштування в БД (PATCH - тільки змінені поля)
 * @param {Object} updates - Об'єкт з полями для оновлення
 * @example
 * updateSettings({ dashboard: { showUsdtInChart: true } })
 * updateSettings({ totals: { section: 1 } })
 */
export async function updateSettings(updates) {
  try {
    const response = await apiFetch('/api/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ updates })
    })
    
    if (response?.success === false) {
      throw new Error(response?.error || 'Помилка збереження')
    }
    
    return response
  } catch (error) {
    console.error('[updateSettings] Помилка:', error)
    throw error
  }
}

/**
 * Отримати API ключі (окрема колонка)
 */
export async function getAPIs() {
  try {
    const response = await apiFetch('/api/preferences/apis')
    return response || null
  } catch (error) {
    console.error('[getAPIs] Помилка:', error)
    return null
  }
}

/**
 * Оновити API ключі
 */
export async function updateAPIs(apis) {
  try {
    const response = await apiFetch('/api/preferences/apis', {
      method: 'POST',
      body: JSON.stringify({ apis })
    })
    
    if (response?.success === false) {
      throw new Error(response?.error || 'Помилка збереження')
    }
    
    return response
  } catch (error) {
    console.error('[updateAPIs] Помилка:', error)
    throw error
  }
}

