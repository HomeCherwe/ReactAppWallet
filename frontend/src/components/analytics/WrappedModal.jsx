import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { listCards } from '../../api/cards'
import useMonoRates from '../../hooks/useMonoRates'
import { usePrimaryCurrency } from '../../utils/primaryCurrency'
import { useExcludedCategories } from '../../utils/statsCategories'
import { countedTransactions, listPeriodTransactions } from '../../utils/statsCount'
import { computeWrapped, MONTHS_NOM, WEEKDAYS_ACC, wrappedText } from '../../utils/wrapped'
import { formatMoney } from '../../utils/cardTheme'

// Each story stays this long unless clicked through
const SLIDE_MS = 6500

/** The year a Wrapped opens on: the last one in January–February, otherwise this one so far */
export function defaultWrappedYear(now = new Date()) {
  return now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear()
}

// Same stories as the iPhone app (mobile/components/WrappedModal.tsx)
function buildSlides(w) {
  const money = v => formatMoney(v, w.currency, { hideCents: true })
  const slides = [
    { key: 'intro', colors: ['#FF6B00', '#7A1FA2'], emoji: '🎁', kicker: 'MyWallet Wrapped', big: `Твій ${w.year}`, sub: `${w.expenses} покупок за ${w.days} днів. Погнали дивитись, куди пішли гроші →` },
    {
      key: 'total',
      colors: ['#0F2027', '#2C5364'],
      emoji: '💸',
      kicker: 'За рік витрачено',
      big: money(w.spent),
      sub: `і зароблено ${money(w.earned)} — ${w.earned >= w.spent ? `у плюсі на ${money(w.earned - w.spent)}` : `мінус ${money(w.spent - w.earned)}`}`,
    },
  ]
  if (w.topMerchant) slides.push({ key: 'merchant', colors: ['#11998E', '#0B3D2E'], emoji: '🏆', kicker: 'Улюблене місце', big: w.topMerchant.name, sub: `${w.topMerchant.count} разів · ${money(w.topMerchant.total)}` })
  if (w.priciestDay) {
    slides.push({
      key: 'day',
      colors: ['#C31432', '#240B36'],
      emoji: '📅',
      kicker: 'Найдорожчий день',
      big: w.priciestDay.date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' }),
      sub: `${money(w.priciestDay.total)} за ${w.priciestDay.count} ${w.priciestDay.count === 1 ? 'покупку' : 'покупок'} · найбільше — ${w.priciestDay.top}`,
    })
  }
  if (w.topCategory) slides.push({ key: 'category', colors: ['#F7971E', '#7B2E00'], emoji: '🥇', kicker: 'Найбільше пішло на', big: w.topCategory.name, sub: `${Math.round(w.topCategory.share * 100)}% усіх витрат · ${money(w.topCategory.total)}` })
  if (w.coffee) {
    const coffee = w.coffee.kind === 'coffee'
    slides.push({
      key: 'coffee',
      colors: ['#6F4E37', '#1E120B'],
      emoji: coffee ? '☕' : '🍽️',
      kicker: coffee ? 'Кави за рік' : 'Поїсти не вдома',
      big: coffee ? `${w.coffee.count}` : `${w.coffee.count} разів`,
      sub: `${money(w.coffee.total)}${coffee ? ` — в середньому ${money(w.coffee.total / w.coffee.count)} за чашку` : ''}`,
    })
  }
  if (w.comparisons.length > 0) slides.push({ key: 'compare', colors: ['#4776E6', '#2A0845'], emoji: '🤯', kicker: 'Якщо порівняти', big: 'Це як…', list: w.comparisons })
  if (w.biggest) {
    slides.push({
      key: 'biggest',
      colors: ['#DA4453', '#3A1C71'],
      emoji: '💎',
      kicker: 'Найбільша покупка',
      big: money(w.biggest.amount),
      sub: `${w.biggest.title} · ${w.biggest.date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}`,
    })
  }
  if (w.busiestMonth) {
    slides.push({
      key: 'month',
      colors: ['#1D976C', '#0F2027'],
      emoji: '🗓️',
      kicker: 'Найщедріший місяць',
      big: MONTHS_NOM[w.busiestMonth.month],
      sub: `${money(w.busiestMonth.total)}${w.weekday ? ` · а найбільше грошей іде в ${WEEKDAYS_ACC[w.weekday.day]}` : ''}`,
    })
  }
  slides.push({ key: 'outro', colors: ['#FF6B00', '#3A0CA3'], emoji: '✨', kicker: `${w.year} — все`, big: 'Дякую, що рахуєш гроші разом з MyWallet', sub: 'Скопіюйте підсумок і надішліть друзям' })
  return slides
}

