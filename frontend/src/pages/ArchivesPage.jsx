import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { X, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import Row from '../components/transactions/Row'
import { listArchivedTransactions, unarchiveTransaction } from '../api/transactions'
import { listCards } from '../api/cards'
import { txBus } from '../utils/txBus'
import { fmtAmount } from '../utils/format'

export default function ArchivesPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [cardMap, setCardMap] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [unarchivingId, setUnarchivingId] = useState(null)

  // remove duplicates by `id`, preserving first occurrence order
  function dedupeById(arr) {
    const seen = new Set()
    const res = []
    for (const item of arr || []) {
      if (!item || item.id == null) continue
      if (seen.has(item.id)) continue
      seen.add(item.id)
      res.push(item)
    }
    return res
  }

  async function fetchArchived() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const [txs, cards] = await Promise.all([
        listArchivedTransactions({ from: 0, to: 9999, search: searchQuery }),
        user ? listCards() : []
      ])
      
      // map by card id so we can lookup currency by card_id
      const map = {}
      cards.forEach(c => { map[c.id] = c.currency || 'EUR' })
      setCardMap(map)

      // Фільтруємо тільки архівні транзакції (на випадок якщо API повернув не тільки архівні)
      const archivedOnly = (txs || []).filter(tx => {
        return tx.archives === true || tx.archives === 'true' || tx.archives === 1
      })

      // Sort by date (newest first) and group by month
      const sorted = archivedOnly.sort((a, b) => {
        const dateA = new Date(a.created_at)
        const dateB = new Date(b.created_at)
        return dateB - dateA // newest first
      })

      setRows(dedupeById(sorted))
    } catch (e) {
      console.error('Failed to load archived transactions:', e)
      toast.error('Не вдалося завантажити архівні транзакції')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchArchived()
  }, [searchQuery])

  // Subscribe to transaction changes
  useEffect(() => {
    const off = txBus.subscribe(({ type }) => {
      if (type === 'UPDATE' || type === 'DELETE') {
        fetchArchived()
      }
    })
    return off
  }, [])

  const handleUnarchive = async (tx) => {
    if (!tx) return
    setUnarchivingId(tx.id)
    try {
      await unarchiveTransaction(tx.id)
      setRows(prev => prev.filter(r => r.id !== tx.id))
      
      // Emit event to update other components
      try {
        txBus.emit({ 
          type: 'UPDATE',
          card_id: tx.card_id || null, 
          delta: Number(tx.amount || 0) 
        })
      } catch (e) { 
        console.error('emit unarchive event failed', e) 
      }
      
      toast.success('Транзакцію розархівовано')
    } catch (e) {
      console.error('Unarchive tx error:', e)
      toast.error('Не вдалося розархівувати транзакцію')
    } finally {
      setUnarchivingId(null)
    }
  }

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
    const days = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'п\'ятниця', 'субота']
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

  // Check if date is today
  const isToday = (date) => {
    const today = new Date()
    const txDate = new Date(date)
    return today.toDateString() === txDate.toDateString()
  }

  // Group transactions by day
  const groupedByDay = rows.reduce((acc, tx) => {
    const date = new Date(tx.created_at)
    const dayKey = formatDateKey(tx.created_at)
    
    if (!acc[dayKey]) {
      acc[dayKey] = {
        date: tx.created_at,
        dateHeader: isToday(tx.created_at) ? 'СЬОГОДНІ' : formatDateHeader(tx.created_at),
        transactions: [],
        total: 0
      }
    }
    acc[dayKey].transactions.push(tx)
    acc[dayKey].total += Number(tx.amount || 0)
    return acc
  }, {})

  // Sort transactions within each day (newest first)
  Object.keys(groupedByDay).forEach(dayKey => {
    groupedByDay[dayKey].transactions.sort((a, b) => {
      const dateA = new Date(a.created_at)
      const dateB = new Date(b.created_at)
      return dateB - dateA // newest first
    })
  })

  // Sort days (newest first)
  const sortedDays = Object.keys(groupedByDay).sort((a, b) => {
    const dateA = new Date(groupedByDay[a].date)
    const dateB = new Date(groupedByDay[b].date)
    return dateB - dateA // newest first
  })

  const handleSearch = (value) => {
    setSearchQuery(value)
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="bg-white rounded-2xl p-5 shadow-soft min-h-[400px]"
    >
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Архівні транзакції</div>
        </div>

        <form onSubmit={(e) => e.preventDefault()}>
          <div className="relative">
            <input
              type="text"
              placeholder="Пошук по сумі, категорії, банку, опису, даті..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </form>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Завантаження...</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500">Немає архівних транзакцій</div>
      ) : (
        <div className="space-y-6">
          {sortedDays.map((dayKey) => {
            const { dateHeader, transactions, total } = groupedByDay[dayKey]
            const dayCurrency = cardMap[transactions[0]?.card_id] || 'UAH'
            
            return (
              <div key={dayKey} className="space-y-2">
                <div className="flex items-center justify-between mb-3 sticky top-0 bg-white py-2 border-b border-gray-200">
                  <div className="text-sm font-semibold text-gray-700">
                    {dateHeader}
                  </div>
                  <div className={`text-sm font-semibold ${total < 0 ? 'text-orange-500' : 'text-gray-900'}`}>
                    {fmtAmount(total, dayCurrency)}
                  </div>
                </div>
                <div className="space-y-1">
                  {transactions.map((tx, idx) => (
                    <div key={tx.id} className="relative group">
                      <div className="pr-16">
                        <Row
                          tx={tx}
                          currency={cardMap[tx.card_id] || 'EUR'}
                          onSelect={null}
                          selected={false}
                          index={idx}
                          onDetails={null}
                          onAskDelete={null}
                          onEdit={null}
                        />
                      </div>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleUnarchive(tx)
                          }}
                          disabled={unarchivingId === tx.id}
                          className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 disabled:opacity-50"
                          title="Розархівувати"
                        >
                          {unarchivingId === tx.id ? (
                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                          ) : (
                            <RotateCcw size={16} />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}

