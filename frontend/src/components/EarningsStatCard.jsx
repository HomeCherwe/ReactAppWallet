import { useEffect, useState, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { txBus } from '../utils/txBus'
import useMonoRates from '../hooks/useMonoRates'
import { listCards } from '../api/cards'
import { apiFetch } from '../utils.jsx'
import { useSettingsStore } from '../store/useSettingsStore'

export default function EarningsStatCard({ title, mode, currency: initialCurrency }) {
  // Використовуємо новий store
  const settings = useSettingsStore((state) => state.settings)
  const updateNestedSetting = useSettingsStore((state) => state.updateNestedSetting)
  const initialized = useSettingsStore((state) => state.initialized)
  // mode: 'earning' or 'spending'
  const [selectedCurrency, setSelectedCurrency] = useState(initialCurrency || 'ALL_UAH')
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [prevTotal, setPrevTotal] = useState(0)
  const currencies = ['UAH', 'EUR', 'USD', 'USDT']
  const rates = useMonoRates()
  const saveTimeoutRef = useRef(null)
  const lastSavedCurrencyRef = useRef(null) // Відстежуємо останнє збережене значення
  const delta = useMemo(() => {
    if (prevTotal === 0) return 0
    return Math.round(((total - prevTotal) / Math.abs(prevTotal)) * 100)
  }, [total, prevTotal])

  // Init preferences from settings store (single fetch per session)
  useEffect(() => {
    if (!initialized || !settings) return
    const modePrefs = settings?.earningsStat?.[mode]
    // Завантажуємо тільки якщо currency не null і не undefined (включаючи "ALL_UAH" та "ALL_EUR")
    if (modePrefs && modePrefs.currency !== undefined && modePrefs.currency !== null && modePrefs.currency !== '') {
      setSelectedCurrency(modePrefs.currency)
      lastSavedCurrencyRef.current = modePrefs.currency // Зберігаємо початкове значення
    } else {
      // Якщо значення немає в БД або null, встановлюємо "ALL_UAH" за замовчуванням
      const defaultCurrency = 'ALL_UAH'
      setSelectedCurrency(defaultCurrency)
      lastSavedCurrencyRef.current = defaultCurrency
    }
    setPrefsLoaded(true)
  }, [initialized, settings, mode]) // НЕ додаємо selectedCurrency в залежності, щоб уникнути циклу

  // Save preferences to DB when changed (через store з debounce) - тільки якщо значення дійсно змінилося
  useEffect(() => {
    if (!prefsLoaded) return
    
    // Перевіряємо, чи значення дійсно змінилося
    if (selectedCurrency === lastSavedCurrencyRef.current) {
      return // Нічого не змінилося, не записуємо
    }
    
    // Оновлюємо збережене значення
    lastSavedCurrencyRef.current = selectedCurrency

    // Оновлюємо через store (автоматично зберігається через debounce)
    // НЕ зберігаємо null - якщо selectedCurrency null або undefined, не зберігаємо поле
    const earningsStat = { ...(settings?.earningsStat || {}) }
    
    // Зберігаємо тільки якщо значення не null і не undefined (включаючи "ALL_UAH" та "ALL_EUR")
    if (selectedCurrency !== null && selectedCurrency !== undefined && selectedCurrency !== '') {
      earningsStat[mode] = { currency: selectedCurrency }
      updateNestedSetting('earningsStat', earningsStat)
    } else {
      // Якщо null/undefined/порожнє, НЕ зберігаємо взагалі (не викликаємо updateNestedSetting)
      // Це означає, що поле залишиться як є в БД, або буде видалено при наступному оновленні
    }
  }, [selectedCurrency, prefsLoaded, mode, updateNestedSetting, settings]) // Видалено settings з залежностей, щоб уникнути циклу

  // Захист від дублювання через AbortController
  const abortControllerRef = useRef(null)

  useEffect(() => {
    // Скасовуємо попередній запит, якщо він є
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Створюємо новий AbortController
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    let mounted = true

    // Helper to convert any currency to target currency using Monobank rates
    // USDT is treated as USD (code 840)
    const convertCurrency = (amount, fromCurrency, toCurrency) => {
      if (!fromCurrency || fromCurrency === toCurrency) return amount
      
      const codeMap = { UAH: 980, USD: 840, EUR: 978, GBP: 826, PLN: 985, USDT: 840 }
      const fromCode = codeMap[fromCurrency] || 980
      const toCode = codeMap[toCurrency] || 980
      
      if (fromCode === toCode) return amount
      
      // Convert via UAH as intermediate currency
      // First convert from source currency to UAH
      let inUAH = amount
      if (fromCode !== 980) {
        const rateToUAH = rates?.[`${fromCode}->980`]
        if (!rateToUAH) return amount
        inUAH = amount * rateToUAH
      }
      
      // Then convert from UAH to target currency
      if (toCode === 980) return inUAH
      const rateFromUAH = rates?.[`${toCode}->980`]
      if (!rateFromUAH) return inUAH
      return inUAH / rateFromUAH
    }

    const fetchData = async () => {
      // Перевіряємо, чи запит не було скасовано
      if (abortController.signal.aborted) {
        return
      }
      
      setLoading(true)
      
      try {
        // Calculate first day of current month and first day of previous month
        const now = new Date()
        const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const firstDayNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

        // Перевіряємо перед виконанням запиту
        if (abortController.signal.aborted) return

        // Fetch card info first to determine savings accounts and currencies (using cached API)
        const cards = await listCards()

        // Перевіряємо після отримання карток
        if (abortController.signal.aborted || !mounted) return

        const cardMap = new Map()
        cards.forEach(c => {
          const bank = String(c.bank || '').toLowerCase()
          const name = String(c.name || '').toLowerCase()
          const isSavings = bank.includes('збер') || bank.includes('savings')
          const isBinance = bank.includes('binance') || name.includes('binance')
          cardMap.set(c.id, { isSavings, isBinance, currency: (c.currency || 'UAH').toUpperCase() })
        })

        // Перевіряємо перед виконанням запиту транзакцій
        if (abortController.signal.aborted || !mounted) return

        // Fetch transactions from this month
        const fields = 'id,amount,created_at,is_transfer,transfer_role,transfer_id,archives,card,card_id'
        const allTxs = await apiFetch(
          `/api/transactions?start_date=${firstDayThisMonth.toISOString()}&end_date=${firstDayNextMonth.toISOString()}&fields=${fields}&order_by=created_at&order_asc=true`,
          { signal: abortController.signal }
        ) || []
        
        // Перевіряємо після отримання транзакцій
        if (abortController.signal.aborted || !mounted) return

        // Apply filters: no archived, no transfers, no savings
        const included = new Set()

        for (const tx of allTxs) {
          if (tx.archives) continue
          if (tx.is_transfer) continue
          
          // Check if transaction's card is savings
          const cardInfo = cardMap.get(tx.card_id) || { isSavings: false, isBinance: false, currency: 'UAH' }
          if (cardInfo.isSavings) continue

          // Skip Binance transactions when calculating ALL to UAH or ALL to EUR
          const effectiveCurrency = selectedCurrency || 'ALL_UAH'
          if ((effectiveCurrency === 'ALL_UAH' || effectiveCurrency === 'ALL_EUR') && cardInfo.isBinance) continue

          // Check currency match using card currency
          const txCur = cardInfo.currency
          
          // If selectedCurrency is a specific currency (not ALL), filter by it
          if (effectiveCurrency !== 'ALL_UAH' && effectiveCurrency !== 'ALL_EUR' && txCur !== effectiveCurrency) continue

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
          const cardInfo = cardMap.get(tx.card_id) || { isSavings: false, isBinance: false, currency: 'UAH' }
          const txCur = cardInfo.currency
          // Convert based on selected currency option
          const effectiveCurrency = selectedCurrency || 'ALL_UAH'
          if (effectiveCurrency === 'ALL_UAH') {
            // Convert all to UAH
            currentTotal += convertCurrency(amt, txCur, 'UAH')
          } else if (effectiveCurrency === 'ALL_EUR') {
            // Convert all to EUR
            currentTotal += convertCurrency(amt, txCur, 'EUR')
          } else {
            // Show only selected currency (no conversion needed, already filtered)
            currentTotal += amt
          }
        }

        // Перевіряємо перед виконанням запиту попереднього місяця
        if (abortController.signal.aborted || !mounted) return

        // Calculate previous month total
        const prevMonthFields = 'id,amount,created_at,is_transfer,archives,card_id'
        let prevMonthTotal = 0
        try {
          const prevTxs = await apiFetch(
            `/api/transactions?start_date=${firstDayPrevMonth.toISOString()}&end_date=${firstDayThisMonth.toISOString()}&fields=${prevMonthFields}&order_by=created_at&order_asc=true`,
            { signal: abortController.signal }
          ) || []
          
          // Перевіряємо після отримання транзакцій попереднього місяця
          if (abortController.signal.aborted || !mounted) return
          for (const tx of prevTxs) {
            if (tx.archives) continue
            if (tx.is_transfer) continue
            
            const cardInfo = cardMap.get(tx.card_id) || { isSavings: false, isBinance: false, currency: 'UAH' }
            if (cardInfo.isSavings) continue

            // Skip Binance transactions when calculating ALL to UAH or ALL to EUR
            const effectiveCurrency = selectedCurrency || 'ALL_UAH'
            if ((effectiveCurrency === 'ALL_UAH' || effectiveCurrency === 'ALL_EUR') && cardInfo.isBinance) continue

            const txCur = tx.currency ? String(tx.currency).toUpperCase() : cardInfo.currency
            
            // If selectedCurrency is a specific currency (not ALL), filter by it
            if (effectiveCurrency !== 'ALL_UAH' && effectiveCurrency !== 'ALL_EUR' && txCur !== effectiveCurrency) continue

            const amt = Number(tx.amount || 0)
            let addAmt = 0
            if (mode === 'spending' && amt < 0) {
              addAmt = Math.abs(amt)
            } else if (mode === 'earning' && amt > 0) {
              addAmt = amt
            }
            // Convert based on selected currency option
            if (effectiveCurrency === 'ALL_UAH') {
              // Convert all to UAH
              prevMonthTotal += convertCurrency(addAmt, txCur, 'UAH')
            } else if (effectiveCurrency === 'ALL_EUR') {
              // Convert all to EUR
              prevMonthTotal += convertCurrency(addAmt, txCur, 'EUR')
            } else {
              // Show only selected currency (no conversion needed, already filtered)
              prevMonthTotal += addAmt
            }
          }
        } catch (e) {
          console.error('Failed to fetch previous month transactions:', e)
        }

        if (!mounted || abortController.signal.aborted) return
        setPrevTotal(prevMonthTotal)
        setTotal(currentTotal)
      } catch (e) {
        // Ігноруємо помилки скасування
        if (e.name === 'AbortError' || abortController.signal.aborted) return
        console.error('fetch earnings stat failed', e)
        if (!mounted || abortController.signal.aborted) return
        setTotal(0)
        setPrevTotal(0)
      } finally {
        if (!abortController.signal.aborted && mounted) {
          setLoading(false)
        }
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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      if (typeof unsub === 'function') unsub()
    }
  }, [mode, selectedCurrency, rates ? Object.keys(rates).join(',') : ''])

  const badge = delta >= 0 ? 'text-emerald-600' : 'text-rose-600'
  const displayValue = loading ? '-' : Math.round(total).toLocaleString()
  const prevDisplayValue = loading ? '-' : Math.round(prevTotal).toLocaleString()
  
  // Get month names in Ukrainian
  const getMonthName = (date) => {
    const months = [
      'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
      'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
    ]
    return months[date.getMonth()]
  }
  
  const now = new Date()
  const currentMonth = getMonthName(now)
  const currentYear = now.getFullYear()
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonth = getMonthName(prevMonthDate)
  const prevYear = prevMonthDate.getFullYear()
  
  // Determine display currency symbol
  const getCurrencySymbol = () => {
    if (!selectedCurrency || selectedCurrency === 'ALL_UAH') return 'ALL to UAH'
    if (selectedCurrency === 'ALL_EUR') return 'ALL to EUR'
    return selectedCurrency
  }
  const currencySymbol = getCurrencySymbol()
  
  // Determine color and sign based on mode
  const amountColor = mode === 'earning' ? 'text-emerald-600' : 'text-rose-600'
  const amountSign = mode === 'earning' ? '+' : '-'
  
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
          value={selectedCurrency || 'ALL_UAH'}
          onChange={(e) => {
            const val = e.target.value
            // Зберігаємо значення як є (включаючи "ALL_UAH" та "ALL_EUR")
            setSelectedCurrency(val || 'ALL_UAH')
          }}
        >
          <option value="ALL_UAH">ALL to UAH</option>
          <option value="ALL_EUR">ALL to EUR</option>
          {currencies.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      
      {/* Current month label */}
      <div className="text-xs text-gray-400 mb-1">
        {currentMonth} {currentYear}
      </div>
      
      {/* Current month amount */}
      <div>
        <div className={`text-[28px] sm:text-3xl font-bold ${amountColor}`}>
          {loading ? '-' : `${amountSign}${displayValue}`}
        </div>
        <div className="text-lg text-gray-500">{currencySymbol}</div>
      </div>
      
      {/* Delta percentage */}
      {!loading && (
        <div className={`mt-1 text-xs ${badge}`}>
          {delta > 0 ? '+' : ''}{delta}% vs last month
        </div>
      )}
      
      {/* Previous month result */}
      {!loading && prevTotal !== 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-400 mb-1">
            {prevMonth} {prevYear}
          </div>
          <div>
            <div className={`text-lg font-semibold ${amountColor}`}>
              {amountSign}{prevDisplayValue}
            </div>
            <div className="text-lg text-gray-500">{currencySymbol}</div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

