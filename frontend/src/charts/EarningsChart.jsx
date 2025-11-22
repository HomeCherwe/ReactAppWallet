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
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../utils.jsx'
import { txBus } from '../utils/txBus'
import { updatePreferencesSection } from '../api/preferences'
import { usePreferences } from '../context/PreferencesContext'
import { listCards } from '../api/cards'

// Кольори для різних валют
const CURRENCY_COLORS = {
  'UAH': '#3b82f6',   // синій
  'USD': '#10b981',    // зелений
  'EUR': '#f59e0b',    // помаранчевий
  'USDT': '#8b5cf6',   // фіолетовий
  'DEFAULT': '#6b7280' // сірий
}

const getCurrencyColor = (currency) => {
  return CURRENCY_COLORS[currency] || CURRENCY_COLORS.DEFAULT
}

const CustomTooltip = ({ active, payload, label, onPointClick, isMobile, currency, mode }) => {
  if (active && payload && payload.length) {
    const isSpending = mode === 'spending'
    const sign = isSpending ? '-' : '+'
    
    // Якщо currency === 'ALL', показуємо всі валюти з payload
    if (currency === 'ALL') {
      // Фільтруємо тільки ненульові значення
      const nonZeroPayloads = payload.filter(p => p.value && p.value !== 0)
      if (nonZeroPayloads.length === 0) {
        return <div style={{ opacity: 0, pointerEvents: 'none' }} />
      }
      
      const iso = payload[0]?.payload?._iso
      const handleActivate = (e) => {
        try {
          if (e && typeof e.preventDefault === 'function') e.preventDefault()
          if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
        } catch (err) {}
        if (onPointClick && iso) onPointClick(iso)
      }

      return (
        <div
          role={isMobile ? "button" : undefined}
          tabIndex={isMobile ? 0 : undefined}
          className={`bg-white shadow-soft rounded-lg px-3 py-2 text-sm ${isMobile ? 'cursor-pointer select-none active:scale-95 transition-transform' : ''}`}
          style={{ pointerEvents: isMobile ? 'auto' : 'none', touchAction: 'manipulation' }}
          onClick={isMobile ? handleActivate : undefined}
          onTouchEnd={isMobile ? handleActivate : undefined}
          title={isMobile ? "Натисніть, щоб побачити транзакції цього дня" : undefined}
        >
          <div className="text-xs text-gray-500 mb-1">{label}</div>
          {nonZeroPayloads.map((p, idx) => {
            const cur = p.dataKey || 'UAH'
            const amountColor = isSpending ? 'text-red-600' : 'text-green-600'
            return (
              <div key={idx} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded" 
                  style={{ backgroundColor: getCurrencyColor(cur) }}
                />
                <div className={`font-semibold ${amountColor}`}>
                  {sign}{p.value.toLocaleString()} {cur}
                </div>
              </div>
            )
          })}
          {isMobile ? (
            <div className="text-xs text-gray-400 mt-1">👆 Детальніше</div>
          ) : (
            <div className="text-xs text-gray-400 mt-1">🖱️ Клік для деталей</div>
          )}
        </div>
      )
    }
    
    // Стандартний tooltip для однієї валюти
    const value = payload[0]?.value
    if (!value || value === 0) {
      return <div style={{ opacity: 0, pointerEvents: 'none' }} />
    }
    
    const iso = payload[0]?.payload?._iso
    const handleActivate = (e) => {
      try {
        if (e && typeof e.preventDefault === 'function') e.preventDefault()
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
      } catch (err) {}
      if (onPointClick && iso) onPointClick(iso)
    }

    const amountColor = isSpending ? 'text-red-600' : 'text-green-600'

    return (
      <div
        role={isMobile ? "button" : undefined}
        tabIndex={isMobile ? 0 : undefined}
        className={`bg-white shadow-soft rounded-lg px-3 py-2 text-sm ${isMobile ? 'cursor-pointer select-none active:scale-95 transition-transform' : ''}`}
        style={{ pointerEvents: isMobile ? 'auto' : 'none', touchAction: 'manipulation' }}
        onClick={isMobile ? handleActivate : undefined}
        onTouchEnd={isMobile ? handleActivate : undefined}
        title={isMobile ? "Натисніть, щоб побачити транзакції цього дня" : undefined}
      >
        <div className={`font-semibold ${amountColor}`}>{sign}{value.toLocaleString()} {currency || 'UAH'}</div>
        <div className="text-xs text-gray-500">{label}</div>
        {isMobile ? (
          <div className="text-xs text-gray-400 mt-1">👆 Детальніше</div>
        ) : (
          <div className="text-xs text-gray-400 mt-1">🖱️ Клік для деталей</div>
        )}
      </div>
    )
  }
  return null
}

