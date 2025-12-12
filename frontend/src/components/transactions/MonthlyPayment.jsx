import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
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
import { listTransactions, updateTransaction, deleteTransaction, archiveTransaction, deleteTransactions, getTransactionCategories } from '../../api/transactions'
import { txBus } from '../../utils/txBus'
import { listCards } from '../../api/cards'
import { useSettingsStore } from '../../store/useSettingsStore'
import { fmtAmount } from '../../utils/format'
import useMonoRates from '../../hooks/useMonoRates'

export default function MonthlyPayment() {
  // Використовуємо новий store
  const settings = useSettingsStore((state) => state.settings)
  const updateNestedSetting = useSettingsStore((state) => state.updateNestedSetting)
  const getNestedSetting = useSettingsStore((state) => state.getNestedSetting)
  const initialized = useSettingsStore((state) => state.initialized)
  const rates = useMonoRates()
  const ratesReady = rates && Object.keys(rates).length > 0

  // Конвертація валюти через UAH (як в EarningsChart)
  const convertCurrency = useCallback((amount, fromCurrency, toCurrency) => {
    if (!fromCurrency || fromCurrency === toCurrency) return amount
    if (!ratesReady) return null

    const codeMap = { UAH: 980, USD: 840, EUR: 978, GBP: 826, PLN: 985, CHF: 756, CZK: 203, HUF: 348, USDT: 840 }
    const fromCode = codeMap[fromCurrency] || 980
    const toCode = codeMap[toCurrency] || 980
    if (fromCode === toCode) return amount

    // Конвертуємо через UAH як проміжну валюту
    let inUAH = amount
    if (fromCode !== 980) {
      const rateToUAH = rates[`${fromCode}->980`]
      if (!rateToUAH) return null
      inUAH = amount * rateToUAH
    }

    // Конвертуємо з UAH в цільову валюту
    if (toCode === 980) return inUAH
    const rateFromUAH = rates[`${toCode}->980`]
    if (!rateFromUAH) return null
    return inUAH / rateFromUAH
  }, [rates, ratesReady])
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
  const pageSize = 50 // Increased page size for better infinite scroll
  const [offset, setOffset] = useState(0) // Keep for tracking, but use rows.length for actual fetching

  // Filter states
  const [transactionType, setTransactionType] = useState('all') // 'all', 'expense', 'income'
  const [selectedCategory, setSelectedCategory] = useState('')
  const [categories, setCategories] = useState([])
  const [filtersLoaded, setFiltersLoaded] = useState(false) // Track if filters are loaded from DB
  const [showUsdt, setShowUsdt] = useState(true) // Show USDT transactions by default

  // Refund-linking mode: click refund on expense -> then click income tx to attach as refund
  const [refundPickExpenseId, setRefundPickExpenseId] = useState(null)

  const listRef = useRef(null)
  const saveFiltersTimeoutRef = useRef(null)
  const lastSavedFiltersRef = useRef(null) // Зберігаємо останні збережені значення
  const lastSelectedIndexRef = useRef(null) // Зберігаємо індекс останньої виділеної транзакції для Shift+click
  const shiftKeyPressedRef = useRef(false) // Зберігаємо стан Shift клавіші
  const observerRef = useRef(null) // Для Intersection Observer
  const loadMoreTriggerRef = useRef(null) // Елемент для тригера завантаження
  const offsetRef = useRef(0) // Ref для зберігання поточного offset

  const getRefundExpenseId = (note) => {
    if (!note) return null
    const m = String(note).match(/\[refund_for:([0-9a-fA-F-]+)\]/)
    return m ? m[1] : null
  }

  const ensureRefundTag = (note, expenseId) => {
    const n = String(note || '').trim()
    const tag = `[refund_for:${expenseId}]`
    if (n.includes(tag)) return n
    return n ? `${n} ${tag}` : tag
  }

  const refundsByExpenseId = useMemo(() => {
    const map = {}
    for (const tx of rows || []) {
      const expId = getRefundExpenseId(tx?.note)
      if (!expId) continue
      if (!map[expId]) map[expId] = []
      map[expId].push(tx)
    }
    return map
  }, [rows])

  // ESC cancels refund-pick mode
  useEffect(() => {
    if (!refundPickExpenseId) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setRefundPickExpenseId(null)
        toast('Скасовано режим повернення', { duration: 2000 })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [refundPickExpenseId])

  async function fetchPage({ append = false, search = '', txType = transactionType, category = selectedCategory } = {}) {
    if (append) setLoadingMore(true); else setLoading(true)

    // Use ref for offset to avoid stale closure issues
    const from = append ? offsetRef.current : 0
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
      setRows(prev => {
        const newRows = dedupeById([...prev, ...txs])
        // Update both state and ref - використовуємо довжину нових рядків як новий offset
        const newOffset = newRows.length
        offsetRef.current = newOffset
        setOffset(newOffset)
        // hasMore = true якщо отримали рівно pageSize транзакцій (може бути ще більше)
        // hasMore = false якщо отримали менше ніж pageSize (остання порція) або 0 (немає більше)
        // Але якщо отримали менше ніж pageSize, це може означати останню порцію
        // Тому hasMore = false тільки якщо отримали 0 транзакцій
        const hasMoreData = txs.length > 0
        setHasMore(hasMoreData)
        return newRows
      })
    } else {
      setRows(dedupeById(txs))
      offsetRef.current = txs.length
      setOffset(txs.length)
      setSelectedIds(new Set()) // Очистити вибір при завантаженні нової сторінки
      lastSelectedIndexRef.current = null // Скинути останній виділений індекс
      // hasMore = true якщо отримали хоча б одну транзакцію
      // hasMore = false тільки якщо отримали 0 транзакцій
      const hasMoreData = txs.length > 0
      setHasMore(hasMoreData)
    }
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

  // Відстежуємо стан Shift клавіші глобально
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Shift') {
        shiftKeyPressedRef.current = true
      }
    }
    const handleKeyUp = (e) => {
      if (e.key === 'Shift') {
        shiftKeyPressedRef.current = false
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Load filters from settings store (окремо від категорій)
  useEffect(() => {
    if (!initialized || !settings) return
    
    try {
      const filters = settings.transactionsFilters || {}
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
  }, [transactionType, selectedCategory, showUsdt, filtersLoaded]) // Re-fetch when filters or USDT toggle change

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
    offsetRef.current = 0
    setOffset(0)
    fetchPage({ append: false, search: query, txType: transactionType, category: selectedCategory })
  }

  // Save filters to DB when they change (через store з debounce) - тільки якщо значення дійсно змінилося
  useEffect(() => {
    if (!filtersLoaded || !lastSavedFiltersRef.current) return // Don't save until filters are loaded from DB
    
    // Перевіряємо, чи значення дійсно змінилося від збереженого
    const currentFilters = {
      transactionType,
      category: selectedCategory || '',
      showUsdt
    }
    
    const lastSaved = lastSavedFiltersRef.current
    if (
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
  }, [transactionType, selectedCategory, showUsdt, filtersLoaded, updateNestedSetting])

  const handleFilterChange = (newType, newCategory) => {
    setTransactionType(newType)
    setSelectedCategory(newCategory)
    offsetRef.current = 0 // Reset offset when filters change
    setOffset(0)
  }

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) {
      return
    }
    // Викликаємо fetchPage для завантаження наступної порції
    fetchPage({ append: true, search: searchQuery, txType: transactionType, category: selectedCategory })
  }, [hasMore, loadingMore, searchQuery, transactionType, selectedCategory, showUsdt])

  // Infinite scroll with Intersection Observer
  useEffect(() => {
    // Wait a bit for DOM to update after rows change
    const timeoutId = setTimeout(() => {
      if (!loadMoreTriggerRef.current) {
        // Disconnect observer if trigger not available
        if (observerRef.current) {
          observerRef.current.disconnect()
        }
        return
      }

      // If no more data, disconnect observer
      if (!hasMore) {
        if (observerRef.current) {
          observerRef.current.disconnect()
        }
        return
      }

      // Cleanup previous observer
      if (observerRef.current) {
        observerRef.current.disconnect()
      }

      // Create new observer
      observerRef.current = new IntersectionObserver(
        (entries) => {
          const firstEntry = entries[0]
          if (firstEntry.isIntersecting && hasMore && !loadingMore) {
            // Викликаємо loadMore
            loadMore()
          }
        },
        {
          root: null,
          rootMargin: '500px', // Start loading 500px before reaching the trigger
          threshold: 0.0 // Trigger as soon as any part is visible
        }
      )

      try {
        observerRef.current.observe(loadMoreTriggerRef.current)
      } catch (e) {
        console.error('Failed to observe loadMoreTrigger:', e)
      }
    }, 200) // Small delay to ensure DOM is updated

    return () => {
      clearTimeout(timeoutId)
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [hasMore, loadingMore, loadMore, rows.length])

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
    // Денний підсумок: завжди в EUR
    const amt = Number(tx.amount || 0)
    const txCurRaw = (tx.currency || cardMap[tx.card_id] || 'EUR')
    const txCur = String(txCurRaw).toUpperCase() === 'USDT' ? 'USD' : String(txCurRaw).toUpperCase()
    const inEUR = convertCurrency(amt, txCur, 'EUR')
    if (inEUR != null && !Number.isNaN(inEUR)) {
      acc[dayKey].total += Number(inEUR)
    }
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

  const startRefund = (tx) => {
    if (!tx) return
    const amt = Number(tx.amount || 0)
    if (amt >= 0) {
      toast('Повернення можна прив’язати тільки до витрати (мінус)', { duration: 3500 })
      return
    }
    setRefundPickExpenseId(tx.id)
    toast('Режим повернення: клікни по ДОХІДНІЙ транзакції, яка є поверненням. Esc — скасувати.', { duration: 6000 })
  }

  const pickRefundTx = async (refundTx) => {
    const expenseId = refundPickExpenseId
    if (!expenseId || !refundTx) return

    const amt = Number(refundTx.amount || 0)
    if (amt <= 0) {
      toast('Вибери дохідну транзакцію (плюс), яка є поверненням', { duration: 3500 })
      return
    }

    try {
      const newNote = ensureRefundTag(refundTx.note, expenseId)
      await updateTransaction(refundTx.id, { note: newNote, count_as_income: false, category: 'ПОВЕРНЕННЯ' })

      setRows(prev => prev.map(r => r.id === refundTx.id ? { ...r, note: newNote, count_as_income: false, category: 'ПОВЕРНЕННЯ' } : r))
      toast.success('Повернення прив’язано')
      setRefundPickExpenseId(null)
    } catch (e) {
      console.error('Failed to link refund transaction:', e)
      toast.error('Не вдалося прив’язати повернення')
    }
  }

  const openDetails = (tx, currency) => {
    // If we are in refund-pick mode, clicking any row selects a refund tx instead of opening details
    if (refundPickExpenseId) {
      pickRefundTx(tx)
      return
    }
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
        txBus.emit({ 
          type: 'DELETE',
          card_id: pendingDelete.card_id || null, 
          delta: Number(pendingDelete.amount || 0) * -1 
        })
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
        txBus.emit({ 
          type: 'DELETE',
          card_id: pendingDelete.card_id || null, 
          delta: Number(pendingDelete.amount || 0) * -1 
        })
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

  const handleSelect = (txId, checked, index, event) => {
    // Перевіряємо shiftKey з event або з глобального стану
    const shiftKey = event?.shiftKey || shiftKeyPressedRef.current || false
    
    // Якщо натиснуто Shift і є останній виділений індекс - виділяємо діапазон
    if (shiftKey && lastSelectedIndexRef.current !== null && checked) {
      const startIndex = Math.min(lastSelectedIndexRef.current, index)
      const endIndex = Math.max(lastSelectedIndexRef.current, index)
      
      setSelectedIds(prev => {
        const newSet = new Set(prev)
        // Виділяємо всі транзакції в діапазоні
        for (let i = startIndex; i <= endIndex; i++) {
          if (rows[i]) {
            newSet.add(rows[i].id)
          }
        }
        return newSet
      })
      
      // Оновлюємо останній виділений індекс
      lastSelectedIndexRef.current = index
    } else {
      // Звичайне виділення/зняття виділення
      setSelectedIds(prev => {
        const newSet = new Set(prev)
        if (checked) {
          newSet.add(txId)
          lastSelectedIndexRef.current = index // Зберігаємо індекс останньої виділеної
        } else {
          newSet.delete(txId)
          // Якщо зняли виділення з останньої виділеної - скидаємо ref
          if (lastSelectedIndexRef.current === index) {
            lastSelectedIndexRef.current = null
          }
        }
        return newSet
      })
    }
  }

  const handleSelectAll = (checked) => {
    // Since USDT filtering is now done on backend, we can use rows directly
    if (checked) {
      setSelectedIds(new Set(rows.map(tx => tx.id)))
      // Встановлюємо останній виділений індекс на останній елемент
      if (rows.length > 0) {
        lastSelectedIndexRef.current = rows.length - 1
      }
    } else {
      setSelectedIds(new Set())
      lastSelectedIndexRef.current = null
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
            type: 'DELETE',
            card_id: tx.card_id || null, 
            delta: Number(tx.amount || 0) * -1 
          })
        } catch (e) { 
          console.error('emit delete event failed', e) 
        }
      })
      
      toast.success(`Видалено ${result.deleted || idsArray.length} транзакцій`)
      setSelectedIds(new Set())
      lastSelectedIndexRef.current = null // Reset last selected index
    } catch (e) {
      console.error('Bulk delete error:', e)
      toast.error('Не вдалося видалити транзакції')
    } finally {
      setBulkDeleteLoading(false)
    }
  }

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return
    
    const idsArray = Array.from(selectedIds)
    setBulkDeleteOpen(false)
    setBulkDeleteLoading(true)
    
    try {
      // Архівуємо кожну транзакцію окремо (немає bulk archive API)
      const archivePromises = idsArray.map(id => archiveTransaction(id))
      await Promise.all(archivePromises)
      
      // Оновити список транзакцій
      setRows(prev => prev.filter(r => !selectedIds.has(r.id)))
      
      // Emit txBus events для кожної заархівованої транзакції
      const archivedTxs = rows.filter(tx => selectedIds.has(tx.id))
      archivedTxs.forEach(tx => {
        try {
          txBus.emit({ 
            type: 'DELETE',
            card_id: tx.card_id || null, 
            delta: Number(tx.amount || 0) * -1 
          })
        } catch (e) { 
          console.error('emit archive event failed', e) 
        }
      })
      
      toast.success(`Заархівовано ${idsArray.length} транзакцій`)
      setSelectedIds(new Set())
      lastSelectedIndexRef.current = null // Reset last selected index
    } catch (e) {
      console.error('Bulk archive error:', e)
      toast.error('Не вдалося заархівувати транзакції')
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
                        lastSelectedIndexRef.current = null // Reset last selected index
                        offsetRef.current = 0
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

                  {/* Filters */}
                  <div className="flex items-center gap-2 flex-wrap">
                  {/* Transaction type filter */}
                  <select
                    value={transactionType}
                    onChange={(e) => {
                      handleFilterChange(e.target.value, selectedCategory)
                      setSelectedIds(new Set()) // Clear selection when filter changes
                      lastSelectedIndexRef.current = null // Reset last selected index
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
                      lastSelectedIndexRef.current = null // Reset last selected index
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
          <div ref={listRef} className="space-y-6">
            {rows.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-4">
                Транзакції не знайдено за обраними фільтрами
              </div>
            ) : (
              sortedDays.map((dayKey) => {
                const { dateHeader, transactions, total } = groupedByDay[dayKey]
                const dayCurrency = 'EUR'
                
                return (
                  <div key={dayKey} className="space-y-2">
                    <div className="flex items-center justify-between mb-3 sticky top-0 bg-white py-2 border-b border-gray-200 z-10">
                      <div className="text-sm font-semibold text-gray-700">
                        {dateHeader}
                      </div>
                      <div
                        className={`text-sm font-semibold ${
                          total < 0 ? 'text-rose-600' : total > 0 ? 'text-emerald-600' : 'text-gray-900'
                        }`}
                      >
                        {!ratesReady
                          ? '… EUR'
                          : total > 0
                            ? `+${fmtAmount(total, dayCurrency)}`
                            : total < 0
                              ? `-${fmtAmount(Math.abs(total), dayCurrency)}`
                              : fmtAmount(total, dayCurrency)}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {transactions.map((tx, idx) => {
                        // prefer transaction's own currency if present; otherwise use card currency by card_id
                        const currency = (tx.currency || cardMap[tx.card_id] || 'EUR')
                        const refundTxs = refundsByExpenseId?.[tx.id] || []
                        let amountOverride = null
                        if (refundTxs.length > 0) {
                          const baseCurRaw = (tx.currency || cardMap[tx.card_id] || 'EUR')
                          const baseCur = String(baseCurRaw).toUpperCase() === 'USDT' ? 'USD' : String(baseCurRaw).toUpperCase()
                          let refundSum = 0
                          for (const rtx of refundTxs) {
                            const rAmt = Number(rtx?.amount || 0)
                            if (rAmt <= 0) continue
                            const rCurRaw = (rtx.currency || cardMap[rtx.card_id] || 'EUR')
                            const rCur = String(rCurRaw).toUpperCase() === 'USDT' ? 'USD' : String(rCurRaw).toUpperCase()
                            if (rCur === baseCur) {
                              refundSum += rAmt
                              continue
                            }
                            const converted = convertCurrency(rAmt, rCur, baseCur)
                            if (converted != null && !Number.isNaN(converted)) refundSum += Number(converted)
                          }
                          if (refundSum !== 0) {
                            const originalAmt = Number(tx.amount || 0)
                            const netAmt = originalAmt + refundSum
                            amountOverride = { primaryAmount: netAmt, secondaryAmount: originalAmt, currency: baseCur }
                          }
                        }
                        // Find original index in rows array for selection handling
                        const originalIndex = rows.findIndex(r => r.id === tx.id)
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
                              onRefund={startRefund}
                              amountOverride={amountOverride}
                              selected={selectedIds.has(tx.id)}
                              onSelect={(txId, checked, event) => handleSelect(txId, checked, originalIndex, event)}
                            />
                          </motion.div>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            )}
            
            {/* Infinite scroll trigger - always render when hasMore, even if empty */}
            {hasMore && (
              <div 
                ref={loadMoreTriggerRef} 
                className="py-8 text-center min-h-[200px] flex items-center justify-center"
                style={{ minHeight: '200px' }}
              >
                {loadingMore ? (
                  <div className="text-sm text-gray-500">
                    <svg className="w-5 h-5 animate-spin mx-auto" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                    </svg>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Прокрутіть вниз для завантаження більше... (Завантажено: {rows.length})</div>
                )}
              </div>
            )}
          </div>
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
        onArchive={handleBulkArchive}
        onCancel={() => { setBulkDeleteOpen(false) }}
      />
      <Toaster position="top-right" />
    </motion.div>
  )
}

