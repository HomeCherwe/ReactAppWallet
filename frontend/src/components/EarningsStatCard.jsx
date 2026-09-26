import { useEffect, useState, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { txBus } from '../utils/txBus'
import useMonoRates from '../hooks/useMonoRates'
import { listCards } from '../api/cards'
import { apiFetch } from '../utils.jsx'
import { usePrimaryCurrency, convertAmount, currencySymbol } from '../utils/primaryCurrency'

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
]

const isExcludedFromStats = (tx) => {
  if (!tx) return false
  if (tx.exclude_from_stats === true || tx.exclude_from_stats === 'true' || tx.exclude_from_stats === 1) return true
  // Card switched off in its settings (flag computed by the backend)
  if (tx.card_excluded_from_stats) return true
  // Linked refunds are counted through their expense (amount_stat), not directly
  if (tx.refund_for) return true
  return String(tx.note || '').includes('[refund_for:')
}

const amountForStats = (tx) => {
  const v = tx?.amount_stat
  if (v === null || v === undefined || v === '') return Number(tx?.amount || 0)
  return Number(v || 0)
}

/**
 * This month's income or spending (and last month's for comparison), everything converted to
 * the main currency from the settings — like the iPhone Home screen.
 */
export default function EarningsStatCard({ title, mode }) {
  const primary = usePrimaryCurrency()
  const rates = useMonoRates()
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [prevTotal, setPrevTotal] = useState(0)
  const abortControllerRef = useRef(null)

  const delta = useMemo(() => {
    if (prevTotal === 0) return 0
    return Math.round(((total - prevTotal) / Math.abs(prevTotal)) * 100)
  }, [total, prevTotal])

  useEffect(() => {
    let mounted = true

    const fetchData = async () => {
      if (abortControllerRef.current) abortControllerRef.current.abort()
      const abortController = new AbortController()
      abortControllerRef.current = abortController
      const aborted = () => abortController.signal.aborted || !mounted

      setLoading(true)
      try {
        const now = new Date()
        const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const firstDayNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

        const cards = await listCards()
        if (aborted()) return
        const cardMap = new Map()
        cards.forEach(c => {
          const bank = String(c.bank || '').toLowerCase()
          const name = String(c.name || '').toLowerCase()
          cardMap.set(c.id, {
            isSavings: bank.includes('збер') || bank.includes('savings'),
            isBinance: bank.includes('binance') || name.includes('binance'),
            currency: (c.currency || 'UAH').toUpperCase(),
          })
        })

        // Sum of this mode's amounts in the main currency (savings and Binance left out)
        const sumInPrimary = (txs) => {
          let sum = 0
          for (const tx of txs || []) {
            if (tx.archives || isExcludedFromStats(tx)) continue
            const card = cardMap.get(tx.card_id) || { currency: 'UAH' }
            if (card.isSavings || card.isBinance) continue
            const amt = amountForStats(tx)
            if (mode === 'spending' ? amt >= 0 : amt <= 0) continue
            const cur = tx.currency ? String(tx.currency).toUpperCase() : card.currency
            const converted = convertAmount(Math.abs(amt), cur, primary, rates)
            sum += converted ?? Math.abs(amt)
          }
          return sum
        }

        const fields = 'id,amount,amount_stat,exclude_from_stats,created_at,is_transfer,archives,card_id,category,note,refund_for'
        const range = (from, to) =>
          `/api/transactions?start_date=${from.toISOString()}&end_date=${to.toISOString()}&fields=${fields}&order_by=created_at&order_asc=true`

        const [thisMonth, prevMonth] = await Promise.all([
          apiFetch(range(firstDayThisMonth, firstDayNextMonth), { signal: abortController.signal }),
          apiFetch(range(firstDayPrevMonth, firstDayThisMonth), { signal: abortController.signal }).catch(() => []),
        ])
        if (aborted()) return
        setTotal(sumInPrimary(thisMonth))
        setPrevTotal(sumInPrimary(prevMonth))
      } catch (e) {
        if (e.name === 'AbortError' || aborted()) return
        console.error('fetch earnings stat failed', e)
        setTotal(0)
        setPrevTotal(0)
      } finally {
        if (!aborted()) setLoading(false)
      }
    }

    fetchData()
    const unsub = txBus?.subscribe?.(() => fetchData())

    return () => {
      mounted = false
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      if (typeof unsub === 'function') unsub()
    }
  }, [mode, primary, rates ? Object.keys(rates).join(',') : ''])

  const now = new Date()
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const symbol = currencySymbol(primary)
  const fmt = (v) => `${Math.round(v).toLocaleString('uk-UA')} ${symbol}`

  const earning = mode === 'earning'
  const amountColor = earning ? 'text-green-400' : 'text-rose-400'
  const amountSign = earning ? '+' : '-'
  // More income is good, more spending is not
  const deltaGood = earning ? delta >= 0 : delta <= 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-b from-white/[0.075] to-white/[0.025] backdrop-blur-xl shadow-glass p-4 sm:p-5 border ${
        earning ? 'border-green-500/20' : 'border-rose-500/20'
      }`}
    >
      {/* Soft accent glow in the corner */}
      <div
        className={`pointer-events-none absolute -z-10 -top-16 -right-16 h-40 w-40 rounded-full blur-3xl ${
          earning ? 'bg-green-500/20' : 'bg-rose-500/20'
        }`}
      />
      <div className="text-sm font-semibold text-white/60 mb-2">{title}</div>

      <div className="text-xs text-white/40 mb-0.5">
        {MONTHS[now.getMonth()]} {now.getFullYear()}
      </div>
      <div className={`text-[26px] sm:text-3xl font-bold tracking-tight tabular-nums ${amountColor}`}>
        {loading ? '—' : `${amountSign}${fmt(total)}`}
      </div>

      {!loading && prevTotal !== 0 && (
        <div className={`mt-1 text-xs font-semibold ${deltaGood ? 'text-green-400' : 'text-rose-400'}`}>
          {delta > 0 ? '+' : ''}{delta}% до минулого місяця
        </div>
      )}

      {!loading && prevTotal !== 0 && (
        <div className="mt-3 pt-3 border-t border-white/[0.06]">
          <div className="text-xs text-white/40 mb-0.5">
            {MONTHS[prevMonthDate.getMonth()]} {prevMonthDate.getFullYear()}
          </div>
          <div className={`text-lg font-semibold tabular-nums ${amountColor} opacity-80`}>
            {amountSign}{fmt(prevTotal)}
          </div>
        </div>
      )}
    </motion.div>
  )
}
