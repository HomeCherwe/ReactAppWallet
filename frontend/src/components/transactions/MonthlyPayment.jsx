import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { X, Plus } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import ConfirmModal from '../ConfirmModal'
import Row from './Row'
import DetailsModal from './DetailsModal'
import CreateTxModal from './CreateTxModal'
import EditTxModal from './EditTxModal'
import TransferModal from './TransferModal'
import { getApiUrl } from '../../utils.jsx'
import { listTransactions, deleteTransaction } from '../../api/transactions'
import { txBus } from '../../utils/txBus'

export default function MonthlyPayment() {
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
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [cardMap, setCardMap] = useState({})

  const [showDetails, setShowDetails] = useState(false)
  const [activeTx, setActiveTx] = useState(null)
  const [activeCurrency, setActiveCurrency] = useState(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editTx, setEditTx] = useState(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [hasMore, setHasMore] = useState(true)
  const PAGE = 10
  const [offset, setOffset] = useState(0)

  const listRef = useRef(null)

  async function fetchPage({ append = false, search = '' } = {}) {
    if (append) setLoadingMore(true); else setLoading(true)

    const from = append ? offset : 0
    const to   = from + PAGE - 1

    const [txs, cardsResp] = await Promise.all([
      listTransactions({ from, to, search }),
      supabase.from('cards').select('id, bank, name, currency')
    ])

  const cards = cardsResp.data || []
  // map by card id so we can lookup currency by card_id (transactions store card_id)
  const map = {}
  cards.forEach(c => { map[c.id] = c.currency || 'EUR' })
  setCardMap(map)

    if (append) {
      setRows(prev => dedupeById([...prev, ...txs]))
      setOffset(prev => prev + txs.length)
    } else {
      setRows(dedupeById(txs))
      setOffset(txs.length)
    }
    setHasMore(txs.length === PAGE)
    if (append) setLoadingMore(false); else setLoading(false)
  }

  useEffect(() => { 
    fetchPage({ append: false, search: '' })
  }, [])

  // Subscribe to txBus events to refresh list when transactions are created/updated
  useEffect(() => {
    const unsubscribe = txBus.subscribe(() => {
      // Refresh transaction list when any transaction event occurs
      fetchPage({ append: false, search: searchQuery })
    })
    return unsubscribe
  }, [searchQuery])

  const handleSearch = (query) => {
    setSearchQuery(query)
    setOffset(0)
    fetchPage({ append: false, search: query })
  }

  const loadMore = () => {
    if (!hasMore || loadingMore) return
    fetchPage({ append: true, search: searchQuery })
  }

  const openDetails = (tx, currency) => {
    setActiveTx(tx)
    setActiveCurrency(currency)
    setShowDetails(true)
  }
  const askDelete = (tx) => { setPendingDelete(tx); setConfirmOpen(true) }
  const openEdit = (tx) => { setEditTx(tx); setEditOpen(true) }

  const handleDelete = async () => {
    if (!pendingDelete) return
    try {
      await deleteTransaction(pendingDelete.id)
      setRows(prev => prev.filter(r => r.id !== pendingDelete.id))
      try {
        // inform other components: deleted tx reduces balance
        txBus.emit({ card_id: pendingDelete.card_id || null, delta: Number(pendingDelete.amount || 0) * -1 })
      } catch (e) { console.error('emit delete event failed', e) }
    } catch (e) {
      console.error('Delete tx error:', e)
      alert('Не вдалося видалити транзакцію')
    } finally {
      setConfirmOpen(false)
      setPendingDelete(null)
    }
  }

  const handleSaved = (tx) => {
    // prepend saved tx but avoid duplicates by id
    setRows(prev => dedupeById([tx, ...prev]))
  }

  return (
  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-5 shadow-soft min-h-[400px]">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Recent transactions</div>
          <div className="flex items-center gap-2">
            <button className="btn btn-primary text-xs inline-flex items-center gap-1" onClick={()=>setCreateOpen(true)}>
              <Plus size={14}/> Add
            </button>
            <button className="btn btn-soft text-xs inline-flex items-center gap-1" onClick={()=>setTransferOpen(true)}>
              Transfer
            </button>
            <button
              className={`btn btn-soft text-xs inline-flex items-center gap-2 ${syncLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={async () => {
                if (syncLoading) return
                setSyncLoading(true)
                const toastId = toast.loading('Синхронізація виконується...')
                try {
                  const monoToken = import.meta.env.VITE_MONO_TOKEN || ''
                  const resp = await fetch(`${getApiUrl()}/api/syncMonoBank`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-Token': monoToken
                    },
                    body: JSON.stringify({})
                  })
                  
                  // Try to parse as JSON, fallback to text response for backwards compatibility
                  let data
                  const text = await resp.text()
                  try {
                    data = JSON.parse(text)
                  } catch (parseError) {
                    // If JSON parse fails, it's the old text API format
                    const m = text && text.match(/(\d+)/)
                    const count = m ? Number(m[1]) : 0
                    data = { success: true, count, message: text, transactions: [] }
                  }
                  
                  toast.dismiss(toastId)
                  toast.success(data.count ? `Синхронізовано ${data.count} транзакцій` : 'Синхронізація виконана')
                  
                  // Emit txBus events for each new transaction to update all components
                  if (data.transactions && data.transactions.length > 0) {
                    data.transactions.forEach(tx => {
                      txBus.emit({
                        card_id: tx.card_id || null,
                        delta: Number(tx.amount || 0)
                      })
                    })
                  } else if (data.count > 0) {
                    // If we got count but no transactions array (old API), just refresh the page
                    fetchPage({ append: false, search: searchQuery })
                  }
                } catch (e) {
                  toast.dismiss()
                  toast.error('Помилка синхронізації')
                  console.error('sync error', e)
                } finally {
                  setSyncLoading(false)
                }
              }}
              disabled={syncLoading}
            >
              {syncLoading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
              ) : null}
              <span>SyncBank</span>
            </button>
          </div>
        </div>

        <form onSubmit={(e)=>e.preventDefault()}>
          <div className="relative">
            <input
              type="text"
              placeholder="Пошук по сумі, категорії, банку..."
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

      {loading && !loadingMore ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500">No transactions yet</div>
      ) : (
        <>
          <div ref={listRef} className="space-y-2">
            {rows.map((tx) => {
              // prefer transaction's own currency if present; otherwise use card currency by card_id
              const currency = (tx.currency || cardMap[tx.card_id] || null)
              return (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, y: 10, scale: 0.995 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.25 }}
                >
                  <Row
                    tx={tx}
                    currency={currency}
                    onDetails={openDetails}
                    onAskDelete={askDelete}
                    onEdit={openEdit}
                  />
                </motion.div>
              )
            })}
          </div>

          {hasMore && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={loadMore}
                className="btn btn-soft text-sm inline-flex items-center gap-2"
                disabled={loadingMore}
              >
                {loadingMore ? 'Завантаження…' : 'Завантажити більше'}
              </button>
            </div>
          )}
        </>
      )}

      <DetailsModal
        open={showDetails}
        tx={activeTx}
        currency={activeCurrency}
        onClose={() => setShowDetails(false)}
      />

      <CreateTxModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={handleSaved}
      />

      <TransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onDone={(res) => { fetchPage({ append:false, search: searchQuery }); setTransferOpen(false) }}
      />

      <EditTxModal
        open={editOpen}
        tx={editTx}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => {
          setRows(prev => prev.map(r => r.id === updated.id ? updated : r))
        }}
      />

      <ConfirmModal
        open={confirmOpen}
        danger
        title="Видалити транзакцію?"
        message={
          pendingDelete
            ? `Ви справді хочете видалити транзакцію на суму ${pendingDelete.amount}?`
            : 'Видалити цей запис?'
        }
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        onConfirm={handleDelete}
        onCancel={() => { setConfirmOpen(false); setPendingDelete(null) }}
      />
      <Toaster position="top-right" />
    </motion.div>
  )
}
