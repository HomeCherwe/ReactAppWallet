import { useCallback, useEffect, useRef, useState } from 'react'
import { listFeedTransactions, Transaction } from '../api/transactions'

export type TxFilter = 'all' | 'expense' | 'income'

const PAGE_SIZE = 30

/**
 * Paginated transactions feed: first page on refresh, next pages via loadMore().
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
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState(false)

  const requestId = useRef(0)
  const busy = useRef(false)
  const itemsRef = useRef<Transaction[]>([])
  itemsRef.current = items
  // Auto-loading stops after a failed page until the user taps "retry"
  const failed = useRef(false)

  const fetchPage = (from: number) =>
    listFeedTransactions({
      from,
      to: from + PAGE_SIZE - 1,
      transactionType: filter,
      excludeCardIds: excludeKey ? excludeKey.split(',') : [],
    })

  const refresh = useCallback(async () => {
    const id = ++requestId.current
    busy.current = true
    failed.current = false
    setError(false)
    try {
      const page = await fetchPage(0)
      if (id !== requestId.current) return
      setItems(page)
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
      }
    }
  }, [filter, excludeKey])

  const loadMore = useCallback(async (force = false) => {
    if (busy.current || !hasMore || (failed.current && !force)) return
    failed.current = false
    setError(false)
    const id = requestId.current
    busy.current = true
    setLoadingMore(true)
    try {
      const page = await fetchPage(itemsRef.current.length)
      if (id !== requestId.current) return
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
  }, [hasMore, filter, excludeKey])

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

  return { items, filter, changeFilter, loading, loadingMore, hasMore, error, refresh, loadMore, retry }
}
