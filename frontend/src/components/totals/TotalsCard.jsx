import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, Wallet, CreditCard, PiggyBank } from 'lucide-react'
import { fetchTotalsByBucket } from '../../api/totals'
import { txBus } from '../../utils/txBus'
import BalanceCard from './BalanceCard'
import TotalsGrid from './TotalsGrid'
import { getUserPreferences, updatePreferencesSection } from '../../api/preferences'

const ORDER = ['UAH','EUR','USD','PLN','GBP','CHF','CZK','HUF']

export default function TotalsCard({ title = 'Total balance' }) {
  const [loading, setLoading] = useState(true)
  const [idx, setIdx] = useState(0)
  const [isVisible, setIsVisible] = useState(true)
  const [data, setData] = useState({ cash:{}, cards:{}, savings:{} })
  const rootRef = useRef(null)
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  
  // Touch swipe state
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  // load saved section from DB
  useEffect(() => {
    const loadSection = async () => {
      try {
        const prefs = await getUserPreferences()
        if (prefs && prefs.totals) {
          if (typeof prefs.totals.section === 'number') {
            setIdx(Math.max(0, Math.min(2, prefs.totals.section)))
          }
          if (typeof prefs.totals.isVisible === 'boolean') {
            setIsVisible(prefs.totals.isVisible)
          }
        }
        setPrefsLoaded(true)
      } catch (e) {
        console.error('Failed to load totals preferences:', e)
        setPrefsLoaded(true)
      }
    }
    loadSection()
  }, [])

  // persist section changes to DB (з debounce)
  useEffect(() => {
    if (!prefsLoaded) return
    
    const timeoutId = setTimeout(() => {
      updatePreferencesSection('totals', {
        section: idx,
        isVisible
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
      setIdx((i)=>Math.max(0, Math.min(2, i+dir)))
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
        setIdx((i) => Math.min(2, i + 1))
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

  const sections = useMemo(() => ([
    { key:'cash',    title:'Cash',     icon:<Wallet size={14} className="text-green-600"/>,  totals:data.cash },
    { key:'cards',   title:'Cards',      icon:<CreditCard size={14} className="text-blue-600"/>, totals:data.cards },
    { key:'savings', title:'Savings',  icon:<PiggyBank size={14} className="text-purple-600"/>, totals:data.savings },
  ]), [data])

  const current = sections[idx]

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
        <div className="flex gap-0.5">
          {sections.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setIdx(i)}
              className={`flex items-center gap-1 px-1.5 py-1 rounded-md transition-all text-xs flex-1 justify-center ${
                i===idx ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {s.icon}
              <span className="truncate">{s.title}</span>
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
