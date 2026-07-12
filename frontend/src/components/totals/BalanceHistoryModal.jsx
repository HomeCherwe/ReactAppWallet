import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, Wallet, CreditCard, PiggyBank, Globe, X, BarChart2, ChevronLeft, ChevronRight } from 'lucide-react'
import { createPortal } from 'react-dom'
import { fetchBalanceHistory } from '../../api/totals'
import { useScrollLock } from '../../hooks/useScrollLock'
import useMonoRates from '../../hooks/useMonoRates'
import { apiFetch } from '../../utils.jsx'
import { listCards } from '../../api/cards'

// ─── constants ────────────────────────────────────────────────────────────────

const PERIODS = [
  { key: 'day',   label: 'Дні'    },
  { key: 'week',  label: 'Тижні'  },
  { key: 'month', label: 'Місяці' },
  { key: 'year',  label: 'Роки'   },
]

const BUCKET_META = {
  all:     { label: 'Загалом',     icon: Globe,      gradFrom: '#6366f1', gradTo: '#8b5cf6', textCls: 'text-indigo-600',  bgCls: 'bg-indigo-50',  borderCls: 'border-indigo-200' },
  cash:    { label: 'Готівка',     icon: Wallet,     gradFrom: '#10b981', gradTo: '#059669', textCls: 'text-emerald-600', bgCls: 'bg-emerald-50', borderCls: 'border-emerald-200' },
  cards:   { label: 'Карти',       icon: CreditCard, gradFrom: '#3b82f6', gradTo: '#6366f1', textCls: 'text-blue-600',   bgCls: 'bg-blue-50',    borderCls: 'border-blue-200' },
  savings: { label: 'Заощадження', icon: PiggyBank,  gradFrom: '#a855f7', gradTo: '#ec4899', textCls: 'text-purple-600', bgCls: 'bg-purple-50',  borderCls: 'border-purple-200' },
}

const CUR_SYM = { UAH: '₴', EUR: '€', USD: '$', GBP: '£', PLN: 'zł', CHF: 'Fr', CZK: 'Kč', HUF: 'Ft' }

// ─── Formatters ───────────────────────────────────────────────────────────────

function symOf(currency) { return CUR_SYM[currency] || currency }

function fmtCompact(val, currency) {
  if (val == null) return '—'
  const sym = symOf(currency)
  const abs = Math.abs(val)
  let s
  if (abs >= 1_000_000)   s = (val / 1_000_000).toFixed(1) + 'M'
  else if (abs >= 10_000) s = (val / 1_000).toFixed(0) + 'k'
  else if (abs >= 1_000)  s = (val / 1_000).toFixed(1) + 'k'
  else                    s = val.toFixed(0)
  return `${sym}${s}`
}

function fmtFull(val, currency) {
  if (val == null) return '—'
  return `${symOf(currency)}${val.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateStr, period) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (period === 'day') {
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  if (period === 'year') return d.getFullYear().toString()
  if (period === 'week') {
    const d2 = new Date(d)
    d2.setDate(d.getDate() + 6)
    return `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')} – ${d2.getDate()}.${String(d2.getMonth()+1).padStart(2,'0')}`
  }
  return d.toLocaleDateString('uk-UA', { month: 'short', year: 'numeric' })
}

