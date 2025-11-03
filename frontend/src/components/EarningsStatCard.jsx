import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { txBus } from '../utils/txBus'
import useMonoRates from '../hooks/useMonoRates'

export default function EarningsStatCard({ title, mode, currency: initialCurrency }) {
  // mode: 'earning' or 'spending'
  const [selectedCurrency, setSelectedCurrency] = useState(initialCurrency || null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [prevTotal, setPrevTotal] = useState(0)
  const currencies = ['UAH', 'EUR', 'USD', 'USDT']
  const rates = useMonoRates()
  const delta = useMemo(() => {
    if (prevTotal === 0) return 0
    return Math.round(((total - prevTotal) / Math.abs(prevTotal)) * 100)
  }, [total, prevTotal])

  useEffect(() => {
    let mounted = true

    // Helper to convert any currency to UAH using Monobank rates
    const toUAH = (amount, currency) => {
      if (!currency || currency === 'UAH') return amount
      const codeMap = { UAH: 980, USD: 840, EUR: 978, GBP: 826, PLN: 985, USDT: 840 }
      const code = codeMap[currency]
      if (!code) return amount
      const rate = rates[`${code}->980`]
      if (!rate) return amount
      return amount * rate
    }

    const fetchData = async () => {
      setLoading(true)
      try {
        // Calculate first day of current month and first day of previous month
        const now = new Date()
        const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const firstDayNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setValue(0)
          setPrevValue(0)
          return
        }

        // Fetch card info first to determine savings accounts and currencies
        const cardsResponse = await supabase
          .from('cards')
          .select('id, bank, name, currency')
          .eq('user_id', user.id)

        if (cardsResponse.error) throw cardsResponse.error
        const cards = cardsResponse.data || []

        const cardMap = new Map()
        cards.forEach(c => {
          const isSavings = String(c.bank || '').toLowerCase().includes('збер') || 
                           String(c.bank || '').toLowerCase().includes('savings')
          cardMap.set(c.id, { isSavings, currency: (c.currency || 'UAH').toUpperCase() })
        })

        // Fetch transactions from this month (without currency field)
        const txsResponse = await supabase
          .from('transactions')
          .select(`
            id, 
            amount, 
            created_at, 
            is_transfer, 
            transfer_role,
            transfer_id,
            archives,
            card,
            card_id
          `)
          .eq('user_id', user.id)
          .gte('created_at', firstDayThisMonth.toISOString())
          .lt('created_at', firstDayNextMonth.toISOString())

        if (txsResponse.error) throw txsResponse.error

        // Apply filters: no archived, no transfers, no savings
        const included = new Set()
        const allTxs = txsResponse.data || []

        for (const tx of allTxs) {
          if (tx.archives) continue
          if (tx.is_transfer) continue
          
          // Check if transaction's card is savings
          const cardInfo = cardMap.get(tx.card_id) || { isSavings: false, currency: 'UAH' }
          if (cardInfo.isSavings) continue

          // Check currency match using card currency
          const txCur = cardInfo.currency
          if (selectedCurrency && txCur !== selectedCurrency) continue

          const amt = Number(tx.amount || 0)
          if (mode === 'spending') {
            if (amt >= 0) continue
            included.add(tx.id)
          } else if (mode === 'earning') {
            if (amt <= 0) continue
            included.add(tx.id)
          }
        }

        // Calculate total for this month
        let currentTotal = 0
        for (const tx of allTxs) {
          if (!included.has(tx.id)) continue
          const amt = Math.abs(Number(tx.amount || 0))
          const cardInfo = cardMap.get(tx.card_id) || { isSavings: false, currency: 'UAH' }
          const txCur = cardInfo.currency
          // If no currency filter, convert all to UAH for combined total
          if (!selectedCurrency) {
            currentTotal += toUAH(amt, txCur)
          } else {
            currentTotal += amt
          }
        }

        // Calculate previous month total
        const prevMonthResponse = await supabase
          .from('transactions')
          .select(`
            id, 
            amount, 
            created_at, 
            is_transfer, 
            archives,
            card_id
          `)
          .gte('created_at', firstDayPrevMonth.toISOString())
          .lt('created_at', firstDayThisMonth.toISOString())

        let prevMonthTotal = 0
        if (!prevMonthResponse.error) {
          const prevTxs = prevMonthResponse.data || []
          for (const tx of prevTxs) {
            if (tx.archives) continue
            if (tx.is_transfer) continue
            
            const cardInfo = cardMap.get(tx.card_id) || { isSavings: false, currency: 'UAH' }
            if (cardInfo.isSavings) continue

            const txCur = tx.currency ? String(tx.currency).toUpperCase() : cardInfo.currency
            if (selectedCurrency && txCur !== selectedCurrency) continue

            const amt = Number(tx.amount || 0)
            let addAmt = 0
            if (mode === 'spending' && amt < 0) {
              addAmt = Math.abs(amt)
            } else if (mode === 'earning' && amt > 0) {
              addAmt = amt
            }
            // If no currency filter, convert all to UAH for combined total
            if (!selectedCurrency) {
              prevMonthTotal += toUAH(addAmt, txCur)
            } else {
              prevMonthTotal += addAmt
            }
          }
        }

        if (!mounted) return
        setPrevTotal(prevMonthTotal)
        setTotal(currentTotal)
      } catch (e) {
        console.error('fetch earnings stat failed', e)
        if (!mounted) return
        setTotal(0)
        setPrevTotal(0)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchData()

    // Subscribe to txBus for real-time updates
    let unsub = null
    if (txBus && typeof txBus.subscribe === 'function') {
      unsub = txBus.subscribe(() => {
        fetchData()
      })
    }

    return () => {
      mounted = false
      if (typeof unsub === 'function') unsub()
    }
  }, [mode, selectedCurrency, rates])

  const badge = delta >= 0 ? 'text-emerald-600' : 'text-rose-600'
  const displayValue = loading ? '-' : total.toLocaleString()
  const currencySymbol = selectedCurrency || 'ALL'
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl bg-white shadow-soft p-4 sm:p-5"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-gray-500">{title}</div>
        <select 
          className="text-xs border border-gray-200 rounded px-2 py-0.5 bg-white"
          value={selectedCurrency || ''}
          onChange={(e) => setSelectedCurrency(e.target.value || null)}
        >
          <option value="">ALL</option>
          {currencies.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="text-[28px] sm:text-3xl font-bold">
        {displayValue} <span className="text-lg text-gray-500">{currencySymbol}</span>
      </div>
      {!loading && (
        <div className={`mt-1 text-xs ${badge}`}>
          {delta > 0 ? '+' : ''}{delta}% vs last month
        </div>
      )}
    </motion.div>
  )
}

