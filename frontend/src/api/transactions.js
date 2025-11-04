import { supabase } from '../lib/supabase'
import { getCachedSumByCard, invalidateSumByCardCache } from '../utils/dataCache'
import { apiFetch } from '../utils.jsx'

export async function listTransactions({ from = 0, to = 9, search = '' } = {}) {
  const params = new URLSearchParams({
    from: from.toString(),
    to: to.toString(),
    ...(search && { search })
  })

  return await apiFetch(`/api/transactions?${params}`)
}

export async function createTransaction(payload) {
  const data = await apiFetch('/api/transactions', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  
  // Інвалідувати кеш sum by card після створення транзакції
  invalidateSumByCardCache()
  
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

export async function getTransactionCategories() {
  try {
    return await apiFetch('/api/transactions/categories')
  } catch (error) {
    console.error('Failed to fetch categories:', error.message)
    return []
  }
}