function formatShortDate(dateStr, period) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (period === 'day') {
    return `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}`
  }
  if (period === 'year') return d.getFullYear().toString()
  if (period === 'week') return `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}`
  return d.toLocaleDateString('uk-UA', { month: 'short' }).replace('.', '')
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, period, currency }) {
  if (!active || !payload?.length) return null
  const val     = payload[0]?.value ?? 0
  const income  = payload[0]?.payload?.income ?? 0
  const expense = payload[0]?.payload?.expense ?? 0
  const change  = payload[0]?.payload?.change ?? 0
  
  const isPos  = change > 0

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden pointer-events-none"
      style={{ backdropFilter: 'blur(8px)', minWidth: 170 }}
    >
      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{formatDate(label, period)}</div>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <div>
          <div className="text-[10px] text-gray-400 font-semibold leading-none mb-0.5">Баланс</div>
          <div className="text-gray-900 font-extrabold text-sm">{fmtFull(val, currency)}</div>
        </div>
        
        {(income !== 0 || expense !== 0) && (
          <div className="pt-1.5 border-t border-gray-100 flex flex-col gap-1 text-[11px]">
            {income > 0 && (
              <div className="flex justify-between items-center gap-4 text-emerald-600 font-medium">
                <span>Надійшло</span>
                <span>+{fmtFull(income, currency)}</span>
              </div>
            )}
            {expense < 0 && (
              <div className="flex justify-between items-center gap-4 text-red-500 font-medium">
                <span>Витрачено</span>
                <span>{fmtFull(expense, currency)}</span>
              </div>
            )}
            <div className="flex justify-between items-center gap-4 text-gray-500 font-bold pt-0.5">
              <span>Чистий рух</span>
              <span className={isPos ? 'text-emerald-600' : change < 0 ? 'text-red-500' : 'text-gray-500'}>
                {isPos ? '+' : ''}{fmtFull(change, currency)}
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── Stat mini-card ───────────────────────────────────────────────────────────

function StatMini({ label, value, currency, borderCls }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 bg-white border ${borderCls || 'border-gray-200'} shadow-sm text-center`}>
      <div className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-gray-800 text-xs font-bold leading-snug">{fmtFull(value, currency)}</div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

/**
 * @param {{ open, onClose, bucket, sectionTitle, initialCurrency, totals }} props
 */
export default function BalanceHistoryModal({
  open, onClose,
  bucket = 'all',
  sectionTitle,
  initialCurrency = 'UAH',
  totals = {}
}) {
  const [period, setPeriod] = useState('month')
  const [activeCurrency, setActiveCurrency] = useState(initialCurrency)
  
  // Navigation states
  const [referenceDate, setReferenceDate] = useState(() => new Date())
  const [minDate, setMinDate] = useState('2024-03-01')

  // Drilldown states
  const [selectedPoint, setSelectedPoint] = useState(null)
  const [periodTxs, setPeriodTxs] = useState([])
  const [loadingTxs, setLoadingTxs] = useState(false)
  const [cards, setCards] = useState([])

  // Raw changes and futureChanges from backend
  const [changes, setChanges] = useState([])
  const [futureChanges, setFutureChanges] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  useScrollLock(open, 400)

  // Fetch cards list
  useEffect(() => {
    if (open) {
      listCards().then(setCards).catch(console.error)
    }
  }, [open])

  // Reset selectedPoint when switching parameters
  useEffect(() => {
    setSelectedPoint(null)
    setPeriodTxs([])
  }, [period, activeCurrency, bucket, referenceDate])

  // Reset active currency and referenceDate when modal opens or initialCurrency changes
  useEffect(() => {
    if (open) {
      setActiveCurrency(initialCurrency)
      setReferenceDate(new Date())
    }
  }, [open, initialCurrency])

  // Get current balance of selected currency in this bucket
  const currentBalance = useMemo(() => {
    return totals[activeCurrency] ?? 0
  }, [totals, activeCurrency])

  // Get all currencies containing non-zero balance in this bucket to show switcher
  const currencies = useMemo(() => {
    const list = Object.keys(totals || {}).filter(c => Math.abs(totals[c] || 0) > 0.01)
    if (activeCurrency && !list.includes(activeCurrency)) {
      list.push(activeCurrency)
    }
    return list
  }, [totals, activeCurrency])

  // Escape key listener
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Calculate window start and end dates based on period and referenceDate
  const dateRange = useMemo(() => {
    const end = new Date(referenceDate)
    const start = new Date(referenceDate)
    
    if (period === 'day') {
      start.setDate(start.getDate() - 30)
    } else if (period === 'week') {
      start.setDate(start.getDate() - 12 * 7)
    } else if (period === 'year') {
      start.setFullYear(start.getFullYear() - 5)
    } else {
      // month
      start.setMonth(start.getMonth() - 12)
    }
    
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return {
      start: fmt(start),
      end: fmt(end)
    }
  }, [period, referenceDate])

  // Fetch net changes per period from backend based on dateRange
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchBalanceHistory({ 
      bucket, 
      period, 
      currency: activeCurrency,
      start: dateRange.start,
      end: dateRange.end
    })
      .then(res => {
        if (!cancelled) {
          setChanges(res.changes || [])
          setFutureChanges(res.futureChanges || [])
          if (res.minDate) {
            setMinDate(res.minDate)
          }
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) { setError(err.message || 'Помилка завантаження'); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [open, bucket, period, activeCurrency, dateRange])

  const meta       = BUCKET_META[bucket] || BUCKET_META.all
  const BucketIcon = meta.icon
  const chartColor = meta.gradFrom

  // Exchange rates for frontend currency conversion
  const rates = useMonoRates()

  const convertCurrency = (amount, fromCur, toCur) => {
    fromCur = fromCur === 'USDT' ? 'USD' : fromCur
    toCur   = toCur   === 'USDT' ? 'USD' : toCur
    if (fromCur === toCur) return amount

    let amountInUAH = amount
    if (fromCur !== 'UAH') {
      const codeMap = { USD: '840', EUR: '978', GBP: '826', PLN: '985', CHF: '756', CZK: '203', HUF: '348' }
      const fromCode = codeMap[fromCur]
      const rate = rates[`${fromCode}->980`]
      if (!rate) return amount
      amountInUAH = amount * rate
    }

    if (toCur === 'UAH') return amountInUAH

    const codeMap = { USD: '840', EUR: '978', GBP: '826', PLN: '985', CHF: '756', CZK: '203', HUF: '348' }
    const toCode = codeMap[toCur]
    const rateToUAH = rates[`${toCode}->980`]
    if (!rateToUAH) return amountInUAH
    return amountInUAH / rateToUAH
  }

  // Reconstruct running balance starting backwards from known currentBalance adjusting for future changes
  const chartData = useMemo(() => {
    if (!changes.length) return []

    // Group raw changes by date, converting them to activeCurrency on frontend
    const dateMap = {}
    for (const item of changes) {
      if (bucket !== 'all' && item.currency !== activeCurrency) {
        continue
      }
      const convertedIncome = convertCurrency(item.income || 0, item.currency, activeCurrency)
      const convertedExpense = convertCurrency(item.expense || 0, item.currency, activeCurrency)
      
      if (!dateMap[item.date]) {
        dateMap[item.date] = { income: 0, expense: 0 }
      }
      dateMap[item.date].income += convertedIncome
      dateMap[item.date].expense += convertedExpense
    }

    // Generate full list of periods from window start to end (avoiding gaps)
    const windowStart = new Date(dateRange.start)
    const minD = new Date(minDate)
    const activeStart = windowStart < minD ? minD : windowStart
    const windowEnd = new Date(dateRange.end)
    const allPeriods = []
    const cursor = new Date(activeStart)
    while (cursor <= windowEnd) {
      let key = ''
      if (period === 'day') {
        key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
      } else if (period === 'week') {
        const day = cursor.getDay() === 0 ? 7 : cursor.getDay()
        const monday = new Date(cursor)
        monday.setDate(cursor.getDate() - day + 1)
        key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
      } else if (period === 'year') {
        key = `${cursor.getFullYear()}-01-01`
      } else {
        key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01`
      }
      allPeriods.push(key)

      if (period === 'day')       cursor.setDate(cursor.getDate() + 1)
      else if (period === 'week') cursor.setDate(cursor.getDate() + 7)
      else if (period === 'year') cursor.setFullYear(cursor.getFullYear() + 1)
      else                        cursor.setMonth(cursor.getMonth() + 1)
    }

    const uniquePeriods = [...new Set(allPeriods)]

    // Map unique periods to their net converted changes
    const periodChanges = uniquePeriods.map(p => {
      const dayData = dateMap[p] || { income: 0, expense: 0 }
      return {
        date: p,
        income: dayData.income,
        expense: dayData.expense,
        change: dayData.income + dayData.expense
      }
    })

    // Calculate sum of future changes (from end date to today) to correctly anchor the balance
    let futureChangesSum = 0
    if (futureChanges && futureChanges.length > 0) {
      for (const fc of futureChanges) {
        if (bucket !== 'all' && fc.currency !== activeCurrency) continue
        const converted = convertCurrency(fc.change || 0, fc.currency, activeCurrency)
        futureChangesSum += converted
      }
    }

    const balanceAtEnd = currentBalance - futureChangesSum
    const sumOfChangesInWindow = periodChanges.reduce((s, p) => s + p.change, 0)
    const startingBalance = balanceAtEnd - sumOfChangesInWindow
    let running = startingBalance

    return periodChanges.map(p => {
      running += p.change
      return {
        date: p.date,
        balance: running,
        income: p.income,
        expense: p.expense,
        change: p.change
      }
    })
  }, [changes, futureChanges, currentBalance, activeCurrency, rates, period, dateRange])

  // Stats computation
  const stats = useMemo(() => {
    if (!chartData.length) return null
    const first = chartData[0].balance
    const last  = chartData[chartData.length - 1].balance
    const diff  = last - first
    const pct   = first !== 0 ? (diff / Math.abs(first)) * 100 : 0
    const max   = Math.max(...chartData.map(d => d.balance))
    const min   = Math.min(...chartData.map(d => d.balance))
    return { first, last, diff, pct, max, min }
  }, [chartData])

  const trend = !stats ? 'flat' : stats.diff > 0 ? 'up' : stats.diff < 0 ? 'down' : 'flat'

  const domain = useMemo(() => {
    if (!chartData.length) return ['auto', 'auto']
    const vals = chartData.map(d => d.balance)
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 10
    return [lo - pad, hi + pad]
  }, [chartData])

  // Date range formatted label for header
  const rangeLabel = useMemo(() => {
    const startD = new Date(dateRange.start)
    const endD = new Date(dateRange.end)
    const opt = { day: 'numeric', month: 'short' }
    if (period === 'year') {
      return `${startD.getFullYear()} – ${endD.getFullYear()}`
    }
    return `${startD.toLocaleDateString('uk-UA', opt)} – ${endD.toLocaleDateString('uk-UA', { ...opt, year: 'numeric' })}`
  }, [dateRange, period])

  // Navigate backward
  const handlePrev = () => {
    setReferenceDate(prev => {
      const next = new Date(prev)
      if (period === 'day') next.setDate(next.getDate() - 30)
      else if (period === 'week') next.setDate(next.getDate() - 12 * 7)
      else if (period === 'year') next.setFullYear(next.getFullYear() - 5)
      else next.setMonth(next.getMonth() - 12)
      return next
    })
  }

  // Navigate forward (capping at now)
  const handleNext = () => {
    setReferenceDate(prev => {
      const next = new Date(prev)
      if (period === 'day') next.setDate(next.getDate() + 30)
      else if (period === 'week') next.setDate(next.getDate() + 12 * 7)
      else if (period === 'year') next.setFullYear(next.getFullYear() + 5)
      else next.setMonth(next.getMonth() + 12)
      
      const now = new Date()
      return next > now ? now : next
    })
  }

  // Check if we are at today's limit
  const isLatest = useMemo(() => {
    const endD = new Date(dateRange.end)
    const now = new Date()
    // Compare dates ignoring hours
    endD.setHours(24, 0, 0, 0)
    now.setHours(24, 0, 0, 0)
    return endD >= now
  }, [dateRange])

  // Check if the current window starts at or before the oldest transaction
  const isOldest = useMemo(() => {
    return dateRange.start <= minDate
  }, [dateRange.start, minDate])

  const selectedPeriodLabel = useMemo(() => {
    if (!selectedPoint) return ''
    return formatDate(selectedPoint.date, period)
  }, [selectedPoint, period])

  // Fetch transactions for the clicked point
  useEffect(() => {
    if (!selectedPoint || !open) {
      setPeriodTxs([])
      return
    }
    
    let cancelled = false
    setLoadingTxs(true)
    
    const d = new Date(selectedPoint.date)
    let startStr = ''
    let endStr = ''
    
    const fmt = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    
    if (period === 'day') {
      startStr = selectedPoint.date
      endStr = selectedPoint.date
    } else if (period === 'week') {
      startStr = selectedPoint.date
      const endD = new Date(d)
      endD.setDate(d.getDate() + 6)
      endStr = fmt(endD)
    } else if (period === 'year') {
      startStr = `${d.getFullYear()}-01-01`
      endStr = `${d.getFullYear()}-12-31`
    } else {
      // month
      startStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      const endD = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      endStr = fmt(endD)
    }
    
    const queryParams = new URLSearchParams({
      start_date: startStr,
      end_date: endStr,
    })
    
    apiFetch(`/api/transactions?${queryParams}`)
      .then(res => {
        if (cancelled) return
        
        let txList = res || []
        
        // Filter by bucket
        if (bucket !== 'all') {
          const bucketCards = Object.values(cards || []).filter(c => {
            const full = `${(c.bank || '').toLowerCase()} ${(c.name || '').toLowerCase()}`
            const b = (full.includes('збер') || full.includes('savings')) ? 'savings' :
                      (full.includes('гот') || full.includes('cash')) ? 'cash' : 'cards'
            return b === bucket
          })
          const bucketCardIds = new Set(bucketCards.map(c => c.id))
          
          txList = txList.filter(tx => {
            if (bucket === 'cash' && !tx.card_id) return true
            return bucketCardIds.has(tx.card_id)
          })
        }
        
        // Filter by currency if bucket !== 'all'
        if (bucket !== 'all') {
          txList = txList.filter(tx => {
            const txCard = cards?.find(c => c.id === tx.card_id)
            const cur = txCard ? txCard.currency : 'UAH'
            return cur === activeCurrency
          })
        }
        
        setPeriodTxs(txList)
        setLoadingTxs(false)
      })
      .catch(err => {
        if (!cancelled) {
          console.error(err)
          setLoadingTxs(false)
        }
      })
      
    return () => { cancelled = true }
  }, [selectedPoint, open, bucket, period, activeCurrency, cards])

  if (!open) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="bhm-backdrop"
            className="fixed inset-0 bg-black/30 backdrop-blur-sm animate-fade-in"
            style={{ zIndex: 200 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Card */}
          <motion.div
            key="bhm-card"
            className="fixed inset-0 flex items-center justify-center pointer-events-none"
            style={{ zIndex: 201, padding: '1rem' }}
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <div
              className="pointer-events-auto w-full bg-white rounded-2xl overflow-hidden"
              style={{
                maxWidth: 600,
                boxShadow: '0 24px 48px -8px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.05)',
              }}
            >
              {/* Colored top strip */}
              <div
                className="h-1.5"
                style={{ background: `linear-gradient(90deg, ${meta.gradFrom}, ${meta.gradTo})` }}
              />

              {/* Header */}
              <div className="px-5 pt-4 pb-3 border-b border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-xl ${meta.bgCls}`}>
                      <BucketIcon size={15} className={meta.textCls} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-gray-800 text-sm">{sectionTitle || meta.label}</span>
                        <BarChart2 size={12} className="text-gray-400" />
                      </div>
                      <div className="text-gray-400 text-[11px] mt-0.5">Історія балансу · {activeCurrency}</div>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Current balance */}
                {!loading && stats && (
                  <motion.div
                    className="flex items-end justify-between animate-fade-in"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                  >
                    <div className="flex items-end gap-3">
                      <div>
                        <div className="text-gray-400 text-[11px] font-medium mb-0.5">Поточний баланс</div>
                        <div className="text-gray-900 text-2xl font-extrabold tracking-tight leading-none">
                          {fmtFull(currentBalance, activeCurrency)}
                        </div>
                      </div>
                      <div className="mb-0.5 flex flex-col gap-0.5 items-start">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          trend === 'up'   ? 'bg-emerald-100 text-emerald-700' :
                          trend === 'down' ? 'bg-red-100 text-red-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {trend === 'up'   && <TrendingUp size={10}/>}
                          {trend === 'down' && <TrendingDown size={10}/>}
                          {trend === 'flat' && <Minus size={10}/>}
                          {stats.diff >= 0 ? '+' : ''}{fmtFull(stats.diff, activeCurrency)}
                        </span>
                        <span className="text-gray-400 text-[10px] pl-1">
                          {stats.pct >= 0 ? '+' : ''}{stats.pct.toFixed(1)}% за період
                        </span>
                      </div>
                    </div>

                    {/* Window Navigation Arrows */}
                    <div className="flex items-center gap-1.5 border border-gray-100 rounded-lg p-0.5 bg-gray-50/50">
                      <button
                        onClick={handlePrev}
                        disabled={isOldest}
                        className={`p-1.5 rounded-md transition-colors ${
                          isOldest
                            ? 'text-gray-300 cursor-not-allowed'
                            : 'hover:bg-white text-gray-500 hover:text-gray-800 shadow-sm'
                        }`}
                        title="Назад"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="text-[10px] font-bold text-gray-600 px-1 select-none tabular-nums">
                        {rangeLabel}
                      </span>
                      <button
                        onClick={handleNext}
                        disabled={isLatest}
                        className={`p-1.5 rounded-md transition-colors ${
                          isLatest
                            ? 'text-gray-300 cursor-not-allowed'
                            : 'hover:bg-white text-gray-500 hover:text-gray-800 shadow-sm'
                        }`}
                        title="Вперед"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Currency switcher (only if multiple currencies exist in bucket) */}
              {currencies.length > 1 && (
                <div className="px-5 pt-3 pb-1 flex gap-1.5 border-b border-gray-50">
                  {currencies.map(cur => (
                    <button
                      key={cur}
                      onClick={() => setActiveCurrency(cur)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                        activeCurrency === cur
                          ? 'bg-gray-900 border-gray-900 text-white shadow-sm'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              )}

              {/* Period switcher */}
              <div className="px-5 pt-2.5 pb-1.5 flex items-center gap-1">
                {PERIODS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => {
                      setPeriod(p.key)
                      setReferenceDate(new Date()) // Reset to today
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      period === p.key
                        ? `${meta.textCls} ${meta.bgCls} shadow-sm`
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Chart */}
              <div className="px-3 pb-4" style={{ height: 210 }}>
                {loading ? (
                  <div className="flex items-center justify-center h-full gap-2">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className="w-2.5 h-2.5 rounded-full animate-bounce"
                        style={{ background: chartColor, animationDelay: `${i * 120}ms` }}
                      />
                    ))}
                  </div>
                ) : error ? (
                  <div className="flex items-center justify-center h-full text-red-500 text-sm">{error}</div>
                ) : chartData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2">
                    <BarChart2 size={28} className="text-gray-300" />
                    <div className="text-gray-500 text-sm font-medium">Немає даних</div>
                    <div className="text-gray-400 text-xs">Додайте транзакції, щоб побачити графік</div>
                  </div>
                ) : (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${period}-${bucket}-${activeCurrency}-${dateRange.start}`}
                      className="h-full"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.22 }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart 
                          data={chartData} 
                          margin={{ top: 6, right: 6, bottom: 0, left: 0 }}
                          onClick={(state) => {
                            if (state && state.activePayload && state.activePayload.length > 0) {
                              const clickedData = state.activePayload[0].payload
                              setSelectedPoint(clickedData)
                            }
                          }}
                        >
                          <defs>
                            <linearGradient id={`bhm-grad-${bucket}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%"   stopColor={chartColor} stopOpacity={0.18} />
                              <stop offset="100%" stopColor={chartColor} stopOpacity={0.01} />
                            </linearGradient>
                          </defs>

                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />

                          <XAxis
                            dataKey="date"
                            tickFormatter={v => formatShortDate(v, period)}
                            tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 500 }}
                            axisLine={{ stroke: '#e5e7eb' }}
                            tickLine={false}
                            interval="preserveStartEnd"
                            minTickGap={40}
                          />

                          <YAxis
                            tickFormatter={v => fmtCompact(v, activeCurrency)}
                            tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 500 }}
                            axisLine={false}
                            tickLine={false}
                            domain={domain}
                            width={54}
                          />

                          <Tooltip
                            content={<ChartTooltip period={period} currency={activeCurrency} />}
                            cursor={{ stroke: chartColor, strokeWidth: 1.5, strokeDasharray: '4 4', strokeOpacity: 0.5 }}
                          />

                          {stats && stats.min < 0 && (
                            <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="4 4" />
                          )}

                          <Area
                            type="monotone"
                            dataKey="balance"
                            stroke={chartColor}
                            strokeWidth={2.5}
                            fill={`url(#bhm-grad-${bucket})`}
                            dot={false}
                            activeDot={{ r: 4.5, fill: chartColor, stroke: '#fff', strokeWidth: 2 }}
                            animationDuration={450}
                            animationEasing="ease-out"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>

              {/* Stats row */}
              {!loading && chartData.length > 0 && stats && (
                <motion.div
                  className="grid grid-cols-3 gap-2 mx-5 mb-4"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.14 }}
                >
                  <StatMini label="Початок"  value={stats.first} currency={activeCurrency} borderCls={meta.borderCls} />
                  <StatMini label="Максимум" value={stats.max}   currency={activeCurrency} borderCls={meta.borderCls} />
                  <StatMini label="Мінімум"  value={stats.min}   currency={activeCurrency} borderCls={meta.borderCls} />
                </motion.div>
              )}

              {/* Selected Point Transactions Drilldown */}
              <div className={`border-t border-gray-100 bg-gray-50/50 px-5 py-4 transition-all duration-300 overflow-y-auto ${
                selectedPoint ? 'h-[320px]' : 'h-[56px] py-2 flex items-center justify-center'
              }`}>
                {!selectedPoint ? (
                  <span className="text-[11px] font-semibold text-gray-400 text-center">
                    💡 Натисни на будь-яку точку графіка, щоб переглянути транзакції за цей період
                  </span>
                ) : loadingTxs ? (
                  <div className="flex items-center justify-center h-full py-4 text-xs text-gray-500 gap-2">
                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    Завантаження транзакцій...
                  </div>
                ) : periodTxs.length === 0 ? (
                  <div className="text-center py-4">
                    <div className="text-xs font-bold text-gray-700 mb-1">Транзакції за {selectedPeriodLabel}</div>
                    <div className="text-[11px] text-gray-400">Немає транзакцій за цей період</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-1.5 pb-1 border-b border-gray-100">
                      <span className="text-xs font-bold text-gray-800">Транзакції за {selectedPeriodLabel}</span>
                      <button 
                        onClick={() => setSelectedPoint(null)} 
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold"
                      >
                        Закрити
                      </button>
                    </div>
                    <div className="divide-y divide-gray-100/70">
                      {periodTxs.map(tx => {
                        const card = cards.find(c => c.id === tx.card_id)
                        const cardName = card ? `${card.bank} ${card.name}` : 'Готівка'
                        const isIncome = Number(tx.amount || 0) > 0
                        
                        return (
                          <div key={tx.id} className="flex justify-between items-center py-2 text-xs">
                            <div>
                              <div className="font-bold text-gray-800">{tx.category || 'Невідомо'}</div>
                              <div className="text-[10px] text-gray-400 mt-0.5">{cardName} · {new Date(tx.created_at).toLocaleDateString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                            <div className={`font-bold ${isIncome ? 'text-emerald-600' : 'text-red-500'}`}>
                              {isIncome ? '+' : ''}{tx.amount.toLocaleString('uk-UA')} {symOf(tx.currency || activeCurrency)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
