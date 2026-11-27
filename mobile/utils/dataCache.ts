// Simple in-memory cache with TTL
const CACHE_TTL = 60000 // 60s

interface CacheEntry<T> {
  data: T
  timestamp: number
  promise?: Promise<T>
}

let cardsCache: CacheEntry<any[]> | null = null
let sumByCardCache: CacheEntry<Record<string, any>> | null = null
let sumByCardGeneration = 0

export function invalidateCardsCache() {
  cardsCache = null
}

export function invalidateSumByCardCache() {
  sumByCardCache = null
  sumByCardGeneration++
}

/** Home's /api/home brought the cards: other screens use them without a second download */
export function primeCardsCache(data: any[]) {
  cardsCache = { data, timestamp: Date.now() }
}

/** …and the sum of each card */
export function primeSumByCardCache(data: Record<string, any>) {
  sumByCardCache = { data, timestamp: Date.now() }
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
  const generation = sumByCardGeneration
  const data = await fetcher()
  // Transactions changed while this was on its way: the answer is already old, don't keep it
  if (generation === sumByCardGeneration) sumByCardCache = { data, timestamp: now }
  return data
}