function dayKey(dt) {
  const d = new Date(dt)
  // yyyy-mm-dd
  return d.toISOString().slice(0,10)
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
    // determine savings either from explicit flag or from card label
    const tIsSavings = !!t.is_savings || String(t.card || '').toLowerCase().includes('збер') || String(t.card || '').toLowerCase().includes('savings')
    if (tIsSavings) continue
    if (!curMatch(t)) continue
    const amt = Number(t.amount || 0)
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
          if (modeArg === 'earning' && Number(tgt.amount || 0) > 0) included.add(tgt.id)
        }
        continue
      }

      // to savings -> count only source as spending
      if (tgtSavings && !srcSavings) {
        if (curMatch(src)) {
          if (modeArg === 'spending' && Number(src.amount || 0) < 0) included.add(src.id)
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
      if (curMatch(single) && modeArg === 'earning' && Number(single.amount || 0) > 0) included.add(single.id)
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

function computeChartData(txsArg, modeArg, fromArg, toArg, currencyArg) {
  // Якщо вибрано ALL, групуємо по валютах
  if (currencyArg === 'ALL') {
    const included = getIncludedTxIds(txsArg, modeArg, null) // null = всі валюти
    const currencyMaps = new Map() // currency -> Map(day -> amount)

    for (const t of txsArg || []) {
      if (!included.has(t.id)) continue
      const txCur = (t.currency || 'UAH').toUpperCase()
      if (!currencyMaps.has(txCur)) {
        currencyMaps.set(txCur, new Map())
      }
      const curMap = currencyMaps.get(txCur)
      const key = dayKey(t.created_at)
      const amt = Number(t.amount || 0)
      if (modeArg === 'spending') {
        if (amt >= 0) continue
        curMap.set(key, (curMap.get(key) || 0) + Math.abs(amt))
        continue
      }
      if (amt > 0) curMap.set(key, (curMap.get(key) || 0) + amt)
    }

    const start = new Date(fromArg)
    const end = new Date(toArg)
    end.setDate(end.getDate() + 1)
    const out = []
    const currencies = Array.from(currencyMaps.keys()).sort()
    
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0,10)
      const dayData = { name: fmtLabel(iso), _iso: iso }
      
      // Додаємо значення для кожної валюти
      for (const cur of currencies) {
        const curMap = currencyMaps.get(cur)
        const value = Number((curMap.get(iso) || 0).toFixed(2))
        dayData[cur] = value
      }
      
      out.push(dayData)
    }
    return out
  }
  
  // Стандартна логіка для однієї валюти
  const included = getIncludedTxIds(txsArg, modeArg, currencyArg)
  const map = new Map()

  for (const t of txsArg || []) {
    if (!included.has(t.id)) continue
    const key = dayKey(t.created_at)
    const amt = Number(t.amount || 0)
    if (modeArg === 'spending') {
      if (amt >= 0) continue
      map.set(key, (map.get(key) || 0) + Math.abs(amt))
      continue
    }
    if (amt > 0) map.set(key, (map.get(key) || 0) + amt)
  }

  const start = new Date(fromArg)
  const end = new Date(toArg)
  end.setDate(end.getDate() + 1)
  
  const out = []
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0,10)
    const value = Number((map.get(iso) || 0).toFixed(2))
    out.push({ 
      name: fmtLabel(iso), 
      value, 
      _iso: iso
    })
  }
  return out
}


