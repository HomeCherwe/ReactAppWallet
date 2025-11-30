import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, Wallet, CreditCard, PiggyBank, Globe } from 'lucide-react'
import { fetchTotalsByBucket } from '../../api/totals'
import { txBus } from '../../utils/txBus'
import BalanceCard from './BalanceCard'
import TotalsGrid from './TotalsGrid'
import { updatePreferencesSection } from '../../api/preferences'
import { usePreferences } from '../../context/PreferencesContext'
import useMonoRates from '../../hooks/useMonoRates'

const ORDER = ['UAH','EUR','USD','PLN','GBP','CHF','CZK','HUF']

export default function TotalsCard({ title = 'Total balance' }) {
  const { preferences, loading: prefsLoading } = usePreferences()
  const [loading, setLoading] = useState(true)
  const [idx, setIdx] = useState(0) // За замовчуванням All (індекс 0)
  const [isVisible, setIsVisible] = useState(true)
  const [data, setData] = useState({ cash:{}, cards:{}, savings:{} })
  const rootRef = useRef(null)
  const tabsRef = useRef(null)
  const tabButtonsRef = useRef([])
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const rates = useMonoRates()
  
  // Touch swipe state
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  const initializedRef = useRef(false)
  const lastSavedIdxRef = useRef(null)
  const lastSavedIsVisibleRef = useRef(null)

  // init from PreferencesContext (один запит на проєкт)
  useEffect(() => {
    if (prefsLoading) return
    let loadedIdx = 0
    const totals = preferences?.totals || {}
    if (typeof totals.section === 'number' && totals.section >= 0 && totals.section <= 3) {
      loadedIdx = totals.section
    }
    if (typeof totals.isVisible === 'boolean') {
      setIsVisible(totals.isVisible)
    }
    setIdx(loadedIdx)
    // Зберігаємо початкові значення для порівняння
    lastSavedIdxRef.current = loadedIdx
    lastSavedIsVisibleRef.current = totals.isVisible !== undefined ? totals.isVisible : true
    setPrefsLoaded(true)
    initializedRef.current = true
    // НЕ записуємо під час ініціалізації - тільки при зміні користувачем
  }, [prefsLoading, preferences])

  // persist section changes to DB (з debounce) - тільки якщо значення дійсно змінилося
  useEffect(() => {
    if (!prefsLoaded || !initializedRef.current) return
    
    // Перевіряємо, чи значення дійсно змінилося від збереженого
    if (idx === lastSavedIdxRef.current && isVisible === lastSavedIsVisibleRef.current) {
      return // Нічого не змінилося, не записуємо
    }
    
    // Оновлюємо збережені значення
    lastSavedIdxRef.current = idx
    lastSavedIsVisibleRef.current = isVisible
    
    // Зберігаємо тільки якщо це дійсно зміна користувача
    const timeoutId = setTimeout(() => {
      updatePreferencesSection('totals', {
        section: idx,
        isVisible
      }).catch(e => {
        console.error('Failed to save totals preferences:', e)
      })
    }, 500) // Debounce 500ms
    
    return () => clearTimeout(timeoutId)
  }, [idx, isVisible, prefsLoaded])

  // Перехоплюємо колесо лише всередині картки
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
      const onWheel = (e) => {
        e.preventDefault()
        e.stopPropagation()
        const dir = e.deltaY > 0 ? 1 : -1
        setIdx((i)=>Math.max(0, Math.min(3, i+dir)))
      }
    el.addEventListener('wheel', onWheel, { passive:false, capture:true })
    return () => el.removeEventListener('wheel', onWheel, { passive:false, capture:true })
  }, [])

  // Touch swipe handlers for mobile
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e) => {
    const touchEndX = e.changedTouches[0].clientX
    const touchEndY = e.changedTouches[0].clientY
    const deltaX = touchStartX.current - touchEndX
    const deltaY = touchStartY.current - touchEndY
    
    // Only swipe horizontally if horizontal movement is greater than vertical
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        // Swipe left - next section
        setIdx((i) => Math.min(3, i + 1))
      } else {
        // Swipe right - previous section
        setIdx((i) => Math.max(0, i - 1))
      }
    }
  }

  useEffect(() => {
    let mounted = true
    let unsub = null

    const doFetch = async () => {
      setLoading(true)
      try {
        const resp = await fetchTotalsByBucket() // { cash, cards, savings }
        if (!mounted) return
        setData(resp || { cash:{}, cards:{}, savings:{} })
      } catch (e) {
        console.error('load totals failed', e)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    doFetch()

    // subscribe to transaction events so totals update live
    if (txBus && typeof txBus.subscribe === 'function') {
      unsub = txBus.subscribe(async (evt) => {
        try {
          const resp = await fetchTotalsByBucket()
          if (!mounted) return
          setData(resp || { cash:{}, cards:{}, savings:{} })
        } catch (e) {
          console.error('refresh totals failed', e)
        }
      })
    }

    return () => { mounted = false; if (typeof unsub === 'function') unsub() }
  }, [])

  // Функція конвертації валют через UAH
  const convertCurrency = useMemo(() => {
    return (amount, fromCurrency, toCurrency) => {
      if (!fromCurrency || fromCurrency === toCurrency) return amount
      
      const codeMap = { UAH: 980, USD: 840, EUR: 978, GBP: 826, PLN: 985, CHF: 756, CZK: 203, HUF: 348, USDT: 840 }
      const fromCode = codeMap[fromCurrency] || 980
      const toCode = codeMap[toCurrency] || 980
      
      if (fromCode === toCode) return amount
      
      // Конвертуємо через UAH як проміжну валюту
      let inUAH = amount
      if (fromCode !== 980) {
        const rateToUAH = rates?.[`${fromCode}->980`]
        if (!rateToUAH) return amount // Якщо курс не знайдено, повертаємо оригінальну суму
        inUAH = amount * rateToUAH
      }
      
      // Потім конвертуємо з UAH в цільову валюту
      if (toCode === 980) return inUAH
      const rateFromUAH = rates?.[`${toCode}->980`]
      if (!rateFromUAH) return inUAH // Якщо курс не знайдено, повертаємо суму в UAH
      return inUAH / rateFromUAH
    }
  }, [rates])

  // Обчислюємо загальний баланс (All) в EUR, UAH, USD
  const allTotals = useMemo(() => {
    // Об'єднуємо всі баланси, спочатку сумуємо по валютах
    const allBalances = {}
    
    // Сумуємо баланси по валютах з усіх секцій
    Object.values([data.cash, data.cards, data.savings]).forEach(section => {
      Object.entries(section || {}).forEach(([currency, amount]) => {
        if (amount && Math.abs(amount) > 0.01) {
          // USDT рахуємо як USD
          const normalizedCurrency = currency === 'USDT' ? 'USD' : currency
          
          if (!allBalances[normalizedCurrency]) {
            allBalances[normalizedCurrency] = 0
          }
          allBalances[normalizedCurrency] += amount
        }
      })
    })
    
    // Конвертуємо все в UAH і сумуємо
    let totalInUAH = 0
    
    Object.entries(allBalances).forEach(([currency, amount]) => {
      const inUAH = convertCurrency(amount, currency, 'UAH')
      totalInUAH += inUAH
    })
    
    // Якщо загальна сума нульова, повертаємо порожній об'єкт
    if (Math.abs(totalInUAH) < 0.01) {
      return {}
    }
    
    // Конвертуємо загальну суму в UAH в EUR та USD
    const result = {
      UAH: totalInUAH,
      EUR: convertCurrency(totalInUAH, 'UAH', 'EUR'),
      USD: convertCurrency(totalInUAH, 'UAH', 'USD')
    }
    
    // Фільтруємо тільки ненульові значення
    const filtered = {}
    Object.entries(result).forEach(([currency, amount]) => {
      if (Math.abs(amount) > 0.01) { // Враховуємо помилки округлення
        filtered[currency] = amount
      }
    })
    
    return filtered
  }, [data, convertCurrency])

  const sections = useMemo(() => ([
    { key:'all',     title:'All',      icon:<Globe size={14} className="text-indigo-600"/>, totals:allTotals },
    { key:'cash',    title:'Cash',     icon:<Wallet size={14} className="text-green-600"/>,  totals:data.cash },
    { key:'cards',   title:'Cards',      icon:<CreditCard size={14} className="text-blue-600"/>, totals:data.cards },
    { key:'savings', title:'Savings',  icon:<PiggyBank size={14} className="text-purple-600"/>, totals:data.savings },
  ]), [data, allTotals])

  const current = sections[idx]

  // Автоматичний скрол вкладок до вибраної
  useEffect(() => {
    // Невелика затримка, щоб DOM встиг оновитися
    const timeoutId = setTimeout(() => {
      if (tabButtonsRef.current[idx] && tabsRef.current) {
        const button = tabButtonsRef.current[idx]
        const container = tabsRef.current
        
        // Використовуємо getBoundingClientRect для точного визначення позицій
        const buttonRect = button.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        
        // Визначаємо позицію кнопки відносно контейнера
        const buttonLeftRelative = buttonRect.left - containerRect.left
        const buttonRightRelative = buttonRect.right - containerRect.left
        const containerWidth = containerRect.width
        
        // Перевіряємо, чи кнопка видима
        const isVisible = buttonLeftRelative >= 0 && buttonRightRelative <= containerWidth
        
        if (!isVisible) {
          // Обчислюємо необхідний скрол
          const currentScroll = container.scrollLeft
          
          // Якщо кнопка ліворуч від видимої області
          if (buttonLeftRelative < 0) {
            // Скролимо так, щоб кнопка була видима зліва
            const newScroll = currentScroll + buttonLeftRelative - 8
            container.scrollTo({
              left: Math.max(0, newScroll),
              behavior: 'smooth'
            })
          } 
          // Якщо кнопка праворуч від видимої області
          else if (buttonRightRelative > containerWidth) {
            // Скролимо так, щоб кнопка була видима справа
            const scrollDelta = buttonRightRelative - containerWidth + 8
            const newScroll = currentScroll + scrollDelta
            const maxScroll = container.scrollWidth - containerWidth
            container.scrollTo({
              left: Math.min(maxScroll, newScroll),
              behavior: 'smooth'
            })
          }
        }
      }
    }, 100) // Затримка для оновлення DOM після зміни індексу
    
    return () => clearTimeout(timeoutId)
  }, [idx])

  return (
    <motion.div
      ref={rootRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl bg-white shadow-soft border border-gray-200 overflow-hidden"
    >
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-indigo-600" />
            <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          </div>
          <motion.button
            onClick={() => setIsVisible(v=>!v)}
            className="p-1 rounded-md hover:bg-gray-100 transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
          </motion.button>
        </div>
      </div>

      <div className="p-2 border-b border-gray-100">
        <div 
          ref={tabsRef}
          className="flex gap-0.5 overflow-x-auto scrollbar-hide"
        >
          {sections.map((s, i) => (
            <button
              key={s.key}
              ref={(el) => { tabButtonsRef.current[i] = el }}
              onClick={() => setIdx(i)}
              className={`flex items-center gap-1 px-1.5 py-1 rounded-md transition-all text-xs flex-shrink-0 justify-center whitespace-nowrap ${
                i===idx ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {s.icon}
              <span>{s.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div 
        className="p-3 select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="min-h-[120px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={current?.key || 'empty'}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col"
            >
              {loading ? (
                <div className="flex items-center justify-center py-4 flex-1">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-center">
                  <TotalsGrid totals={current?.totals || {}} sectionType={current?.key} isVisible={isVisible} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="px-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {sections.map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all ${i===idx ? 'w-4 bg-indigo-500' : 'w-1 bg-gray-300'}`} />
            ))}
          </div>
          <div className="text-xs text-gray-500">{idx+1}/{sections.length}</div>
        </div>
      </div>
    </motion.div>
  )
}
