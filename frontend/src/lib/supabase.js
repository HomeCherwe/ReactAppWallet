import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Глобальний кеш для user щоб уникнути дублювання запитів
let cachedUser = null

// Кешувати user після успішного отримання
export function cacheUser(userData) {
  cachedUser = userData ? { data: { user: userData } } : null
}

// Оригінальна функція
const originalGetUser = supabase.auth.getUser.bind(supabase.auth)

// Замінюємо getUser з кешуванням - тепер завжди повертаємо з кешу
let getUserCallCount = 0
let getUserCacheHitCount = 0

supabase.auth.getUser = async () => {
  getUserCallCount++
  
  // Завжди повертаємо з кешу якщо він є
  if (cachedUser) {
    getUserCacheHitCount++
    return cachedUser
  }
  
  // Якщо кешу немає, робимо реальний запит
  console.log(`[getUser Cache MISS] Request ${getUserCallCount} - fetching from server...`)
  const result = await originalGetUser()
  
  // Зберігаємо в кеш
  cachedUser = result
  
  return result
}

// Функція для інвалідації кешу (викликати після logout)
export function invalidateUserCache() {
  cachedUser = null
  getUserCallCount = 0
  getUserCacheHitCount = 0
}

// Діагностика кешу
export function getUserCacheStats() {
  return { calls: getUserCallCount, hits: getUserCacheHitCount }
}