export default function EarningsChart(){
  const { preferences, loading: prefsLoading } = usePreferences()
  const [mode, setMode] = useState('earning') // 'earning' | 'spending'
  
  // Dashboard settings
  const showUsdtInChart = preferences?.dashboard?.showUsdtInChart !== false // default true
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0,10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0,10))
  // Applied dates - used for filtering
  const [appliedFrom, setAppliedFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0,10)
  })
  const [appliedTo, setAppliedTo] = useState(() => new Date().toISOString().slice(0,10))
  const [loading, setLoading] = useState(false)
  const [txs, setTxs] = useState([])
  const [currency, setCurrency] = useState(() => {
    try { return localStorage.getItem('wallet:chart:currency') || 'UAH' } catch { return 'UAH' }
  })
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

  // Ініціалізувати з контексту (один запит на проєкт)
  useEffect(() => {
    if (prefsLoading) return
    const chart = preferences?.chart || {}
    if (chart.currency) setCurrency(chart.currency)
    if (chart.mode) setMode(chart.mode)
    if (chart.from) setFrom(chart.from)
    if (chart.appliedFrom) setAppliedFrom(chart.appliedFrom)
    setPrefsLoaded(true)
  }, [prefsLoading, preferences])

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

  // Total for visible period (sum of bars)
  const periodTotal = useMemo(() => {
    try {
      if (currency === 'ALL') {
        // Для ALL рахуємо суму всіх валют
        return (displayData || []).reduce((acc, d) => {
          let dayTotal = 0
          // Сумуємо всі поля крім name та _iso
          for (const key in d) {
            if (key !== 'name' && key !== '_iso' && typeof d[key] === 'number') {
              dayTotal += d[key]
            }
          }
          return acc + dayTotal
        }, 0)
      }
      return (displayData || []).reduce((acc, d) => acc + Number(d.value || 0), 0)
    } catch { return 0 }
  }, [displayData, currency])

  // Totals by currency for ALL mode
  const periodTotalsByCurrency = useMemo(() => {
    if (currency !== 'ALL') return null
    
    try {
      const totals = {}
      ;(displayData || []).forEach(d => {
        for (const key in d) {
          if (key !== 'name' && key !== '_iso' && typeof d[key] === 'number') {
            // Фільтруємо USDT якщо налаштування вимкнено
            if (key === 'USDT' && !showUsdtInChart) continue
            if (!totals[key]) totals[key] = 0
            totals[key] += d[key]
          }
        }
      })
      
      // Сортуємо валюти: спочатку UAH, потім інші в алфавітному порядку
      const sorted = Object.entries(totals)
        .map(([cur, sum]) => ({ currency: cur, total: Number(sum.toFixed(2)) }))
        .sort((a, b) => {
          if (a.currency === 'UAH') return -1
          if (b.currency === 'UAH') return 1
          return a.currency.localeCompare(b.currency)
        })
      
      return sorted
    } catch {
      return null
    }
  }, [displayData, currency, showUsdtInChart])


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
    setDisplayData(computeChartData(txs, mode, appliedFrom, appliedTo, currency))
  }, [])

  // keep display in sync; when animKey changes, the hook will update
  // displayData and bump chartKey to retrigger Recharts animation once.
  useChartSync(txs, mode, appliedFrom, appliedTo, currency, animKey, setDisplayData, prevAnimKeyRef, setChartKey)

  const fetchData = async ({ showLoading = true } = {}) => {
    // Скасовуємо попередній запит, якщо він є
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Створюємо новий AbortController
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    if (showLoading) setLoading(true)
    
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
        ? 'id,amount,created_at,category,note,is_transfer,count_as_income,transfer_role,card_id,currency,card,archives'
        : 'id,amount,created_at,category,note,is_transfer,count_as_income,transfer_role,card_id,card,archives'

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
          const retryFields = 'id,amount,created_at,category,note,is_transfer,count_as_income,transfer_role,card_id,card,archives'
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
      if (!abortController.signal.aborted) {
        if (showLoading) setLoading(false)
      }
    }
  }

  useEffect(() => { 
    fetchData({ showLoading: true }) 
  }, [])

  // Зберегти налаштування в БД при зміні (з debounce)
  useEffect(() => {
    if (!prefsLoaded) return // Не зберігаємо налаштування поки вони не завантажились
    
    const timeoutId = setTimeout(() => {
      updatePreferencesSection('chart', {
        currency,
        mode,
        from,
        appliedFrom
        // to та appliedTo не зберігаємо - завжди сьогоднішня дата
      })
    }, 500) // Debounce 500ms
    
    return () => clearTimeout(timeoutId)
  }, [currency, mode, from, appliedFrom, prefsLoaded])

  // handler for clicking a bar (desktop) — open day modal for clicked iso
  const handleBarClick = (data) => {
    try {
      const iso = data?.payload?._iso || data?._iso
      if (!iso) return
      const included = getIncludedTxIds(txs || [], mode, currency === 'ALL' ? null : currency)
      const txsForDay = (txs || []).filter(t => {
        try { return new Date(t.created_at).toISOString().slice(0,10) === iso && included.has(t.id) } catch { return false }
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

  // Period changes are applied only when user clicks Apply. Presets update the
  // from/to inputs but do NOT trigger fetch automatically.

  // computeChartData is used by both the component and the sync hook. Keep it
  // at module scope so hooks and effects can reference it without hoisting
  // issues when the component is mounted.
  function computeChartData(txsArg, modeArg, fromArg, toArg, currencyArg) {
    const map = new Map()
    for (const t of txsArg || []) {
      // skip transfer-internal transactions and savings (they shouldn't affect earnings chart)
      if (t.is_transfer) continue
      if (t.is_savings) continue
      // prefer explicit transaction currency; if missing, treat as undefined so
      // it won't be accidentally coalesced to UAH — chart filters by selected
      // currency, and if none is selected, we may show combined view per-currency elsewhere.
      const txCur = t.currency ? String(t.currency).toUpperCase() : undefined
      if (currencyArg && txCur !== currencyArg) continue
      const key = dayKey(t.created_at)
      const amt = Number(t.amount || 0)
      if (modeArg === 'spending') {
        if (amt >= 0) continue
        map.set(key, (map.get(key) || 0) + Math.abs(amt))
        continue
      }
      if (amt > 0) map.set(key, (map.get(key) || 0) + amt)
    }

    const start = new Date(fromArg)
    const end = new Date(toArg)
    // Add one more day to include the end date in range
    end.setDate(end.getDate() + 1)
    const out = []
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0,10)
      const value = Number((map.get(iso) || 0).toFixed(2))
      // Показуємо всі дні, включаючи пусті
      out.push({ name: fmtLabel(iso), value, _iso: iso })
    }
    return out
  }

  return (
    <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} className="bg-white rounded-2xl p-3 md:p-5 shadow-soft">
      <div className="flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-3 mb-2">
          <div className="flex items-center gap-2 justify-center w-full sm:w-auto">
          <button onClick={() => { setMode('earning'); setAnimKey(k => k + 1); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${mode==='earning' ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}>Дохід</button>
          <button onClick={() => { setMode('spending'); setAnimKey(k => k + 1); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${mode==='spending' ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}>Витрата</button>
        </div>
        <div className="ml-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 text-xs w-full sm:w-auto">
          {/* Currency selector with icon */}
          <div className="flex items-center gap-2 border rounded px-2 py-1 bg-white flex-1 sm:flex-none">
            <select aria-label="Currency" className="appearance-none bg-transparent text-sm font-semibold w-full sm:w-auto" value={currency} onChange={e=>{
              const v = e.target.value
              setCurrency(v)
              // Збереження в БД відбувається через useEffect
              setAnimKey(k => k + 1)
              // Не викликаємо fetchData тут, оскільки це змінить відображені дані
              // Дані оновлюються через useChartSync
            }}>
              <option>ALL</option>
              <option>UAH</option>
              <option>EUR</option>
              <option>USD</option>
              <option>USDT</option>
            </select>
          </div>

          {/* From date with calendar icon */}
          <div className="flex items-center gap-2 border rounded px-2 py-1 bg-white flex-1 sm:flex-none">
            <input aria-label="From date" type="date" value={from} onChange={e=>setFrom(e.target.value)} className="text-sm font-semibold appearance-none bg-transparent w-full sm:w-auto" />
          </div>

          {/* To date with calendar icon */}
          <div className="flex items-center gap-2 border rounded px-2 py-1 bg-white flex-1 sm:flex-none">
            <input aria-label="To date" type="date" value={to} onChange={e=>setTo(e.target.value)} className="text-sm font-semibold appearance-none bg-transparent w-full sm:w-auto" />
          </div>

          <button onClick={() => { 
            setAppliedFrom(from)
            setAppliedTo(to)
            fetchData({ showLoading: true }); 
            setAnimKey(k => k + 1) 
          }} className="btn btn-soft text-xs px-3 w-full sm:w-auto">Apply</button>
        </div>
      </div>

      {/* Period total */}
      <div className="flex justify-end mb-1">
        {currency === 'ALL' && periodTotalsByCurrency && periodTotalsByCurrency.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {periodTotalsByCurrency.map(({ currency: cur, total }) => (
              <div key={cur} className="flex items-center gap-1.5">
                <div 
                  className="w-3 h-3 rounded" 
                  style={{ backgroundColor: getCurrencyColor(cur) }}
                />
                <div className={`${mode==='spending' ? 'text-red-600' : 'text-green-600'} text-xs sm:text-sm font-semibold`}>
                  {mode==='spending' ? '-' : '+'}{total.toLocaleString()} {cur}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={`${mode==='spending' ? 'text-red-600' : 'text-green-600'} text-xs sm:text-sm font-semibold`}>
            {mode==='spending' ? '-' : '+'}{periodTotal.toLocaleString()} {currency}
          </div>
        )}
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
              const included = getIncludedTxIds(txs || [], mode, currency === 'ALL' ? null : currency)
              const txsForDay = (txs || []).filter(t => {
                try { return new Date(t.created_at).toISOString().slice(0,10) === clickedDay._iso && included.has(t.id) } catch { return false }
              })
              setDayTxs(txsForDay)
              setDayModalOpen(true)
            }
          }
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">Loading...</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {/* Single-layer chart: rely on Recharts' built-in animation for smooth updates. */}
            <BarChart
              key={chartKey}
              data={displayData}
              margin={{ left: 0, right: 0, top: 12, bottom: window.innerWidth < 768 ? 10 : 18 }}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: window.innerWidth < 768 ? 9 : 11 }} 
                axisLine={false} 
                tickLine={false} 
                angle={window.innerWidth < 768 ? 0 : -45} 
                textAnchor={window.innerWidth < 768 ? "middle" : "end"} 
                height={window.innerWidth < 768 ? 22 : 28}
                interval={window.innerWidth < 768 ? 'preserveStartEnd' : 0}
              />
              <YAxis 
                tick={{ fontSize: window.innerWidth < 768 ? 9 : 11 }} 
                axisLine={false} 
                tickLine={false}
                width={window.innerWidth < 768 ? 40 : 60}
              />
              <Tooltip 
                trigger="hover"
                animationDuration={200}
                content={<CustomTooltip isMobile={isMobileViewport} currency={currency} mode={mode} onPointClick={(iso) => {
                  const included = getIncludedTxIds(txs || [], mode, currency === 'ALL' ? null : currency)
                  const txsForDay = (txs || []).filter(t => {
                    try { return new Date(t.created_at).toISOString().slice(0,10) === iso && included.has(t.id) } catch { return false }
                  })
                  setDayTxs(txsForDay)
                  setDayModalOpen(true)
                }} />} 
              />
              {currency === 'ALL' ? (
                // Для ALL показуємо кілька Bar компонентів - по одному на валюту (grouped, не stacked)
                (() => {
                  // Отримуємо список валют з displayData
                  const currencies = new Set()
                  displayData.forEach(d => {
                    Object.keys(d).forEach(key => {
                      if (key !== 'name' && key !== '_iso' && typeof d[key] === 'number') {
                        currencies.add(key)
                      }
                    })
                  })
                  // Фільтруємо USDT якщо налаштування вимкнено
                  const filteredCurrencies = Array.from(currencies).filter(cur => {
                    if (cur === 'USDT' && !showUsdtInChart) return false
                    return true
                  })
                  const sortedCurrencies = filteredCurrencies.sort()
                  
                  return sortedCurrencies.map((cur) => (
                    <Bar
                      key={cur}
                      dataKey={cur}
                      fill={getCurrencyColor(cur)}
                      isAnimationActive={true}
                      radius={[4, 4, 0, 0]}
                      cursor="pointer"
                      onClick={handleBarClick}
                      style={{ cursor: 'pointer' }}
                    />
                  ))
                })()
              ) : (
                <Bar
                  dataKey="value"
                  fill={mode === 'spending' ? '#dc2626' : '#16a34a'}
                  isAnimationActive={true}
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={handleBarClick}
                  style={{ cursor: 'pointer' }}
                />
              )}
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
              <div className="text-sm text-gray-500">Немає транзакцій за цей день</div>
            ) : (
              <>
                {dayTxs.map(tx => (
                  <Row
                    key={tx.id}
                    tx={tx}
                    currency={(tx.currency || null)}
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
// when animKey was bumped (mode or currency change). Otherwise replace immediately.
function useChartSync(txs, mode, from, to, currency, animKey, setDisplayData, prevAnimKeyRef, setChartKey) {
  useEffect(() => {
    const newData = computeChartData(txs, mode, from, to, currency)
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
  }, [txs, mode, from, to, currency, animKey, setDisplayData, prevAnimKeyRef, setChartKey])
}
