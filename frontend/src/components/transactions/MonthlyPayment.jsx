import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { X, Plus, Trash2 } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import ConfirmModal from '../ConfirmModal'
import DeleteTxModal from './DeleteTxModal'
import Row from './Row'
import DetailsModal from './DetailsModal'
import CreateTxModal from './CreateTxModal'
import EditTxModal from './EditTxModal'
import TransferModal from './TransferModal'
import { apiFetch, getApiUrl } from '../../utils.jsx'
import { listTransactions, deleteTransaction, archiveTransaction, deleteTransactions, getTransactionCategories } from '../../api/transactions'
import { txBus } from '../../utils/txBus'
import { listCards } from '../../api/cards'
import { useSettingsStore } from '../../store/useSettingsStore'

export default function MonthlyPayment() {
  // Використовуємо новий store
  const settings = useSettingsStore((state) => state.settings)
  const updateNestedSetting = useSettingsStore((state) => state.updateNestedSetting)
  const getNestedSetting = useSettingsStore((state) => state.getNestedSetting)
  const initialized = useSettingsStore((state) => state.initialized)
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
  const [selectedIds, setSelectedIds] = useState(new Set())

  const [showDetails, setShowDetails] = useState(false)
  const [activeTx, setActiveTx] = useState(null)
  const [activeCurrency, setActiveCurrency] = useState(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editTx, setEditTx] = useState(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [hasMore, setHasMore] = useState(true)
  const [pageSize, setPageSize] = useState(10) // Default page size
  const [offset, setOffset] = useState(0)

  // Filter states
  const [transactionType, setTransactionType] = useState('all') // 'all', 'expense', 'income'
  const [selectedCategory, setSelectedCategory] = useState('')
  const [categories, setCategories] = useState([])
  const [filtersLoaded, setFiltersLoaded] = useState(false) // Track if filters are loaded from DB
  const [showUsdt, setShowUsdt] = useState(true) // Show USDT transactions by default

  const listRef = useRef(null)
  const saveFiltersTimeoutRef = useRef(null)
  const lastSavedFiltersRef = useRef(null) // Зберігаємо останні збережені значення

  async function fetchPage({ append = false, search = '', txType = transactionType, category = selectedCategory } = {}) {
    if (append) setLoadingMore(true); else setLoading(true)

    const from = append ? offset : 0
    const to   = from + pageSize - 1

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    
    const [txs, cards] = await Promise.all([
      listTransactions({ from, to, search, transactionType: txType, category, excludeUsdt: !showUsdt }),
      user ? listCards() : []
    ])
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
      setSelectedIds(new Set()) // Очистити вибір при завантаженні нової сторінки
    }
    setHasMore(txs.length === pageSize)
    if (append) setLoadingMore(false); else setLoading(false)
  }

  // Load categories once on mount (не залежить від preferences)
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await getTransactionCategories()
        setCategories(cats || [])
      } catch (e) {
        console.error('Failed to load categories:', e)
      }
    }
    loadCategories()
  }, []) // Завантажуємо тільки один раз при монтуванні

  // Load filters from settings store (окремо від категорій)
  useEffect(() => {
    if (!initialized || !settings) return
    
    try {
      const filters = settings.transactionsFilters || {}
      if (filters.pageSize) {
        setPageSize(filters.pageSize)
      }
      if (filters.transactionType) {
        setTransactionType(filters.transactionType)
      }
      if (filters.category !== undefined) {
        setSelectedCategory(filters.category || '')
      }
      if (typeof filters.showUsdt === 'boolean') {
        setShowUsdt(filters.showUsdt)
      }
      // Зберігаємо початкові значення для порівняння
      lastSavedFiltersRef.current = {
        pageSize: filters.pageSize || 10,
        transactionType: filters.transactionType || 'all',
        category: filters.category || '',
        showUsdt: typeof filters.showUsdt === 'boolean' ? filters.showUsdt : true
      }
      setFiltersLoaded(true)
    } catch (e) {
      console.error('Failed to load filters:', e)
      setFiltersLoaded(true)
    }
  }, [initialized, settings]) // Тільки для фільтрів, не для категорій

  useEffect(() => {
    // Wait for filters to be loaded from DB before fetching
    if (!filtersLoaded) return
    
    fetchPage({ append: false, search: searchQuery, txType: transactionType, category: selectedCategory })
  }, [transactionType, selectedCategory, pageSize, showUsdt, filtersLoaded]) // Re-fetch when filters, page size, or USDT toggle change

  // Subscribe to txBus events to refresh list when transactions are created/updated
  useEffect(() => {
    const unsubscribe = txBus.subscribe((event) => {
      // Refresh transaction list when any transaction event occurs
      // Якщо це нова транзакція (INSERT), оновлюємо список
      if (event?.type === 'INSERT' || event?.type === 'UPDATE' || event?.type === 'DELETE' || !event?.type) {
        fetchPage({ append: false, search: searchQuery, txType: transactionType, category: selectedCategory })
      }
    })
    return unsubscribe
  }, [searchQuery, transactionType, selectedCategory, showUsdt])

  const handleSearch = (query) => {
    setSearchQuery(query)
    setOffset(0)
    fetchPage({ append: false, search: query, txType: transactionType, category: selectedCategory })
  }

  // Save filters to DB when they change (через store з debounce) - тільки якщо значення дійсно змінилося
  useEffect(() => {
    if (!filtersLoaded || !lastSavedFiltersRef.current) return // Don't save until filters are loaded from DB
    
    // Перевіряємо, чи значення дійсно змінилося від збереженого
    const currentFilters = {
      pageSize,
      transactionType,
      category: selectedCategory || '',
      showUsdt
    }
    
    const lastSaved = lastSavedFiltersRef.current
    if (
      currentFilters.pageSize === lastSaved.pageSize &&
      currentFilters.transactionType === lastSaved.transactionType &&
      currentFilters.category === lastSaved.category &&
      currentFilters.showUsdt === lastSaved.showUsdt
    ) {
      return // Нічого не змінилося, не записуємо
    }
    
    // Оновлюємо збережені значення
    lastSavedFiltersRef.current = { ...currentFilters }
    
    // Оновлюємо через store (автоматично зберігається через debounce)
    updateNestedSetting('transactionsFilters', currentFilters)
  }, [pageSize, transactionType, selectedCategory, showUsdt, filtersLoaded, updateNestedSetting])

  const handleFilterChange = (newType, newCategory) => {
    setTransactionType(newType)
    setSelectedCategory(newCategory)
    setOffset(0) // Reset offset when filters change
  }

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize)
    setOffset(0) // Reset offset when page size changes
  }

  const loadMore = () => {
    if (!hasMore || loadingMore) return
    fetchPage({ append: true, search: searchQuery, txType: transactionType, category: selectedCategory })
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
      toast.success('Транзакцію видалено')
    } catch (e) {
      console.error('Delete tx error:', e)
      toast.error('Не вдалося видалити транзакцію')
    } finally {
      setConfirmOpen(false)
      setPendingDelete(null)
    }
  }

  const handleArchive = async () => {
    if (!pendingDelete) return
    try {
      await archiveTransaction(pendingDelete.id)
      setRows(prev => prev.filter(r => r.id !== pendingDelete.id))
      try {
        // inform other components: archived tx reduces balance
        txBus.emit({ card_id: pendingDelete.card_id || null, delta: Number(pendingDelete.amount || 0) * -1 })
      } catch (e) { console.error('emit archive event failed', e) }
      toast.success('Транзакцію архівовано')
    } catch (e) {
      console.error('Archive tx error:', e)
      toast.error('Не вдалося архівувати транзакцію')
    } finally {
      setConfirmOpen(false)
      setPendingDelete(null)
    }
  }

  const handleSaved = (tx) => {
    // prepend saved tx but avoid duplicates by id
    setRows(prev => dedupeById([tx, ...prev]))
  }

  const handleSelect = (txId, checked) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(txId)
      } else {
        newSet.delete(txId)
      }
      return newSet
    })
  }

  const handleSelectAll = (checked) => {
    // Since USDT filtering is now done on backend, we can use rows directly
    if (checked) {
      setSelectedIds(new Set(rows.map(tx => tx.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleBulkDeleteClick = () => {
    if (selectedIds.size === 0) return
    setBulkDeleteOpen(true)
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    
    const idsArray = Array.from(selectedIds)
    setBulkDeleteOpen(false)
    setBulkDeleteLoading(true)
    
    try {
      const result = await deleteTransactions(idsArray)
      
      // Оновити список транзакцій
      setRows(prev => prev.filter(r => !selectedIds.has(r.id)))
      
      // Emit txBus events для кожної видаленої транзакції
      const deletedTxs = rows.filter(tx => selectedIds.has(tx.id))
      deletedTxs.forEach(tx => {
        try {
          txBus.emit({ 
            card_id: tx.card_id || null, 
            delta: Number(tx.amount || 0) * -1 
          })
        } catch (e) { 
          console.error('emit delete event failed', e) 
        }
      })
      
      toast.success(`Видалено ${result.deleted || idsArray.length} транзакцій`)
      setSelectedIds(new Set())
    } catch (e) {
      console.error('Bulk delete error:', e)
      toast.error('Не вдалося видалити транзакції')
    } finally {
      setBulkDeleteLoading(false)
    }
  }

  return (
  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-5 shadow-soft min-h-[400px]">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Recent transactions</div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                className="btn btn-danger text-xs inline-flex items-center gap-1"
                onClick={handleBulkDeleteClick}
                disabled={bulkDeleteLoading}
              >
                {bulkDeleteLoading ? (
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                ) : (
                  <Trash2 size={14} />
                )}
                Видалити ({selectedIds.size})
              </button>
            )}
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
                  // apiFetch automatically adds auth token and handles JSON parsing
                  const data = await apiFetch('/api/syncMonoBank', {
                    method: 'POST',
                    body: JSON.stringify({})
                  }) || {}
                  
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

      {loading && !loadingMore ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500">No transactions yet</div>
      ) : (
        <>
          {rows.length > 0 && (
            <div className="mb-2 pb-2 border-b border-gray-200">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && selectedIds.size === rows.length && rows.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-600">
                      Вибрати всі ({selectedIds.size}/{rows.length})
                    </span>
                  </label>
                  
                  {/* USDT Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showUsdt}
                      onChange={(e) => {
                        const newValue = e.target.checked
                        setShowUsdt(newValue)
                        setSelectedIds(new Set()) // Clear selection when filter changes
                        setOffset(0) // Reset offset when filter changes

                        // Оновлюємо через store (автоматично зберігається через debounce)
                        const currentFilters = settings?.transactionsFilters || {}
                        const filtersToSave = {
                          ...currentFilters,
                          showUsdt: newValue
                        }
                        updateNestedSetting('transactionsFilters', filtersToSave)
                        toast.success('Налаштування збережено')
                      }}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-600">
                      Показувати USDT
                    </span>
                  </label>
                </div>

                  {/* Filters and Page Size */}
                  <div className="flex items-center gap-2 flex-wrap">
                  {/* Page size selector */}
                  <select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={10}>10</option>
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={1000}>1000</option>
                  </select>

                  {/* Transaction type filter */}
                  <select
                    value={transactionType}
                    onChange={(e) => {
                      handleFilterChange(e.target.value, selectedCategory)
                      setSelectedIds(new Set()) // Clear selection when filter changes
                    }}
                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">Всі</option>
                    <option value="expense">Витрати</option>
                    <option value="income">Доходи</option>
                  </select>

                  {/* Category filter */}
                  <select
                    value={selectedCategory}
                    onChange={(e) => {
                      handleFilterChange(transactionType, e.target.value)
                      setSelectedIds(new Set()) // Clear selection when filter changes
                    }}
                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[120px]"
                  >
                    <option value="">Всі категорії</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
          <div ref={listRef} className="space-y-2">
            {rows.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-4">
                Транзакції не знайдено за обраними фільтрами
              </div>
            ) : (
              rows.map((tx) => {
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
                      selected={selectedIds.has(tx.id)}
                      onSelect={handleSelect}
                    />
                  </motion.div>
                )
              })
            )}
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

      <DeleteTxModal
        open={confirmOpen}
        transaction={pendingDelete}
        onDelete={handleDelete}
        onArchive={handleArchive}
        onCancel={() => { setConfirmOpen(false); setPendingDelete(null) }}
      />

      <DeleteTxModal
        open={bulkDeleteOpen}
        transactions={rows.filter(tx => selectedIds.has(tx.id))}
        onDelete={handleBulkDelete}
        onCancel={() => { setBulkDeleteOpen(false) }}
      />
      <Toaster position="top-right" />
    </motion.div>
  )
}
