import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listFeedTransactions, listRefundsFor, searchTransactions, Transaction } from '../api/transactions'
import { PeriodId, periodRange } from '../utils/periods'

export type TxFilter = 'all' | 'expense' | 'income'

export interface FeedSearch {
  query: string
  setQuery: (q: string) => void
  period: PeriodId
  setPeriod: (p: PeriodId) => void
  cardId: string | null
  setCardId: (id: string | null) => void
  category: string | null
  setCategory: (c: string | null) => void
  /** A query or a period/card/category filter is applied */
  active: boolean
  searching: boolean
  reset: () => void
}

const PAGE_SIZE = 30
// Typing: the server is asked once the user pauses
const SEARCH_DEBOUNCE_MS = 300

/**
 * Paginated transactions feed: first page on refresh, next pages via loadMore().
 * With a search query or a period/card/category filter the pages come from the server-side
 * search (search_transactions); otherwise from the plain feed query.
 * Stale responses (after a filter change / refresh) are dropped by request id.
 */
export function useTransactionFeed({
  excludeCardIds,
  enabled = true,
}: {
  excludeCardIds: string[]
  /** Wait until the exclusion list is known, so excluded transactions never flash in */
  enabled?: boolean
}) {
  // Stable dependency for the id list
  const excludeKey = excludeCardIds.join(',')
  const [items, setItems] = useState<Transaction[]>([])
  const [filter, setFilter] = useState<TxFilter>('all')
  // Search: the query as typed, and as sent (after the pause)
  const [query, setQuery] = useState('')
  const [sentQuery, setSentQuery] = useState('')
  const [period, setPeriod] = useState<PeriodId>('all')
  const [cardId, setCardId] = useState<string | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const searchActive = sentQuery !== '' || period !== 'all' || !!cardId || !!category
  // A search/filter change is loading (the old results stay on screen meanwhile)
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState(false)
  // Refunds of the loaded expenses, by expense id (shown nested under them, like the web)
  const [refunds, setRefunds] = useState<Record<string, Transaction[]>>({})

  const requestId = useRef(0)
  const busy = useRef(false)
  const itemsRef = useRef<Transaction[]>([])
  itemsRef.current = items
  // Auto-loading stops after a failed page until the user taps "retry"
  const failed = useRef(false)

  const fetchRefunds = async (page: Transaction[]) => {
    const ids = page.filter(t => Number(t.amount) < 0).map(t => t.id)
    try {
      const list = await listRefundsFor(ids)
      const map: Record<string, Transaction[]> = {}
      for (const r of list) (map[r.refund_for as string] ||= []).push(r)
      return map
    } catch (e) {
      console.warn('[Feed] refunds load failed:', e)
      return {}
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setSentQuery(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  const fetchPage = (from: number) => {
    const excludeCardIds = excludeKey ? excludeKey.split(',') : []
    if (!searchActive) {
      return listFeedTransactions({ from, to: from + PAGE_SIZE - 1, transactionType: filter, excludeCardIds })
    }
    return searchTransactions({
      offset: from,
      limit: PAGE_SIZE,
      query: sentQuery,
      ...periodRange(period),
      cardIds: cardId ? [cardId] : [],
      categories: category ? [category] : [],
      transactionType: filter,
      excludeCardIds,
    })
  }

  const refresh = useCallback(async () => {
    const id = ++requestId.current
    busy.current = true
    failed.current = false
    setError(false)
    setSearching(true)
    try {
      const page = await fetchPage(0)
      const pageRefunds = await fetchRefunds(page)
      if (id !== requestId.current) return
      setItems(page)
      setRefunds(pageRefunds)
      setHasMore(page.length === PAGE_SIZE)
    } catch {
      if (id === requestId.current) {
        failed.current = true
        setError(true)
      }
    } finally {
      if (id === requestId.current) {
        busy.current = false
        setLoading(false)
        setSearching(false)
      }
    }
  }, [filter, excludeKey, searchActive, sentQuery, period, cardId, category])

  const loadMore = useCallback(async (force = false) => {
    if (busy.current || !hasMore || (failed.current && !force)) return
    failed.current = false
    setError(false)
    const id = requestId.current
    busy.current = true
    setLoadingMore(true)
    try {
      const page = await fetchPage(itemsRef.current.length)
      const pageRefunds = await fetchRefunds(page)
      if (id !== requestId.current) return
      setRefunds(prev => ({ ...prev, ...pageRefunds }))
      setItems(prev => {
        const seen = new Set(prev.map(t => t.id))
        return [...prev, ...page.filter(t => !seen.has(t.id))]
      })
      setHasMore(page.length === PAGE_SIZE)
    } catch {
      if (id === requestId.current) {
        failed.current = true
        setError(true)
      }
    } finally {
      if (id === requestId.current) {
        busy.current = false
        setLoadingMore(false)
      }
    }
  }, [hasMore, filter, excludeKey, searchActive, sentQuery, period, cardId, category])

  const changeFilter = useCallback((next: TxFilter) => {
    if (next === filter) return
    setFilter(next)
    setLoading(true)
    setItems([])
    setHasMore(true)
  }, [filter])

  // (Re)load the first page whenever the filter or options change
  useEffect(() => {
    if (enabled) refresh()
  }, [refresh, enabled])

  const retry = useCallback(() => {
    if (itemsRef.current.length === 0) {
      setLoading(true)
      refresh()
    } else {
      loadMore(true)
    }
  }, [refresh, loadMore])

  /** Back to the plain feed (✕ in the search field / "Скинути") */
  const resetSearch = useCallback(() => {
    setQuery('')
    setSentQuery('')
    setPeriod('all')
    setCardId(null)
    setCategory(null)
  }, [])

  // Stable between renders, so the memoized list doesn't re-render for nothing
  const typing = query.trim() !== sentQuery
  const search: FeedSearch = useMemo(
    () => ({
      query,
      setQuery,
      period,
      setPeriod,
      cardId,
      setCardId,
      category,
      setCategory,
      active: searchActive,
      // Also while the user is still typing (before the pause sends the query)
      searching: searching || typing,
      reset: resetSearch,
    }),
    [query, period, cardId, category, searchActive, searching, typing, resetSearch]
  )

  return { items, refunds, filter, changeFilter, loading, loadingMore, hasMore, error, refresh, loadMore, retry, search }
}
