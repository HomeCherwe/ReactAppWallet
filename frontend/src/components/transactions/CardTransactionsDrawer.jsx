import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, BarChart2,
  CreditCard, Calendar, ChevronDown, Eye, EyeOff, Settings
} from 'lucide-react'
import { listTransactionsByCard } from '../../api/transactions'
import { listCards } from '../../api/cards'
import useMonoRates from '../../hooks/useMonoRates'
import { usePreferences } from '../../context/PreferencesContext'
import { updatePreferencesSection } from '../../api/preferences'
import Row from './Row'
import { formatMoney } from '../../utils/cardTheme'
import { isCategoryExcluded } from '../../utils/statsCategories'

// ─── helpers ─────────────────────────────────────────────────────────────────

const UA_MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
]
const UA_MONTHS_GEN = [
  'Січня', 'Лютого', 'Березня', 'Квітня', 'Травня', 'Червня',
  'Липня', 'Серпня', 'Вересня', 'Жовтня', 'Листопада', 'Грудня',
]

function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfMonth(year, month) {
  return new Date(year, month, 1)
}
function endOfMonth(year, month) {
  return new Date(year, month + 1, 0, 23, 59, 59)
}

function formatDateHeader(dateStr) {
  const d = new Date(dateStr)
  const day = d.getDate()
  const month = UA_MONTHS_GEN[d.getMonth()]
  const days = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота']
  const dayName = days[d.getDay()].toUpperCase()
  const today = new Date()
  const isToday = today.toDateString() === d.toDateString()
  if (isToday) return 'СЬОГОДНІ'
  return `${day} ${month.toUpperCase()}, ${dayName}`
}

function groupByDay(txs) {
  const map = {}
  for (const tx of txs || []) {
    const d = new Date(tx.created_at)
    // Use LOCAL date so midnight local time stays on the correct day
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!key) continue
    if (!map[key]) map[key] = { key, txs: [], dateStr: tx.created_at }
    map[key].txs.push(tx)
  }
  return Object.values(map).sort((a, b) => b.key.localeCompare(a.key))
}



// ─── period presets ───────────────────────────────────────────────────────────

function buildPreset(id) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  if (id === 'this_month') {
    return { start: startOfMonth(y, m), end: endOfMonth(y, m) }
  }
  if (id === 'prev_month') {
    const pm = m === 0 ? 11 : m - 1
    const py = m === 0 ? y - 1 : y
    return { start: startOfMonth(py, pm), end: endOfMonth(py, pm) }
  }
  if (id === 'last_3') {
    const pm = m - 2 < 0 ? m - 2 + 12 : m - 2
    const py = m - 2 < 0 ? y - 1 : y
    return { start: startOfMonth(py, pm), end: endOfMonth(y, m) }
  }
  // 'all' → no date filter
  return { start: null, end: null }
}

// ─── Main Component ───────────────────────────────────────────────────────────

const HEADER_GRADIENTS = [
  ['#FF7A1A', '#B83A00'],
  ['#6D5DFC', '#2A1E9C'],
  ['#1FB6A6', '#0B5E63'],
  ['#E0457B', '#7A1540'],
]

