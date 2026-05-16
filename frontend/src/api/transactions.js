import { supabase } from '../lib/supabase'
import { getCachedSumByCard, invalidateSumByCardCache } from '../utils/dataCache'
import { apiFetch } from '../utils.jsx'

// Forward declaration для invalidateCategoriesCache
let invalidateCategoriesCacheFn = null

export async function listTransactions({ from = 0, to = 9, search = '', transactionType = 'all', category = '', categoryIn = [], hasPinnedTag = false, excludeUsdt = false, isDebt = undefined } = {}) {
  const params = new URLSearchParams({
    from: from.toString(),
    to: to.toString(),
    ...(search && { search }),
    ...(transactionType && transactionType !== 'all' && { transaction_type: transactionType }),
    ...(category && { category }),
    ...(categoryIn && categoryIn.length > 0 && { category_in: categoryIn.join(',') }),
    ...(hasPinnedTag && { has_pinned_tag: 'true' }),
    ...(excludeUsdt && { exclude_usdt: 'true' }),
    ...(typeof isDebt === 'boolean' ? { is_debt: isDebt ? 'true' : 'false' } : {})
  })

  return await apiFetch(`/api/transactions?${params}`)
}

// Debt parties cache
let debtPartiesCache = null
let debtPartiesCacheTimestamp = 0
let debtPartiesCachePromise = null
const DEBT_PARTIES_CACHE_TTL = 60000

export async function getDebtParties() {
  const now = Date.now()
  if (debtPartiesCache && (now - debtPartiesCacheTimestamp) < DEBT_PARTIES_CACHE_TTL) return debtPartiesCache
  if (debtPartiesCachePromise) return debtPartiesCachePromise

  debtPartiesCachePromise = (async () => {
    try {
      const parties = await apiFetch('/api/transactions/debt-parties') || []
      debtPartiesCache = parties
      debtPartiesCacheTimestamp = now
      debtPartiesCachePromise = null
      return parties
    } catch (e) {
      console.error('Failed to fetch debt parties:', e?.message || e)
      debtPartiesCachePromise = null
      return []
    }
  })()

  return debtPartiesCachePromise
}

export function invalidateDebtPartiesCache() {
  debtPartiesCache = null
  debtPartiesCacheTimestamp = 0
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
  invalidateDebtPartiesCache()

  return data
}

export async function updateTransaction(id, payload) {
  await apiFetch(`/api/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })

  // Інвалідувати кеш sum by card після оновлення транзакції
  invalidateSumByCardCache()
  invalidateDebtPartiesCache()
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

export async function unarchiveTransaction(id) {
  await apiFetch(`/api/transactions/${id}/unarchive`, {
    method: 'PATCH'
  })

  // Інвалідувати кеш sum by card після розархівування транзакції
  invalidateSumByCardCache()
}

export async function listArchivedTransactions({ from = 0, to = 999, search = '', transactionType = 'all', category = '', excludeUsdt = false } = {}) {
  const params = new URLSearchParams({
    from: from.toString(),
    to: to.toString(),
    archived: 'true',
    ...(search && { search }),
    ...(transactionType && transactionType !== 'all' && { transaction_type: transactionType }),
    ...(category && { category }),
    ...(excludeUsdt && { exclude_usdt: 'true' })
  })

  return await apiFetch(`/api/transactions?${params}`)
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

/**
 * Отримати транзакції для конкретної підписки
 * @param {string} subscriptionId 
 * @returns {Promise<Array>}
 */
export async function getTransactionsBySubscription(subscriptionId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, amount, created_at, note, category, card, card_id')
    .eq('subscription_id', subscriptionId)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return data
}

/**
 * Scan receipt/bank statement images and extract transactions via AI
 * @param {File[]} files - Array of image files
 * @returns {Promise<Array>} - Array of extracted transactions
 */
export async function scanTransactions(files) {
  const fd = new FormData()
  files.forEach(file => fd.append('images', file))

  const { getApiUrl } = await import('../utils.jsx')
  const apiEndpoint = import.meta.env.PROD
    ? `${getApiUrl()}/api/scan-transactions`
    : '/api/scan-transactions'

  // Get auth token
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const res = await fetch(apiEndpoint, {
    method: 'POST',
    body: fd,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Помилка сканування')
  }

  const data = await res.json()
  return data.transactions || []
}