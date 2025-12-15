import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import Row from '../components/transactions/Row'
import { listTransactions } from '../api/transactions'
import { listCards } from '../api/cards'
import { apiFetch } from '../utils.jsx'

export default function DebtsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [cardMap, setCardMap] = useState({})

  // Format date for grouping (YYYY-MM-DD)
  const formatDateKey = (date) => {
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Get day name in Ukrainian
  const getDayName = (date) => {
    const days = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота']
    return days[date.getDay()]
  }

  // Format date header (e.g., "16 ВЕРЕСНЯ, ПОНЕДІЛОК")
  const formatDateHeader = (date) => {
    const d = new Date(date)
    const day = d.getDate()
    const month = d.toLocaleDateString('uk-UA', { month: 'long' })
    const dayName = getDayName(d).toUpperCase()
    return `${day} ${month.toUpperCase()}, ${dayName}`
  }

  const isToday = (date) => {
    const today = new Date()
    const txDate = new Date(date)
    return today.toDateString() === txDate.toDateString()
  }

  const parseRefundForFromNote = (note) => {
    if (!note) return null
    const m = String(note).match(/\[refund_for:([0-9a-fA-F-]+)\]/)
    return m ? m[1] : null
  }

  const getRefundParentId = (tx) => {
    if (!tx) return null
    return tx.refund_for || parseRefundForFromNote(tx.note)
  }

  const amountForStats = (tx) => {
    const v = tx?.amount_stat
    if (v === null || v === undefined || v === '') return Number(tx?.amount || 0)
    return Number(v || 0)
  }

  const refundsByParentId = useMemo(() => {
    const map = {}
    for (const tx of rows || []) {
      const parentId = getRefundParentId(tx)
      if (!parentId) continue
      if (!map[parentId]) map[parentId] = []
      map[parentId].push(tx)
    }
    return map
  }, [rows])

  // Hide refund transactions from the top-level list when their parent is present.
  const visibleRows = useMemo(() => {
    const all = rows || []
    const ids = new Set(all.map(t => t?.id).filter(Boolean))
    return all.filter(t => {
      const parentId = getRefundParentId(t)
      if (!parentId) return true
      return !ids.has(parentId)
    })
  }, [rows])

  const groupedByDay = useMemo(() => {
    const acc = {}
    for (const tx of visibleRows || []) {
      const dayKey = formatDateKey(tx.created_at)
      if (!acc[dayKey]) {
        acc[dayKey] = {
          date: tx.created_at,
          dateHeader: isToday(tx.created_at) ? 'СЬОГОДНІ' : formatDateHeader(tx.created_at),
          transactions: []
        }
      }
      acc[dayKey].transactions.push(tx)
    }
    // sort transactions within day newest first
    Object.keys(acc).forEach(k => {
      acc[k].transactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    })
    return acc
  }, [visibleRows])

  const sortedDays = useMemo(() => {
    return Object.keys(groupedByDay).sort((a, b) => new Date(groupedByDay[b].date) - new Date(groupedByDay[a].date))
  }, [groupedByDay])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const [txs, cards] = await Promise.all([
          listTransactions({ from: 0, to: 9999, isDebt: true }),
          user ? listCards() : []
        ])

        const map = {}
        ;(cards || []).forEach(c => { map[c.id] = c.currency || 'EUR' })
        if (!mounted) return
        setCardMap(map)
        // Fetch refund children for loaded debt parents (so nested refunds show like on dashboard)
        const parentIds = (txs || []).map(t => t?.id).filter(Boolean)
        let refundChildren = []
        if (parentIds.length > 0) {
          try {
            const params = new URLSearchParams({
              refund_for_in: parentIds.join(','),
              transaction_type: 'income',
              fields: 'id,created_at,amount,amount_stat,exclude_from_stats,category,note,archives,card,card_id,refund_for,is_debt,debt_party,debt_direction'
            })
            refundChildren = await apiFetch(`/api/transactions?${params}`) || []
          } catch (e) {
            console.error('Failed to load refund children for debts:', e)
          }
        }

        // newest first overall (grouping will sort again inside day)
        const merged = [...(txs || []), ...(refundChildren || [])]
        const sorted = merged.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        setRows(sorted)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-5 shadow-soft">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="text-xl font-semibold">Борги</div>
        </div>

        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-gray-500">Немає боргів</div>
        ) : (
          <div className="space-y-6">
            {sortedDays.map((dayKey) => {
              const day = groupedByDay[dayKey]
              return (
                <div key={dayKey} className="space-y-2">
                  <div className="flex items-center justify-between mb-3 sticky top-0 bg-white py-2 border-b border-gray-200 z-10">
                    <div className="text-sm font-semibold text-gray-700">
                      {day.dateHeader}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {day.transactions.map((tx) => {
                      const currency = (tx.currency || cardMap[tx.card_id] || 'EUR')
                      const displayTx = tx?.debt_party
                        ? { ...tx, category: `Борг · ${tx.debt_party}` }
                        : tx
                      const refundTxs = (refundsByParentId?.[tx.id] || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                      
                      // Calculate amountOverride for main transaction (like on dashboard)
                      let amountOverride = null
                      const originalAmt = Number(tx.amount || 0)
                      const statAmt = amountForStats(tx)
                      if (statAmt !== originalAmt) {
                        const baseCurRaw = (tx.currency || cardMap[tx.card_id] || 'EUR')
                        const baseCur = String(baseCurRaw).toUpperCase() === 'USDT' ? 'USD' : String(baseCurRaw).toUpperCase()
                        amountOverride = { primaryAmount: statAmt, secondaryAmount: originalAmt, currency: baseCur }
                      }
                      
                      return (
                        <div key={tx.id}>
                          <Row
                            tx={displayTx}
                            currency={currency}
                            onDetails={null}
                            onAskDelete={null}
                            onEdit={null}
                            amountOverride={amountOverride}
                          />

                          {/* Nested refunds like on dashboard */}
                          {Number(tx.amount || 0) < 0 && refundTxs.length > 0 && (
                            <div className="mt-1 ml-6 pl-3 border-l-2 border-gray-200 space-y-1">
                              {refundTxs.map((rtx) => {
                                const rCurrency = (rtx.currency || cardMap[rtx.card_id] || 'EUR')
                                return (
                                  <Row
                                    key={rtx.id}
                                    tx={rtx}
                                    currency={rCurrency}
                                    onDetails={null}
                                    onAskDelete={null}
                                    onEdit={null}
                                    compact
                                    className="opacity-90"
                                  />
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </motion.div>
    </div>
  )
}