export default function CardTransactionsDrawer({ card, onClose, onOpenSettings, cardMap: externalCardMap }) {
  const rates = useMonoRates()
  const ratesReady = rates && Object.keys(rates).length > 0
  const { preferences } = usePreferences()

  // Currency conversion (same logic as MonthlyPayment)
  const convertCurrency = useCallback((amount, fromCurrency, toCurrency) => {
    if (!fromCurrency || fromCurrency === toCurrency) return amount
    if (!ratesReady) return null
    const codeMap = { UAH: 980, USD: 840, EUR: 978, GBP: 826, PLN: 985, CHF: 756, CZK: 203, HUF: 348, USDT: 840 }
    const fromCode = codeMap[fromCurrency] || 980
    const toCode = codeMap[toCurrency] || 980
    if (fromCode === toCode) return amount
    let inUAH = amount
    if (fromCode !== 980) {
      const rateToUAH = rates[`${fromCode}->980`]
      if (!rateToUAH) return null
      inUAH = amount * rateToUAH
    }
    if (toCode === 980) return inUAH
    const rateFromUAH = rates[`${toCode}->980`]
    if (!rateFromUAH) return null
    return inUAH / rateFromUAH
  }, [rates, ratesReady])

  // ── includeAll toggle (persist to preferences) ────────────────────────────
  const [includeAll, setIncludeAll] = useState(() => {
    const saved = preferences?.cardStats?.includeAll
    return saved === true
  })

  // Sync initial value from preferences when they load
  useEffect(() => {
    if (preferences?.cardStats !== undefined) {
      setIncludeAll(preferences.cardStats.includeAll === true)
    }
  }, [preferences?.cardStats?.includeAll])

  const handleToggleIncludeAll = useCallback((val) => {
    setIncludeAll(val)
    updatePreferencesSection('cardStats', { includeAll: val }).catch(console.error)
  }, [])

  // ── period state ──────────────────────────────────────────────────────────
  const now = new Date()
  const [preset, setPreset] = useState('this_month') // 'this_month' | 'prev_month' | 'last_3' | 'all' | 'month_nav' | 'custom'
  const [navYear, setNavYear] = useState(now.getFullYear())
  const [navMonth, setNavMonth] = useState(now.getMonth())
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [showMonthNav, setShowMonthNav] = useState(false)
  const [cardMap, setCardMap] = useState(externalCardMap || {})

  // Load cards for currency map if not provided
  useEffect(() => {
    if (externalCardMap && Object.keys(externalCardMap).length > 0) return
    listCards().then(cards => {
      const map = {}
      cards.forEach(c => { map[c.id] = c.currency || 'EUR' })
      setCardMap(map)
    }).catch(() => {})
  }, [externalCardMap])

  const dateRange = useMemo(() => {
    if (preset === 'month_nav') {
      return { start: startOfMonth(navYear, navMonth), end: endOfMonth(navYear, navMonth) }
    }
    if (preset === 'custom') {
      return {
        start: customFrom ? new Date(customFrom) : null,
        end: customTo ? new Date(customTo + 'T23:59:59') : null,
      }
    }
    return buildPreset(preset)
  }, [preset, navYear, navMonth, customFrom, customTo])

  const startDateISO = dateRange.start ? toISODate(dateRange.start) : undefined
  const endDateISO = dateRange.end ? toISODate(dateRange.end) : undefined

  // ── data loading ──────────────────────────────────────────────────────────
  const [txs, setTxs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const PAGE = 50
  const txsRef = useRef([])

  useEffect(() => { txsRef.current = txs }, [txs])

  const loadPage = useCallback(async ({ append = false } = {}) => {
    if (!card?.id) return
    if (append) setLoadingMore(true)
    else setLoading(true)

    const from = append ? (txsRef.current?.length || 0) : 0
    const to = from + PAGE - 1

    try {
      const data = await listTransactionsByCard({
        cardId: card.id,
        from,
        to,
        startDate: startDateISO,
        endDate: endDateISO,
      })
      const fetched = data || []
      if (append) {
        setTxs(prev => {
          const ids = new Set(prev.map(t => t.id))
          const merged = [...prev, ...fetched.filter(t => !ids.has(t.id))]
          return merged
        })
      } else {
        setTxs(fetched)
      }
      setHasMore(fetched.length >= PAGE)
    } catch (e) {
      console.error('[CardTransactionsDrawer] fetch error', e)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [card?.id, startDateISO, endDateISO])

  // Reset + fetch on period/card change
  useEffect(() => {
    setTxs([])
    setHasMore(true)
    loadPage({ append: false })
  }, [loadPage])

  // ── infinite scroll ───────────────────────────────────────────────────────
  const bottomRef = useRef(null)
  const observerRef = useRef(null)

  useEffect(() => {
    if (!bottomRef.current || !hasMore) return
    if (observerRef.current) observerRef.current.disconnect()
    observerRef.current = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && hasMore && !loadingMore && !loading) {
        loadPage({ append: true })
      }
    }, { root: null, rootMargin: '300px', threshold: 0 })
    observerRef.current.observe(bottomRef.current)
    return () => observerRef.current?.disconnect()
  }, [hasMore, loadingMore, loading, loadPage])

  // ── stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const cardCurrency = card?.currency || 'EUR'
    let income = 0, expense = 0
    for (const tx of txs) {
      // If includeAll is OFF — skip excluded transactions (default behaviour)
      if (!includeAll) {
        if (tx.exclude_from_stats === true || tx.exclude_from_stats === 'true' || tx.exclude_from_stats === 1) continue
        if (isCategoryExcluded(tx.category)) continue
      }
      const amt = Number(tx.amount_stat ?? tx.amount ?? 0)
      const txCur = (tx.currency || cardMap[tx.card_id] || cardCurrency).toUpperCase()
      const converted = convertCurrency(amt, txCur, cardCurrency)
      if (converted == null) continue
      if (converted > 0) income += converted
      else expense += converted
    }
    return { income, expense, net: income + expense }
  }, [txs, card, cardMap, convertCurrency, includeAll])

  // ── day groups ────────────────────────────────────────────────────────────
  const days = useMemo(() => groupByDay(txs), [txs])

  // ── header color: one of the iPhone sheet's gradients, picked by the card id ──
  const headerGrad = HEADER_GRADIENTS[(String(card?.id || '').charCodeAt(0) || 0) % HEADER_GRADIENTS.length]

  // ── lock body scroll when open (no layout shift) ─────────────────────────
  useEffect(() => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    const prevOverflow = document.body.style.overflow
    const prevPadding = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    document.body.style.paddingRight = `${scrollbarWidth}px`
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPadding
    }
  }, [])

  // ── period label ──────────────────────────────────────────────────────────
  const periodLabel = useMemo(() => {
    if (preset === 'this_month') return 'Цей місяць'
    if (preset === 'prev_month') return 'Минулий місяць'
    if (preset === 'last_3') return 'Останні 3 місяці'
    if (preset === 'all') return 'Весь час'
    if (preset === 'month_nav') return `${UA_MONTHS[navMonth]} ${navYear}`
    if (preset === 'custom') {
      if (customFrom && customTo) return `${customFrom} — ${customTo}`
      if (customFrom) return `З ${customFrom}`
      if (customTo) return `До ${customTo}`
      return 'Кастомний'
    }
    return ''
  }, [preset, navYear, navMonth, customFrom, customTo])

  // ── currency helper ───────────────────────────────────────────────────────
  const cur = card?.currency || 'EUR'
  const fmtCur = (v) => {
    const valid = ['USD', 'EUR', 'UAH', 'PLN', 'GBP', 'CHF', 'CZK', 'HUF'].includes(cur)
    if (valid) return new Intl.NumberFormat('uk-UA', { style: 'currency', currency: cur }).format(Math.abs(v))
    return `${Math.abs(v).toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ${cur}`
  }

  // ── render ────────────────────────────────────────────────────────────────
  return createPortal(
    <>
      {/* Overlay */}
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[999]"
        onClick={onClose}
      />

      {/* Modal — desktop: centered | mobile: bottom sheet */}
      <motion.div
        key="drawer"
        initial={{ y: 30, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 30, opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        className={[
          'fixed bg-surface/90 shadow-2xl flex flex-col z-[1000] overflow-hidden',
          // Mobile: bottom sheet
          'bottom-0 left-0 right-0 h-[92dvh] rounded-t-3xl',
          // Desktop: centered modal (sm:inset-0 overrides mobile bottom/left/right)
          'sm:inset-0 sm:m-auto sm:w-[520px] sm:h-[85vh] sm:max-h-[90vh] sm:rounded-3xl',
        ].join(' ')}
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* ── Title + card, like the iPhone "Транзакції картки" sheet ─────── */}
        <div className="flex items-center justify-between px-5 pt-1 sm:pt-4 pb-1.5 flex-shrink-0">
          <div className="text-xl font-extrabold tracking-tight">Транзакції картки</div>
          <button
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-full bg-white/10 hover:bg-white/15 text-white/80 transition-colors"
            aria-label="Закрити"
          >
            <X size={16} />
          </button>
        </div>
        <div
          className="flex-shrink-0 mx-4 mt-2 rounded-[22px] p-[18px] text-white"
          style={{ background: `linear-gradient(135deg, ${headerGrad[0]}, ${headerGrad[1]})` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-[0.05em] text-white/75 truncate">{card?.bank || 'Рахунок'}</div>
              <div className="text-lg font-extrabold truncate mt-0.5">{card?.name}</div>
            </div>
            {onOpenSettings && (
              <button
                onClick={() => onOpenSettings(card)}
                className="h-[34px] w-[34px] shrink-0 grid place-items-center rounded-full bg-black/20 hover:bg-black/30 transition-colors"
                title="Налаштування картки"
              >
                <Settings size={17} />
              </button>
            )}
          </div>
          <div className="text-xs text-white/75 mt-[18px]">Баланс</div>
          <div className="text-[28px] font-extrabold tracking-tight tabular-nums leading-tight">
            {Number(card?._balance ?? 0) < 0 ? '−' : ''}{formatMoney(card?._balance ?? 0, card?.currency)}
          </div>
          {(card?.exclude_from_stats || card?.bank_exclude_from_stats) && (
            <div className="text-[11px] text-white/75 mt-1">Не враховується в статистиці</div>
          )}
        </div>

        {/* ── Period Selector ────────────────────────────────────────────── */}
        <div className="px-3 pt-3 flex-shrink-0 space-y-2">
          {/* Quick presets */}
          <div className="flex gap-1.5 flex-wrap">
            {[
              { id: 'this_month', label: 'Цей місяць' },
              { id: 'prev_month', label: 'Минулий' },
              { id: 'last_3', label: '3 місяці' },
              { id: 'all', label: 'Весь час' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => { setPreset(p.id); setShowCustom(false); setShowMonthNav(false) }}
                className={[
                  'text-xs px-3 py-1.5 rounded-full font-medium transition-all duration-200',
                  preset === p.id && !showCustom && !showMonthNav
                    ? 'bg-brand text-white shadow-sm'
                    : 'bg-white/[0.06] text-white/70 hover:bg-white/10',
                ].join(' ')}
              >
                {p.label}
              </button>
            ))}

            {/* Month nav toggle */}
            <button
              onClick={() => { setShowMonthNav(v => !v); setShowCustom(false); if (!showMonthNav) setPreset('month_nav') }}
              className={[
                'text-xs px-3 py-1.5 rounded-full font-medium transition-all duration-200 inline-flex items-center gap-1',
                preset === 'month_nav'
                  ? 'bg-brand text-white shadow-sm'
                  : 'bg-white/[0.06] text-white/70 hover:bg-white/10',
              ].join(' ')}
            >
              <Calendar size={12} /> Місяць
            </button>

            {/* Custom range toggle */}
            <button
              onClick={() => { setShowCustom(v => !v); setShowMonthNav(false); if (!showCustom) setPreset('custom') }}
              className={[
                'text-xs px-3 py-1.5 rounded-full font-medium transition-all duration-200 inline-flex items-center gap-1',
                preset === 'custom'
                  ? 'bg-brand text-white shadow-sm'
                  : 'bg-white/[0.06] text-white/70 hover:bg-white/10',
              ].join(' ')}
            >
              <ChevronDown size={12} /> Діапазон
            </button>
          </div>

          {/* Month navigator */}
          <AnimatePresence>
            {showMonthNav && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex items-center justify-between bg-white/[0.03] rounded-xl px-3 py-2">
                  <button
                    onClick={() => {
                      const nm = navMonth === 0 ? 11 : navMonth - 1
                      const ny = navMonth === 0 ? navYear - 1 : navYear
                      setNavMonth(nm); setNavYear(ny)
                    }}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-semibold text-white">
                    {UA_MONTHS[navMonth]} {navYear}
                  </span>
                  <button
                    onClick={() => {
                      const nm = navMonth === 11 ? 0 : navMonth + 1
                      const ny = navMonth === 11 ? navYear + 1 : navYear
                      setNavMonth(nm); setNavYear(ny)
                    }}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                    disabled={navYear === now.getFullYear() && navMonth === now.getMonth()}
                  >
                    <ChevronRight size={16} className={
                      navYear === now.getFullYear() && navMonth === now.getMonth()
                        ? 'text-white/30' : ''
                    } />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Custom range inputs */}
          <AnimatePresence>
            {showCustom && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex gap-2 items-center bg-white/[0.03] rounded-xl p-2">
                  <input
                    type="date"
                    value={customFrom}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="flex-1 text-xs border border-white/10 rounded-lg px-2 py-1.5 bg-surface/90 focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                  <span className="text-white/40 text-xs">—</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={e => setCustomTo(e.target.value)}
                    className="flex-1 text-xs border border-white/10 rounded-lg px-2 py-1.5 bg-surface/90 focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        <div className="px-3 pt-2 pb-1 flex-shrink-0">
          <div className="grid grid-cols-3 gap-2">
            {/* Income */}
            <div className="bg-emerald-500/10 rounded-2xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1 text-emerald-400">
                <TrendingUp size={13} />
                <span className="text-[10px] font-semibold uppercase tracking-wide">Доходи</span>
              </div>
              <div className="text-sm font-extrabold text-emerald-300 leading-tight">
                {loading ? '…' : fmtCur(stats.income)}
              </div>
            </div>

            {/* Expense */}
            <div className="bg-rose-500/10 rounded-2xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1 text-rose-400">
                <TrendingDown size={13} />
                <span className="text-[10px] font-semibold uppercase tracking-wide">Витрати</span>
              </div>
              <div className="text-sm font-extrabold text-rose-400 leading-tight">
                {loading ? '…' : fmtCur(Math.abs(stats.expense))}
              </div>
            </div>

            {/* Net */}
            <div className={`rounded-2xl p-3 flex flex-col gap-1 ${stats.net >= 0 ? 'bg-brand/10' : 'bg-orange-500/10'}`}>
              <div className={`flex items-center gap-1 ${stats.net >= 0 ? 'text-brand' : 'text-orange-400'}`}>
                <BarChart2 size={13} />
                <span className="text-[10px] font-semibold uppercase tracking-wide">Баланс</span>
              </div>
              <div className={`text-sm font-extrabold leading-tight ${stats.net >= 0 ? 'text-brand-light' : 'text-orange-400'}`}>
                {loading ? '…' : (stats.net >= 0 ? '+' : '') + fmtCur(stats.net).replace('-', '')}
              </div>
            </div>
          </div>

          {/* Period label + includeAll toggle */}
          <div className="mt-2 flex items-center justify-between">
            <div className="text-[10px] text-white/40 pl-1">{periodLabel}</div>

            {/* Toggle: враховувати всі / тільки враховані */}
            <button
              id="card-stats-include-all-toggle"
              onClick={() => handleToggleIncludeAll(!includeAll)}
              className={[
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all duration-200 select-none',
                includeAll
                  ? 'bg-brand/15 text-brand-light ring-1 ring-brand/40'
                  : 'bg-white/[0.06] text-white/55 hover:bg-white/10',
              ].join(' ')}
              title={includeAll ? 'Зараз: всі транзакції (включно з трансферами та виключеними). Натисніть щоб показати лише враховані.' : 'Зараз: тільки враховані транзакції. Натисніть щоб показати всі.'}
            >
              {includeAll
                ? <><Eye size={10} /> Всі транзакції</>
                : <><EyeOff size={10} /> Тільки враховані</>
              }
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-3 h-px bg-white/[0.06] flex-shrink-0" />

        {/* ── Transaction list ───────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {loading && txs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-white/40">
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 border-2 border-brand/25 rounded-full" />
                <div className="absolute inset-0 border-2 border-brand rounded-full border-t-transparent animate-spin" />
              </div>
              <span className="text-sm">Завантаження…</span>
            </div>
          ) : txs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-white/40">
              <CreditCard size={36} className="text-white/60" />
              <div className="text-sm font-medium">Транзакцій немає</div>
              <div className="text-xs text-white/30">
                {preset === 'all' ? 'По цій картці ще немає транзакцій' : `За вибраний період (${periodLabel})`}
              </div>
            </div>
          ) : (
            <>
              {days.map(({ key, txs: dayTxs, dateStr }) => {
                let dayTotal = 0
                for (const tx of dayTxs) {
                  if (!includeAll && (tx.exclude_from_stats === true || tx.exclude_from_stats === 'true' || isCategoryExcluded(tx.category))) continue
                  const amt = Number(tx.amount_stat ?? tx.amount ?? 0)
                  const txCur = (tx.currency || cardMap[tx.card_id] || cur).toUpperCase()
                  const conv = convertCurrency(amt, txCur, cur)
                  if (conv != null) dayTotal += conv
                }
                return (
                  <div key={key}>
                    {/* Sticky date header — full width, no padding on parent needed */}
                    <div className="sticky top-0 z-20 bg-surface/90 border-b border-white/[0.06] px-3 pt-3 pb-1.5 flex items-center justify-between">
                      <div className="text-xs font-semibold text-white/55">
                        {formatDateHeader(dateStr)}
                      </div>
                      <div className={`text-xs font-semibold ${dayTotal < 0 ? 'text-rose-400' : dayTotal > 0 ? 'text-emerald-400' : 'text-white/40'}`}>
                        {!ratesReady
                          ? `… ${cur}`
                          : dayTotal > 0
                            ? `+${fmtCur(dayTotal)}`
                            : dayTotal < 0
                              ? `-${fmtCur(Math.abs(dayTotal))}`
                              : fmtCur(dayTotal)
                        }
                      </div>
                    </div>

                    {/* Rows — isolated stacking context, z-0 */}
                    <div className="space-y-2 px-3 pt-1 pb-3 relative z-0">
                      {dayTxs.map(tx => (
                        <Row
                          key={tx.id}
                          tx={tx}
                          currency={cardMap[tx.card_id] || cur}
                          compact
                        />
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* Infinite scroll trigger */}
              <div ref={bottomRef} className="h-4" />

              {loadingMore && (
                <div className="flex justify-center py-4">
                  <div className="relative w-6 h-6">
                    <div className="absolute inset-0 border-2 border-brand/25 rounded-full" />
                    <div className="absolute inset-0 border-2 border-brand rounded-full border-t-transparent animate-spin" />
                  </div>
                </div>
              )}

              {!hasMore && txs.length > 0 && (
                <div className="text-center text-xs text-white/30 py-4">
                  Всі транзакції завантажено · {txs.length} шт.
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </>,
    document.body
  )
}
