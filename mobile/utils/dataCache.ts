// Simple in-memory cache with TTL
const CACHE_TTL = 60000 // 60s

interface CacheEntry<T> {
  data: T
  timestamp: number
  promise?: Promise<T>
}

let cardsCache: CacheEntry<any[]> | null = null
let sumByCardCache: CacheEntry<Record<string, any>> | null = null

export function invalidateCardsCache() {
  cardsCache = null
}

export function invalidateSumByCardCache() {
  sumByCardCache = null
}

export async function getCachedCards(fetcher: () => Promise<any[]>): Promise<any[]> {
  const now = Date.now()
  if (cardsCache && (now - cardsCache.timestamp) < CACHE_TTL) return cardsCache.data
  const data = await fetcher()
  cardsCache = { data, timestamp: now }
  return data
}

export async function getCachedSumByCard(
  fetcher: () => Promise<Record<string, any>>
): Promise<Record<string, any>> {
  const now = Date.now()
  if (sumByCardCache && (now - sumByCardCache.timestamp) < CACHE_TTL) return sumByCardCache.data
  const data = await fetcher()
  sumByCardCache = { data, timestamp: now }
  return data
}