/** «MyWallet Wrapped»: the year's story — click right for the next, left for the previous, ← → keys too */
export default function WrappedModal({ open, onClose }) {
  const [year, setYear] = useState(defaultWrappedYear)
  const [data, setData] = useState(null)
  const [index, setIndex] = useState(0)
  const rates = useMonoRates()
  const currency = usePrimaryCurrency()
  const excludedCategories = useExcludedCategories()

  useEffect(() => {
    if (!open) return
    let alive = true
    setData(null)
    setIndex(0)
    Promise.all([listPeriodTransactions(new Date(year, 0, 1), new Date(year + 1, 0, 1)), listCards().catch(() => [])])
      .then(([txs, cards]) => alive && setData({ txs, cards }))
      .catch(() => alive && setData({ txs: [], cards: [] }))
    return () => {
      alive = false
    }
  }, [open, year])

  const wrapped = useMemo(() => {
    if (!data) return null
    const counted = countedTransactions(data.txs, { cards: data.cards, rates, currency, excludedCategories })
    return computeWrapped(counted, year, currency, rates)
  }, [data, rates, currency, excludedCategories, year])
  const slides = useMemo(() => (wrapped && wrapped.expenses > 0 ? buildSlides(wrapped) : []), [wrapped])
  const slide = slides[index]
  const last = index === slides.length - 1

  // Next story after a while; arrows and Esc
  useEffect(() => {
    if (!open || !slide || last) return
    const t = setTimeout(() => setIndex(i => Math.min(i + 1, slides.length - 1)), SLIDE_MS)
    return () => clearTimeout(t)
  }, [open, index, slides.length])
  useEffect(() => {
    if (!open) return
    const onKey = e => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIndex(i => Math.min(i + 1, slides.length - 1))
      if (e.key === 'ArrowLeft') setIndex(i => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, slides.length])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(wrappedText(wrapped))
      toast.success('Підсумок скопійовано')
    } catch {
      toast.error('Не вдалося скопіювати')
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="wrapped"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm grid place-items-center p-0 sm:p-6"
          onClick={onClose}
        >
          <div
            className="relative w-full h-full sm:w-[420px] sm:h-[min(760px,92vh)] sm:rounded-[28px] overflow-hidden shadow-2xl select-none"
            style={{ background: `linear-gradient(135deg, ${(slide?.colors ?? ['#1A1A1A', '#0A0A0A']).join(', ')})`, transition: 'background 0.5s' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Story bars */}
            <div className="absolute top-3 left-3 right-3 flex gap-1 z-20">
              {slides.map((s, i) => (
                <div key={s.key} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
                  <div
                    key={i === index ? `run-${index}` : s.key}
                    className="h-full bg-white"
                    style={
                      i < index || (i === index && last)
                        ? { width: '100%' }
                        : i > index
                          ? { width: '0%' }
                          : { width: '100%', animation: `wrapped-bar ${SLIDE_MS}ms linear forwards` }
                    }
                  />
                </div>
              ))}
            </div>
            <button onClick={onClose} className="absolute top-7 right-4 z-30 h-9 w-9 grid place-items-center rounded-full bg-black/20 hover:bg-black/35 text-white" title="Закрити">
              <X size={20} />
            </button>

            {!data ? (
              <div className="h-full grid place-items-center text-white/85">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-white" />
                  Рахую твій {year}…
                </div>
              </div>
            ) : !slide ? (
              <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center text-white">
                <div className="text-6xl">🫥</div>
                <div className="text-3xl font-black">За {year} витрат немає</div>
                <button onClick={() => setYear(y => y - 1)} className="px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 font-semibold">
                  Подивитись {year - 1}
                </button>
              </div>
            ) : (
              <>
                {/* Click left / right */}
                <div className="absolute inset-0 flex z-10">
                  <div className="flex-1 cursor-w-resize" onClick={() => setIndex(i => Math.max(i - 1, 0))} />
                  <div className="flex-[2] cursor-e-resize" onClick={() => setIndex(i => Math.min(i + 1, slides.length - 1))} />
                </div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={slide.key}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="relative h-full flex flex-col justify-center px-8 pb-24 text-white pointer-events-none"
                  >
                    <div className="text-6xl mb-5">{slide.emoji}</div>
                    <div className="text-sm font-extrabold uppercase tracking-[0.16em] text-white/75">{slide.kicker}</div>
                    <div className="text-[44px] leading-[1.1] font-black tracking-tight mt-2 break-words">{slide.big}</div>
                    {slide.sub && <div className="text-lg text-white/90 mt-4 leading-snug">{slide.sub}</div>}
                    {slide.list?.map(item => (
                      <div key={item.text} className="flex items-center gap-3 mt-4">
                        <span className="text-3xl">{item.emoji}</span>
                        <span className="text-lg font-semibold leading-snug">{item.text}</span>
                      </div>
                    ))}
                  </motion.div>
                </AnimatePresence>
                {slide.key === 'intro' && (
                  <div className="absolute left-8 bottom-10 z-20 flex gap-2">
                    {[defaultWrappedYear(), defaultWrappedYear() - 1].map(y => (
                      <button
                        key={y}
                        onClick={() => y !== year && setYear(y)}
                        className={`px-4 py-2 rounded-full text-[15px] font-extrabold transition ${y === year ? 'bg-white text-[#3A0CA3]' : 'bg-white/15 text-white hover:bg-white/25'}`}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                )}
                {slide.key === 'outro' && (
                  <button onClick={copy} className="absolute left-8 bottom-10 z-20 px-5 py-2.5 rounded-full bg-white text-brand font-extrabold hover:brightness-95">
                    Скопіювати підсумок
                  </button>
                )}
              </>
            )}
          </div>
          <style>{'@keyframes wrapped-bar { from { width: 0% } to { width: 100% } }'}</style>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
