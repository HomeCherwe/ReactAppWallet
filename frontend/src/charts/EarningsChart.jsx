import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { motion } from 'framer-motion'
import Row from '../components/transactions/Row'
import DetailsModal from '../components/transactions/DetailsModal'
import ConfirmModal from '../components/ConfirmModal'
import DeleteTxModal from '../components/transactions/DeleteTxModal'
import EditTxModal from '../components/transactions/EditTxModal'
import BaseModal from '../components/BaseModal'
import { deleteTransaction, archiveTransaction } from '../api/transactions'
import { useEffect, useMemo, useState, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../utils.jsx'
import { txBus } from '../utils/txBus'
import { useSettingsStore } from '../store/useSettingsStore'
import { listCards } from '../api/cards'
import useMonoRates from '../hooks/useMonoRates'
import { usePrimaryCurrency, convertAmount, currencySymbol } from '../utils/primaryCurrency'

const INCOME_COLOR = '#22C55E'
const EXPENSE_COLOR = '#FF453A'

const fmtMoney = (v, currency) =>
  `${Number(v || 0).toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ${currencySymbol(currency)}`

/** Hover card for a day: income and spending in the main currency */
const FlowTooltip = ({ active, payload, label, currency }) => {
  if (!active || !payload?.length) return null
  const day = payload[0]?.payload || {}
  if (!day.income && !day.expense) return null
  return (
    <div className="rounded-2xl bg-[rgba(30,30,35,0.95)] backdrop-blur-xl border border-white/10 px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-xs">
      <div className="font-bold text-white/80 mb-1">{label}</div>
      {day.income > 0 && <div className="font-bold text-green-400 tabular-nums">+{fmtMoney(day.income, currency)}</div>}
      {day.expense > 0 && <div className="font-bold text-[#FF6B6B] tabular-nums">-{fmtMoney(day.expense, currency)}</div>}
      <div className="text-[10px] text-white/40 mt-1">Натисніть, щоб побачити транзакції</div>
    </div>
  )
}

function dayKey(dt) {
  const d = new Date(dt)
  // Use LOCAL date so midnight local time stays on the correct day (avoids UTC offset issues)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const pad2 = (n) => String(n).padStart(2, '0')
const localIso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

/**
 * The week (Mon–Sun) or month `offset` periods back from `today` (0 = the current one), with a
 * label for the navigator.
 */
function periodRange(period, offset, today) {
  const short = (d) => d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
  if (period === 'week') {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const label = start.getMonth() === end.getMonth()
      ? `${start.getDate()} – ${short(end)}`
      : `${short(start)} – ${short(end)}`
    return { from: localIso(start), to: localIso(end), label }
  }
  const start = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  const end = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0)
  const month = start.toLocaleDateString('uk-UA', { month: 'long' })
  return { from: localIso(start), to: localIso(end), label: `${month[0].toUpperCase()}${month.slice(1)} ${start.getFullYear()}` }
}

function fmtLabel(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
}

// Determine which transactions should be counted in the chart according to
// the rules:
// - Exclude savings accounts entirely (no income/expense from savings counted)
// - For transfers:
//   * If transfer is from savings -> count only the 'to' (income) side and skip the 'from'
//   * If transfer is to savings -> count only the 'from' (expense) side and skip the 'to'
//   * If transfer between non-savings cards -> ignore both sides
// - Non-transfer transactions (normal income/expense) are counted unless they are savings
function getIncludedTxIds(txsArg = [], modeArg = 'earning', currencyArg) {
  const included = new Set()

  const isExcludedFromStats = (t) => {
    if (!t) return false
    if (t.exclude_from_stats === true || t.exclude_from_stats === 'true' || t.exclude_from_stats === 1) return true
    // Card switched off in its settings (flag computed by the backend)
    if (t.card_excluded_from_stats) return true
    if (t.refund_for) return true
    const note = String(t.note || '')
    return note.includes('[refund_for:')
  }

  const amountForStats = (t) => {
    const v = t?.amount_stat
    if (v === null || v === undefined || v === '') return Number(t?.amount || 0)
    return Number(v || 0)
  }

  // helper: normalize currency
  const curMatch = (t) => {
    const txCur = t.currency ? String(t.currency).toUpperCase() : undefined
    if (currencyArg && txCur !== currencyArg) return false
    return true
  }

  // group transfers by transfer_id (skip archived transactions)
  const transferGroups = new Map()
  for (const t of txsArg || []) {
    if (t.archives) continue
    if (isExcludedFromStats(t)) continue
    if (t.is_transfer && t.transfer_id) {
      const arr = transferGroups.get(t.transfer_id) || []
      arr.push(t)
      transferGroups.set(t.transfer_id, arr)
    }
  }

  // handle non-transfer txs first
  for (const t of txsArg || []) {
    if (t.archives) continue
    if (t.is_transfer) continue
    if (isExcludedFromStats(t)) continue
    // determine savings either from explicit flag or from card label
    const tIsSavings = !!t.is_savings || String(t.card || '').toLowerCase().includes('збер') || String(t.card || '').toLowerCase().includes('savings')
    if (tIsSavings) continue
    if (!curMatch(t)) continue
    const amt = Number(amountForStats(t) || 0)
    if (modeArg === 'spending') {
      if (amt >= 0) continue
      included.add(t.id)
      continue
    }
    if (amt > 0) included.add(t.id)
  }

  // process transfer groups
  for (const [id, group] of transferGroups.entries()) {
    // try to find both sides
    const src = group.find(g => g.transfer_role === 'from')
    const tgt = group.find(g => g.transfer_role === 'to')

    // if we have both sides
    if (src && tgt) {
      // derive savings flags from explicit or card label
      const srcSavings = !!src.is_savings || String(src.card || '').toLowerCase().includes('збер') || String(src.card || '').toLowerCase().includes('savings')
      const tgtSavings = !!tgt.is_savings || String(tgt.card || '').toLowerCase().includes('збер') || String(tgt.card || '').toLowerCase().includes('savings')

      // both non-savings -> ignore
      if (!srcSavings && !tgtSavings) continue

      // from savings -> count only target as income (if currency matches)
      if (srcSavings && !tgtSavings) {
        if (curMatch(tgt)) {
          // only count as income (positive amount)
          if (modeArg === 'earning' && Number(amountForStats(tgt) || 0) > 0) included.add(tgt.id)
        }
        continue
      }

      // to savings -> count only source as spending
      if (tgtSavings && !srcSavings) {
        if (curMatch(src)) {
          if (modeArg === 'spending' && Number(amountForStats(src) || 0) < 0) included.add(src.id)
          // if mode is earning, we shouldn't count the savings target
        }
        continue
      }

      // both savings -> ignore
      continue
    }

    // single side present (edge cases) - rely on flags
    const single = (src || tgt)
    if (!single) continue
    // if 'to' and marked as count_as_income -> include as income
    if (single.transfer_role === 'to' && single.count_as_income) {
      if (curMatch(single) && modeArg === 'earning' && Number(amountForStats(single) || 0) > 0) included.add(single.id)
      continue
    }
    // if 'from' and is_savings -> skip expense from savings
    const singleSavings = !!single.is_savings || String(single.card || '').toLowerCase().includes('збер') || String(single.card || '').toLowerCase().includes('savings')
    if (single.transfer_role === 'from' && singleSavings) {
      continue
    }
    // otherwise ignore transfers between non-savings
  }

  return included
}

// Transactions counted as income or spending (same rules as before: savings, internal
// transfers, refunds and switched-off cards are left out)
function includedTxIds(txsArg) {
  return new Set([...getIncludedTxIds(txsArg, 'earning', null), ...getIncludedTxIds(txsArg, 'spending', null)])
}

// Crypto (USDT, Binance balance sync) stays out of income and spending, like the cards above the chart
function isCryptoTx(t) {
  return String(t.currency || '').toUpperCase() === 'USDT' ||
    t.category === 'Binance Sync' ||
    String(t.card || '').toLowerCase().includes('binance')
}

function computeFlowData(txsArg, fromArg, toArg, primary, rates) {
  const amountForStats = (t) => {
    const v = t?.amount_stat
    if (v === null || v === undefined || v === '') return Number(t?.amount || 0)
    return Number(v || 0)
  }
  const income = getIncludedTxIds(txsArg, 'earning', null)
  const spending = getIncludedTxIds(txsArg, 'spending', null)

  const byDay = new Map() // iso -> { income, expense } in the main currency
  for (const t of txsArg || []) {
    const isIncome = income.has(t.id)
    if (!isIncome && !spending.has(t.id)) continue
    if (isCryptoTx(t)) continue
    const cur = String(t.currency || 'UAH').toUpperCase()
    const value = convertAmount(Math.abs(amountForStats(t)), cur, primary, rates)
    if (value == null) continue // rate not loaded yet — recomputed when it is
    const key = dayKey(t.created_at)
    const day = byDay.get(key) || { income: 0, expense: 0 }
    if (isIncome) day.income += value
    else day.expense += value
    byDay.set(key, day)
  }

  const start = new Date(fromArg)
  const end = new Date(toArg)
  end.setDate(end.getDate() + 1)
  const out = []
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const iso = dayKey(d) // local date key
    const day = byDay.get(iso) || { income: 0, expense: 0 }
    out.push({
      name: fmtLabel(iso),
      _iso: iso,
      income: Number(day.income.toFixed(2)),
      expense: Number(day.expense.toFixed(2)),
    })
  }
  return out
}


