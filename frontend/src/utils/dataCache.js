// Глобальний кеш для даних щоб уникнути дублювання запитів

// Кеш карток
let cachedCards = null
let cardsCacheTimestamp = 0
let cardsCachePromise = null
const CARDS_CACHE_TTL = 30000 // 30 секунд

// Кеш транзакцій
let cachedTransactions = null
let transactionsCacheTimestamp = 0
let transactionsCachePromise = null
const TRANSACTIONS_CACHE_TTL = 5000 // 5 секунд

// Кеш для sum by card
let cachedSumByCard = null
let sumByCardTimestamp = 0
let sumByCardPromise = null
const SUM_BY_CARD_CACHE_TTL = 10000 // 10 секунд

/**
 * Отримати картки з кешу або зробити новий запит
 * @param {Function} fetchFunction - Функція для фетча карток
 * @returns {Promise<Array>}
 */
export async function getCachedCards(fetchFunction) {
  const now = Date.now()
  
  // Якщо кеш актуальний, повертаємо його
  if (cachedCards && (now - cardsCacheTimestamp) < CARDS_CACHE_TTL) {
    return cachedCards
  }
  
  // Якщо вже є запит в процесі, чекаємо на нього
  if (cardsCachePromise) {
    return cardsCachePromise
  }
  
  // Робимо новий запит
  cardsCachePromise = fetchFunction().then(result => {
    cachedCards = result
    cardsCacheTimestamp = now
    cardsCachePromise = null
    return result
  }).catch(err => {
    cardsCachePromise = null
    throw err
  })
  
  return cardsCachePromise
}

/**
 * Отримати транзакції з кешу або зробити новий запит
 * @param {Function} fetchFunction - Функція для фетча транзакцій
 * @returns {Promise<Array>}
 */
export async function getCachedTransactions(fetchFunction) {
  const now = Date.now()
  
  // Якщо кеш актуальний, повертаємо його
  if (cachedTransactions && (now - transactionsCacheTimestamp) < TRANSACTIONS_CACHE_TTL) {
    return cachedTransactions
  }
  
  // Якщо вже є запит в процесі, чекаємо на нього
  if (transactionsCachePromise) {
    return transactionsCachePromise
  }
  
  // Робимо новий запит
  transactionsCachePromise = fetchFunction().then(result => {
    cachedTransactions = result
    transactionsCacheTimestamp = now
    transactionsCachePromise = null
    return result
  }).catch(err => {
    transactionsCachePromise = null
    throw err
  })
  
  return transactionsCachePromise
}

/**
 * Інвалідувати кеш карток
 */
export function invalidateCardsCache() {
  cachedCards = null
  cardsCacheTimestamp = 0
}

/**
 * Інвалідувати кеш транзакцій
 */
export function invalidateTransactionsCache() {
  cachedTransactions = null
  transactionsCacheTimestamp = 0
}

/**
 * Отримати sum by card з кешу або зробити новий запит
 * @param {Function} fetchFunction - Функція для фетча sum by card
 * @returns {Promise<Object>}
 */
export async function getCachedSumByCard(fetchFunction) {
  const now = Date.now()
  
  // Якщо кеш актуальний, повертаємо його
  if (cachedSumByCard && (now - sumByCardTimestamp) < SUM_BY_CARD_CACHE_TTL) {
    return cachedSumByCard
  }
  
  // Якщо вже є запит в процесі, чекаємо на нього
  if (sumByCardPromise) {
    return sumByCardPromise
  }
  
  // Робимо новий запит
  sumByCardPromise = fetchFunction().then(result => {
    cachedSumByCard = result
    sumByCardTimestamp = now
    sumByCardPromise = null
    return result
  }).catch(err => {
    sumByCardPromise = null
    throw err
  })
  
  return sumByCardPromise
}

/**
 * Інвалідувати кеш sum by card
 */
export function invalidateSumByCardCache() {
  cachedSumByCard = null
  sumByCardTimestamp = 0
}

/**
 * Інвалідувати всі кеші (викликати після змін)
 */
export function invalidateAllCache() {
  invalidateCardsCache()
  invalidateTransactionsCache()
  invalidateSumByCardCache()
}

