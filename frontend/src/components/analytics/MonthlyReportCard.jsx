import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { listCards } from '../../api/cards'
import { getMonthlyReport, readMonthlyReport } from '../../api/insights'
import useMonoRates from '../../hooks/useMonoRates'
import { usePrimaryCurrency } from '../../utils/primaryCurrency'
import { useExcludedCategories } from '../../utils/statsCategories'
import { countedTransactions, listPeriodTransactions } from '../../utils/statsCount'

const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень']
const firstOfMonth = (d, shift = 0) => new Date(d.getFullYear(), d.getMonth() + shift, 1)
const titleOf = tx =>
  String(tx.note || '').replace(/\[pinned\]/g, '').split('|')[0].split('\n')[0].trim() || tx.merchant_name || tx.category || 'Покупка'

/**
 * «Звіт місяця» (same as the iPhone app): GPT reads the month's numbers and writes a few sentences —
 * what changed, where it went over, one tip. Written on request and kept per month.
 */
export default function MonthlyReportCard() {
  const [month, setMonth] = useState(() => firstOfMonth(new Date()))
  const [txs, setTxs] = useState(null)
  const [cards, setCards] = useState([])
  const [report, setReport] = useState(null)
  const [checked, setChecked] = useState(false)
  const [writing, setWriting] = useState(false)
  const rates = useMonoRates()
  const currency = usePrimaryCurrency()
  const excludedCategories = useExcludedCategories()
  const shown = useRef('')

  const monthId = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  shown.current = monthId
  const isCurrentMonth = monthId === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  useEffect(() => {
    listCards().then(setCards).catch(() => {})
  }, [])

  useEffect(() => {
    const id = monthId
    setTxs(null)
    setReport(null)
    setChecked(false)
    listPeriodTransactions(firstOfMonth(month, -1), firstOfMonth(month, 1))
      .then(list => shown.current === id && setTxs(list))
      .catch(() => shown.current === id && setTxs([]))
    readMonthlyReport(id)
      .then(r => shown.current === id && setReport(r))
      .catch(() => {})
      .finally(() => shown.current === id && setChecked(true))
  }, [monthId])

  // The same numbers the Analytics screens show
  const stats = useMemo(() => {
    if (!txs) return null
    const counted = countedTransactions(txs, { cards, rates, currency, excludedCategories })
    const key = d => `${d.getFullYear()}-${d.getMonth()}`
    const cur = key(month)
    const prev = key(firstOfMonth(month, -1))
    const inMonth = counted.filter(c => key(new Date(c.tx.created_at)) === cur)
    const before = counted.filter(c => key(new Date(c.tx.created_at)) === prev)
    const sum = (list, income) => Math.round(list.filter(c => c.income === income).reduce((s, c) => s + c.value, 0))
    const byCat = list => {
      const m = new Map()
      for (const c of list) if (!c.income) m.set(c.tx.category || 'Інше', (m.get(c.tx.category || 'Інше') || 0) + c.value)
      return m
    }
    const catNow = byCat(inMonth)
    const catPrev = byCat(before)
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return {
      income: sum(inMonth, true),
      expense: sum(inMonth, false),
      previous: { income: sum(before, true), expense: sum(before, false) },
      topCategories: [...catNow.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, amount]) => ({ name, amount: Math.round(amount), previous: Math.round(catPrev.get(name) || 0) })),
      biggest: inMonth
        .filter(c => !c.income)
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)
        .map(c => ({ title: titleOf(c.tx).slice(0, 60), amount: Math.round(c.value), date: c.tx.created_at.slice(0, 10) })),
      transactions: inMonth.length,
      ...(isCurrentMonth && { partial: `${new Date().getDate()} з ${daysInMonth} днів` }),
    }
  }, [txs, cards, rates, currency, excludedCategories, month, isCurrentMonth])

  const write = async force => {
    if (writing || !stats?.transactions) return
    setWriting(true)
    const id = monthId
    try {
      const r = await getMonthlyReport(id, currency, stats, force)
      if (shown.current === id) setReport(r)
    } catch (e) {
      toast.error(`Звіт не вийшов: ${e.message}`)
    } finally {
      setWriting(false)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-3xl p-5 border border-brand/30 bg-gradient-to-br from-brand/[0.14] via-white/[0.03] to-[#AF52DE]/[0.10] shadow-glass">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Sparkles size={18} className="text-brand-light" />
          Звіт місяця
        </h2>
        <div className="flex items-center gap-1 rounded-full bg-white/[0.06] p-1">
          <button onClick={() => setMonth(m => firstOfMonth(m, -1))} className="h-7 w-7 grid place-items-center rounded-full hover:bg-white/10" title="Попередній місяць">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold px-1 min-w-[120px] text-center">
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </span>
          <button
            onClick={() => !isCurrentMonth && setMonth(m => firstOfMonth(m, 1))}
            disabled={isCurrentMonth}
            className="h-7 w-7 grid place-items-center rounded-full hover:bg-white/10 disabled:opacity-30"
            title="Наступний місяць"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {writing ? (
        <div className="flex items-center gap-3 py-2 text-white/65 text-sm">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand" />
          Пишу звіт за {MONTHS[month.getMonth()].toLowerCase()}…
        </div>
      ) : report ? (
        <>
          <p className="text-[15px] leading-relaxed text-white">{report.report}</p>
          <div className="flex items-center gap-3 mt-3 text-xs text-white/45">
            <span>GPT · {new Date(report.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}</span>
            <button onClick={() => write(true)} className="font-semibold text-brand-light hover:underline">
              Оновити
            </button>
          </div>
        </>
      ) : !checked || !stats ? (
        <div className="py-3 text-sm text-white/50">Завантаження…</div>
      ) : (
        <>
          <p className="text-sm text-white/65">
            {stats.transactions === 0
              ? 'За цей місяць транзакцій немає.'
              : 'Кілька речень від GPT: що змінилось порівняно з минулим місяцем, де перевитрата і порада на наступний.'}
          </p>
          {stats.transactions > 0 && (
            <button onClick={() => write(false)} className="btn-primary mt-3 px-4 py-2 rounded-full text-sm font-semibold">
              Написати звіт
            </button>
          )}
        </>
      )}
    </div>
  )
}
