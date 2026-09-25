import { useCallback, useEffect, useRef, useState } from 'react'
import { listPinnedTransactions, listRefundsFor, Transaction, updateTransaction } from '../api/transactions'
import { hasPinTag, pinStateOf, withPinTag } from '../utils/pinned'

/**
 * Pinned transactions for the home screen, plus pin/unpin by the "[pinned]" note tag.
 * Waits for `enabled` so excluded cards are known before the first load.
 */
export function usePinnedTransactions({
  excludeCardIds,
  pinnedCategories,
  enabled,
}: {
  excludeCardIds: string[]
  pinnedCategories: string[]
  enabled: boolean
}) {
  const [items, setItems] = useState<Transaction[]>([])
  // Refunds of pinned expenses, by expense id (shown nested under them)
  const [refunds, setRefunds] = useState<Record<string, Transaction[]>>({})
  // Stable dependencies for the id/category lists
  const excludeKey = excludeCardIds.join(',')
  const categoriesKey = pinnedCategories.join('\u0001')
  const requestId = useRef(0)

  const refresh = useCallback(async () => {
    const id = ++requestId.current
    try {
      const list = await listPinnedTransactions({
        pinnedCategories: categoriesKey ? categoriesKey.split('\u0001') : [],
        excludeCardIds: excludeKey ? excludeKey.split(',') : [],
      })
      const kids = await listRefundsFor(list.filter(t => Number(t.amount) < 0).map(t => t.id)).catch(() => [])
      if (id !== requestId.current) return
      const map: Record<string, Transaction[]> = {}
      for (const r of kids) (map[r.refund_for as string] ||= []).push(r)
      setItems(list)
      setRefunds(map)
    } catch (e) {
      console.warn('[Pinned] load failed:', e)
    }
  }, [excludeKey, categoriesKey])

  useEffect(() => {
    if (enabled) refresh()
  }, [enabled, refresh])

  /**
   * Toggles the tag on a transaction. Returns the updated transaction, or null when it's pinned
   * only through its category (that is changed in settings, not per transaction).
   */
  const togglePin = useCallback(
    async (tx: Transaction): Promise<Transaction | null> => {
      const cats = categoriesKey ? categoriesKey.split('\u0001') : []
      if (pinStateOf(tx, cats) === 'category') return null

      const pin = !hasPinTag(tx.note)
      const updated: Transaction = { ...tx, note: withPinTag(tx.note, pin) ?? undefined }

      // Optimistic: show it in / remove it from the pinned strip right away
      setItems(prev =>
        pin
          ? [updated, ...prev.filter(t => t.id !== tx.id)].sort((a, b) => b.created_at.localeCompare(a.created_at))
          : prev.filter(t => t.id !== tx.id)
      )
      try {
        await updateTransaction(tx.id, { note: withPinTag(tx.note, pin) } as Partial<Transaction>)
        return updated
      } catch (e) {
        refresh() // roll back to the server state
        throw e
      }
    },
    [categoriesKey, refresh]
  )

  return { items, refunds, refresh, togglePin }
}