export default function EarningsChart(){
  // Використовуємо новий store
  const settings = useSettingsStore((state) => state.settings)
  const updateNestedSetting = useSettingsStore((state) => state.updateNestedSetting)
const initialized = useSettingsStore((state) => state.initialized)
  const rates = useMonoRates()
  // Everything is shown in the main currency from the settings (like the iPhone app)
  const primary = usePrimaryCurrency()

// Period: the current week/month (offset 0) or one of the previous ones
  const [period, setPeriod] = useState('month') // 'week' | 'month'
  const [offset, setOffset] = useState(0)
  // Today's date, so offset 0 moves on by itself when a new week / month starts
  const [today, setToday] = useState(() => localIso(new Date()))
  const range = useMemo(
    () => periodRange(period, offset, new Date(`${today}T12:00:00`)),
    [period, offset, today]
  )
  const rangeRef = useRef(range)
  rangeRef.current = range
  const loadedOnceRef = useRef(false)
const [loading, setLoading] = useState(false)
  const [txs, setTxs] = useState([])
  const [hasTxCurrency, setHasTxCurrency] = useState(() => {
    try {
      const v = localStorage.getItem('wallet:hasTxCurrency')
      if (v === 'false') return false
      return true
    } catch { return true }
  })
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const [animKey, setAnimKey] = useState(0)
  const prevAnimKeyRef = useRef(animKey)
  // determine small/mobile-like viewport so tooltip/bar behavior follows viewport size
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    try { return typeof window !== 'undefined' && window.innerWidth < 768 } catch { return false }
  })

  useEffect(() => {
    const onResize = () => {
      try { setIsMobileViewport(window.innerWidth < 768) } catch {}
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Ініціалізувати з settings store (один запит на проєкт)
  useEffect(() => {
    if (!initialized || !settings) return
    const chart = settings?.chart || {}
if (chart.period === 'week' || chart.period === 'month') setPeriod(chart.period)
setPrefsLoaded(true)
  }, [initialized, settings])

  // displayData is what is currently visible. We render a single chart and
  // let Recharts animate bar heights. When the user requests an animated
  // transition (animKey), we bump `chartKey` to re-mount the chart so the
  // internal animation runs once — this avoids layered cross-fades and
  // duplicated animations.
  const [displayData, setDisplayData] = useState([])
  const [chartKey, setChartKey] = useState(0)
  const [dayModalOpen, setDayModalOpen] = useState(false)
  const [dayTxs, setDayTxs] = useState([])
  // modal states for per-transaction actions inside day modal
  const [showDetails, setShowDetails] = useState(false)
  const [activeTx, setActiveTx] = useState(null)
  const [activeCurrency, setActiveCurrency] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editTx, setEditTx] = useState(null)
  const chartContainerRef = useRef(null)
  
  // Захист від дублювання через AbortController
  const abortControllerRef = useRef(null)

  // Income and spending over the visible period
  const totals = useMemo(
    () => (displayData || []).reduce(
      (acc, d) => ({ income: acc.income + (d.income || 0), expense: acc.expense + (d.expense || 0) }),
      { income: 0, expense: 0 }
    ),
    [displayData]
  )


  // Enable touch move for chart tooltip on mobile
  useEffect(() => {
    if (!isMobileViewport || !chartContainerRef.current) return

    const container = chartContainerRef.current
    
    const handleTouchMove = (e) => {
      const touch = e.touches[0]
      const target = document.elementFromPoint(touch.clientX, touch.clientY)
      
      // Simulate mouseover event for Recharts
      if (target) {
        const mouseEvent = new MouseEvent('mouseover', {
          bubbles: true,
          cancelable: true,
          clientX: touch.clientX,
          clientY: touch.clientY,
        })
        target.dispatchEvent(mouseEvent)
      }
    }

    container.addEventListener('touchmove', handleTouchMove, { passive: true })
    
    return () => {
      container.removeEventListener('touchmove', handleTouchMove)
    }
  }, [isMobileViewport])

  // initialize displayData when component mounts
  useEffect(() => {
    setDisplayData(computeFlowData(txs, range.from, range.to, primary, rates))
  }, [])

  // keep display in sync; when animKey changes, the hook will update
  // displayData and bump chartKey to retrigger Recharts animation once.
  useChartSync(txs, range.from, range.to, primary, rates, animKey, setDisplayData, prevAnimKeyRef, setChartKey)

  useEffect(() => {
    const tick = () => setToday(localIso(new Date()))
    const id = setInterval(tick, 60 * 1000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  const fetchData = async ({ showLoading = true } = {}) => {
    // Скасовуємо попередній запит, якщо він є
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Створюємо новий AbortController
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    if (showLoading) setLoading(true)

    const { from, to } = rangeRef.current
    const fromTs = new Date(from).toISOString()
    const toTs = new Date(new Date(to).getTime() + 24*60*60*1000 - 1).toISOString()
    
    try {
      // Try selecting currency directly from transactions. Some DB schemas may not have
      // `transactions.currency` yet; if the RPC returns a 42703 (column not found),
      // fall back to fetching transactions without the column and then fetch card
      // currencies to derive a per-transaction currency when possible.
      // Select column list depending on whether we've previously detected
      // that `transactions.currency` exists. Cache negative detection in
      // localStorage to avoid repeated 400s.
      const fields = hasTxCurrency
        ? 'id,amount,amount_stat,exclude_from_stats,created_at,category,note,refund_for,is_transfer,count_as_income,transfer_role,card_id,currency,card,archives'
        : 'id,amount,amount_stat,exclude_from_stats,created_at,category,note,refund_for,is_transfer,count_as_income,transfer_role,card_id,card,archives'

      // Перевіряємо перед виконанням запиту
      if (abortController.signal.aborted) return

      let data
      try {
        data = await apiFetch(
          `/api/transactions?start_date=${fromTs}&end_date=${toTs}&fields=${fields}&order_by=created_at&order_asc=true`,
          { signal: abortController.signal }
        ) || []
        
        // Перевіряємо після отримання відповіді
        if (abortController.signal.aborted) return
      } catch (e) {
        // If the DB complains about missing `currency` column, remember it and retry
        // Check for both error code (42703) and error message text
        const isCurrencyColumnError = hasTxCurrency && (
          e.message?.includes('42703') || 
          e.message?.includes('currency does not exist') ||
          e.message?.includes('column transactions.currency') ||
          e.message?.toLowerCase().includes('column') && e.message?.toLowerCase().includes('currency') && e.message?.toLowerCase().includes('not exist')
        )
        
        if (isCurrencyColumnError) {
          console.warn('transactions.currency column missing, disabling currency column for future queries')
          try { localStorage.setItem('wallet:hasTxCurrency', 'false') } catch {}
          setHasTxCurrency(false)

          // Перевіряємо перед повторним запитом
          if (abortController.signal.aborted) return

          // Retry without currency column
          const retryFields = 'id,amount,amount_stat,exclude_from_stats,created_at,category,note,refund_for,is_transfer,count_as_income,transfer_role,card_id,card,archives'
          data = await apiFetch(
            `/api/transactions?start_date=${fromTs}&end_date=${toTs}&fields=${retryFields}&order_by=created_at&order_asc=true`,
            { signal: abortController.signal }
          ) || []
          
          // Перевіряємо після повторного запиту
          if (abortController.signal.aborted) return
        } else {
          throw e
        }
      }

      // Перевіряємо перед виконанням запиту карток
      if (abortController.signal.aborted) return

      // fetch cards to get currency and detect savings accounts per card (using cached API)
      const cardIds = Array.from(new Set((data || []).map(t => t.card_id).filter(Boolean)))
      let cardsMap = new Map()
      if (cardIds.length) {
        const allCards = await listCards() // Get all cards from cache
        
        // Перевіряємо після отримання карток
        if (abortController.signal.aborted) return
        
        const cards = allCards.filter(c => cardIds.includes(c.id)) // Filter to needed IDs
        for (const c of cards || []) {
          const bank = (c?.bank || '') + ' ' + (c?.name || '')
          const isSavings = String(bank).toLowerCase().includes('збер') || String(bank).toLowerCase().includes('savings')
          cardsMap.set(c.id, { currency: (c.currency || 'UAH').toUpperCase(), isSavings })
        }
      }

      // Перевіряємо перед оновленням стану
      if (abortController.signal.aborted) return

      // attach derived currency and is_savings to each tx record
      const enriched = (data || []).map(t => ({
        ...t,
        currency: (t.currency || cardsMap.get(t.card_id)?.currency || undefined),
        is_savings: (cardsMap.get(t.card_id)?.isSavings || false)
      }))
      setTxs(enriched)
    } catch (e) {
      // Ігноруємо помилки скасування
      if (e.name === 'AbortError' || abortController.signal.aborted) return
      console.error('fetch chart txs failed', e)
      if (!abortController.signal.aborted) {
        setTxs([])
      }
    } finally {
      // Always clear it: a quiet reload may have aborted the request that turned it on
      if (!abortController.signal.aborted) setLoading(false)
    }
  }

  // Load the selected period right away (no Apply button)
  useEffect(() => {
    fetchData({ showLoading: !loadedOnceRef.current })
    if (loadedOnceRef.current) setAnimKey(k => k + 1)
    loadedOnceRef.current = true
  }, [range.from, range.to])

  // Зберегти налаштування в БД при зміні (через store з debounce)
  useEffect(() => {
    if (!prefsLoaded) return // Не зберігаємо налаштування поки вони не завантажились
    
    // Оновлюємо через store (автоматично зберігається через debounce)
    // The period type is saved; the chart always opens on the current week / month
    updateNestedSetting('chart', { period })
  }, [period, prefsLoaded, updateNestedSetting])

  // handler for clicking a bar (desktop) — open day modal for clicked iso
  const handleBarClick = (data) => {
    try {
      const iso = data?.payload?._iso || data?._iso
      if (!iso) return
      const included = includedTxIds(txs || [])
      const txsForDay = (txs || []).filter(t => {
        try { 
          if (dayKey(t.created_at) !== iso) return false
          if (!included.has(t.id)) return false
          if (isCryptoTx(t)) return false
return true
        } catch { return false }
      })
      setDayTxs(txsForDay)
      setDayModalOpen(true)
    } catch (e) { console.error('bar click failed', e) }
  }

  // Prefer silent/background refresh for external tx events so we don't flash the
  // full loading placeholder and can keep chart animations smooth.
  useEffect(() => {
    if (!txBus || typeof txBus.subscribe !== 'function') return
    const timeout = { id: null }
    const unsub = txBus.subscribe(() => {
      if (timeout.id) clearTimeout(timeout.id)
      timeout.id = setTimeout(() => { fetchData({ showLoading: false }) }, 150)
    })
    return () => { 
      if (typeof unsub === 'function') unsub()
      if (timeout.id) clearTimeout(timeout.id)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])


  return (
    <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} className="bg-gradient-to-b from-white/[0.075] to-white/[0.025] backdrop-blur-xl rounded-3xl p-3 md:p-5 shadow-glass border border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-lg font-bold tracking-tight">Доходи і витрати</div>
        {/* Week / month */}
        <div className="flex rounded-full bg-white/[0.06] p-0.5">
          {[{ id: 'week', label: 'Тиждень' }, { id: 'month', label: 'Місяць' }].map(o => (
            <button
              key={o.id}
              onClick={() => { setPeriod(o.id); setOffset(0) }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
                period === o.id ? 'bg-white/[0.14] text-white' : 'text-white/55 hover:text-white'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

      </div>

      {/* ‹ period › and its total */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset(o => o - 1)}
            className="h-8 w-8 grid place-items-center rounded-full bg-white/[0.06] hover:bg-white/10 text-white/80 transition-colors"
            aria-label="Попередній період"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setOffset(0)}
            className="px-2 min-w-[132px] text-center"
            title="До поточного періоду"
          >
            <div className="text-sm font-bold leading-tight">{range.label}</div>
            <div className={`text-[10px] font-semibold leading-tight ${offset === 0 ? 'text-brand' : 'text-white/40'}`}>
              {offset === 0 ? (period === 'week' ? 'Цей тиждень' : 'Цей місяць') : 'Натисніть — до поточного'}
            </div>
          </button>
          <button
            onClick={() => setOffset(o => Math.min(0, o + 1))}
            disabled={offset >= 0}
            className="h-8 w-8 grid place-items-center rounded-full bg-white/[0.06] hover:bg-white/10 text-white/80 transition-colors disabled:opacity-30 disabled:hover:bg-white/[0.06]"
            aria-label="Наступний період"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-3 text-sm font-bold tabular-nums">
          <span className="flex items-center gap-1.5 text-green-400">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: INCOME_COLOR }} />
            +{fmtMoney(totals.income, primary)}
          </span>
          <span className="flex items-center gap-1.5 text-[#FF6B6B]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: EXPENSE_COLOR }} />
            -{fmtMoney(totals.expense, primary)}
          </span>
        </div>
      </div>

      <div 
        ref={chartContainerRef} 
        className="h-64 md:h-80 relative cursor-pointer"
        onClick={(e) => {
          // Перевіряємо, чи клік був по стовпчику (тоді handleBarClick вже обробив)
          if (e.target.closest('.recharts-bar')) return
          
          // Визначаємо, на який день клікнули, використовуючи координати кліку
          const rect = chartContainerRef.current?.getBoundingClientRect()
          if (!rect || !displayData.length) return
          
          // Враховуємо margins графіку (left margin для YAxis)
          const marginLeft = window.innerWidth < 768 ? 40 : 60
          const clickX = e.clientX - rect.left - marginLeft
          const chartWidth = rect.width - marginLeft
          
          if (clickX < 0 || clickX > chartWidth) return
          
          const dayIndex = Math.floor((clickX / chartWidth) * displayData.length)
          
          if (dayIndex >= 0 && dayIndex < displayData.length) {
            const clickedDay = displayData[dayIndex]
            if (clickedDay?._iso) {
              const included = includedTxIds(txs || [])
              const txsForDay = (txs || []).filter(t => {
                try { 
                  if (dayKey(t.created_at) !== clickedDay._iso) return false
                  if (!included.has(t.id)) return false
                  if (isCryptoTx(t)) return false
return true
                } catch { return false }
              })
              setDayTxs(txsForDay)
              setDayModalOpen(true)
            }
          }
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-white/55">Завантаження...</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {/* Single-layer chart: rely on Recharts' built-in animation for smooth updates. */}
            <BarChart
              key={chartKey}
              data={displayData}
              margin={{ left: 0, right: 0, top: 12, bottom: window.innerWidth < 768 ? 10 : 18 }}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: window.innerWidth < 768 ? 9 : 11, fill: 'rgba(255,255,255,0.45)' }} 
                axisLine={false} 
                tickLine={false} 
                angle={window.innerWidth < 768 ? 0 : -45} 
                textAnchor={window.innerWidth < 768 ? "middle" : "end"} 
                height={window.innerWidth < 768 ? 22 : 28}
                interval={window.innerWidth < 768 ? 'preserveStartEnd' : 0}
              />
              <YAxis 
                tick={{ fontSize: window.innerWidth < 768 ? 9 : 11, fill: 'rgba(255,255,255,0.45)' }} 
                axisLine={false} 
                tickLine={false}
                width={window.innerWidth < 768 ? 40 : 60}
              />
              <Tooltip 
                trigger="hover"
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                animationDuration={200}
                content={<FlowTooltip currency={primary} />}
              />
              <Bar
                dataKey="income"
                name="Доходи"
                fill={INCOME_COLOR}
                isAnimationActive={true}
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
                cursor="pointer"
                onClick={handleBarClick}
              />
              <Bar
                dataKey="expense"
                name="Витрати"
                fill={EXPENSE_COLOR}
                isAnimationActive={true}
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
                cursor="pointer"
                onClick={handleBarClick}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {createPortal(
        <BaseModal
          open={dayModalOpen}
          onClose={() => setDayModalOpen(false)}
          title="Транзакції за день"
          zIndex={100}
          maxWidth="2xl"
        >
          <div className="max-h-[60vh] overflow-auto space-y-2">
            {dayTxs.length === 0 ? (
              <div className="text-sm text-white/55">Немає транзакцій за цей день</div>
            ) : (
              <>
                {dayTxs.map(tx => (
                  <Row
                    key={tx.id}
                    tx={tx}
                    currency={(tx.currency || null)}
                    // In stats modals, show amount_stat (net) if present
                    amountOverride={
                      tx?.amount_stat != null && Number(tx.amount_stat) !== Number(tx.amount)
                        ? { primaryAmount: Number(tx.amount_stat || 0), secondaryAmount: Number(tx.amount || 0), currency: (tx.currency || null) }
                        : null
                    }
                    onDetails={(t, c) => { setActiveTx(t); setActiveCurrency(c); setShowDetails(true) }}
                    onAskDelete={(t) => { setPendingDelete(t); setConfirmOpen(true) }}
                    onEdit={(t) => { setEditTx(t); setEditOpen(true) }}
                  />
                ))}
              </>
            )}
          </div>
        </BaseModal>,
        document.body
      )}

      {/* Details / Edit / Confirm modals for per-transaction actions */}
      <DetailsModal open={showDetails} tx={activeTx} currency={activeCurrency} onClose={() => setShowDetails(false)} />
      <EditTxModal open={editOpen} tx={editTx} onClose={() => setEditOpen(false)} onSaved={(updated) => {
        // update txs and dayTxs to reflect edits
        setTxs(prev => prev.map(r => r.id === updated.id ? updated : r))
        setDayTxs(prev => prev.map(r => r.id === updated.id ? updated : r))
      }} />
      <DeleteTxModal
        open={confirmOpen}
        transaction={pendingDelete}
        onDelete={async () => {
          if (!pendingDelete) return
          try {
            await deleteTransaction(pendingDelete.id)
            setTxs(prev => prev.filter(r => r.id !== pendingDelete.id))
            setDayTxs(prev => prev.filter(r => r.id !== pendingDelete.id))
            try { txBus.emit({ card_id: pendingDelete.card_id || null, delta: Number(pendingDelete.amount || 0) * -1 }) } catch(e){}
          } catch (e) {
            console.error('Delete tx error:', e)
            alert('Не вдалося видалити транзакцію')
          } finally {
            setConfirmOpen(false)
            setPendingDelete(null)
          }
        }}
        onArchive={async () => {
          if (!pendingDelete) return
          try {
            await archiveTransaction(pendingDelete.id)
            setTxs(prev => prev.filter(r => r.id !== pendingDelete.id))
            setDayTxs(prev => prev.filter(r => r.id !== pendingDelete.id))
            try { txBus.emit({ card_id: pendingDelete.card_id || null, delta: Number(pendingDelete.amount || 0) * -1 }) } catch(e){}
          } catch (e) {
            console.error('Archive tx error:', e)
            alert('Не вдалося архівувати транзакцію')
          } finally {
            setConfirmOpen(false)
            setPendingDelete(null)
          }
        }}
        onCancel={() => { setConfirmOpen(false); setPendingDelete(null) }}
      />
    </motion.div>
  )
}

// Synchronize compute->display when txs or controls change. We want to cross-fade
// when animKey was bumped (a new period). Otherwise replace immediately.
function useChartSync(txs, from, to, primary, rates, animKey, setDisplayData, prevAnimKeyRef, setChartKey) {
  useEffect(() => {
    const newData = computeFlowData(txs, from, to, primary, rates)
    const prevKey = prevAnimKeyRef.current
    if (animKey !== prevKey) {
      // user requested an animated transition: update data and bump chartKey
      prevAnimKeyRef.current = animKey
      setDisplayData(newData)
      try { setChartKey(k => k + 1) } catch {}
      return
    }
    // immediate replace
    setDisplayData(newData)
  }, [txs, from, to, primary, rates, animKey, setDisplayData, prevAnimKeyRef, setChartKey])
}
