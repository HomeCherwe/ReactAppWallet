import { supabase } from '../lib/supabase'
import { getCachedSumByCard, invalidateSumByCardCache } from '../utils/dataCache'
import { apiFetch } from '../utils.jsx'

// Forward declaration для invalidateCategoriesCache
let invalidateCategoriesCacheFn = null

export async function listTransactions({ from = 0, to = 9, search = '', transactionType = 'all', category = '', excludeUsdt = false } = {}) {
  const params = new URLSearchParams({
    from: from.toString(),
    to: to.toString(),
    ...(search && { search }),
    ...(transactionType && transactionType !== 'all' && { transaction_type: transactionType }),
    ...(category && { category }),
    ...(excludeUsdt && { exclude_usdt: 'true' })
  })

  return await apiFetch(`/api/transactions?${params}`)
}

export async function createTransaction(payload) {
  const data = await apiFetch('/api/transactions', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  
  // Інвалідувати кеші після створення транзакції
  invalidateSumByCardCache()
  if (invalidateCategoriesCacheFn) {
    invalidateCategoriesCacheFn()
  }
  
  return data
}

export async function updateTransaction(id, payload) {
  await apiFetch(`/api/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
  
  // Інвалідувати кеш sum by card після оновлення транзакції
  invalidateSumByCardCache()
}

export async function deleteTransaction(id) {
  await apiFetch(`/api/transactions/${id}`, {
    method: 'DELETE'
  })
  
  // Інвалідувати кеш sum by card після видалення транзакції
  invalidateSumByCardCache()
}

export async function archiveTransaction(id) {
  await apiFetch(`/api/transactions/${id}/archive`, {
    method: 'PATCH'
  })
  
  // Інвалідувати кеш sum by card після архівації транзакції
  invalidateSumByCardCache()
}

export async function deleteTransactions(ids) {
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new Error('ids array is required')
  }
  
  const data = await apiFetch('/api/transactions/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ ids })
  })
  
  // Інвалідувати кеш sum by card після видалення транзакцій
  invalidateSumByCardCache()
  
  return data
}


// Внутрішня функція для реального фетча
async function _sumTransactionsByCardInternal() {
  try {
    const result = await apiFetch('/api/transactions/sum-by-card')


    return result || {}
  } catch (error) {
    console.error('Failed to fetch sum by card:', error.message)
    return {}
  }
}

export async function sumTransactionsByCard() {
  // Використовуємо кеш
  return getCachedSumByCard(_sumTransactionsByCardInternal)
}

export async function getTransaction(id) {
  return await apiFetch(`/api/transactions/${id}`)
}

// Кеш для категорій
let categoriesCache = null
let categoriesCacheTimestamp = 0
let categoriesCachePromise = null
const CATEGORIES_CACHE_TTL = 60000 // 60 секунд

/**
 * Отримати категорії транзакцій з кешу або зробити новий запит
 * @returns {Promise<Array>}
 */
export async function getTransactionCategories() {
  const now = Date.now()
  
  // Якщо кеш актуальний, повертаємо його
  if (categoriesCache && (now - categoriesCacheTimestamp) < CATEGORIES_CACHE_TTL) {
    return categoriesCache
  }
  
  // Якщо вже є запит в процесі, чекаємо на нього
  if (categoriesCachePromise) {
    return categoriesCachePromise
  }
  
  // Робимо новий запит
  categoriesCachePromise = (async () => {
    try {
      const categories = await apiFetch('/api/transactions/categories') || []
      categoriesCache = categories
      categoriesCacheTimestamp = now
      categoriesCachePromise = null
      return categories
    } catch (error) {
      console.error('Failed to fetch categories:', error.message)
      categoriesCachePromise = null
      return []
    }
  })()
  
  return categoriesCachePromise
}

/**
 * Інвалідувати кеш категорій (викликати після створення/оновлення транзакції з новою категорією)
 */
export function invalidateCategoriesCache() {
  categoriesCache = null
  categoriesCacheTimestamp = 0
}

// Зберігаємо посилання для використання в createTransaction
invalidateCategoriesCacheFn = invalidateCategoriesCache