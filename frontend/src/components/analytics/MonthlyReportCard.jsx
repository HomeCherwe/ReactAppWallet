import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { listCards } from '../../api/cards'
import { getMonthlyReport, parseReport, readMonthlyReport } from '../../api/insights'
import useMonoRates from '../../hooks/useMonoRates'
import { usePrimaryCurrency } from '../../utils/primaryCurrency'
import { useExcludedCategories } from '../../utils/statsCategories'
import { countedTransactions, listPeriodTransactions } from '../../utils/statsCount'

const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень']
// "порівняно з серпнем"
const MONTHS_INSTR = ['січнем', 'лютим', 'березнем', 'квітнем', 'травнем', 'червнем', 'липнем', 'серпнем', 'вереснем', 'жовтнем', 'листопадом', 'груднем']

const SECTION = {
  changes: { emoji: '📊', title: 'Що змінилось', dot: 'bg-white/50' },
  overspend: { emoji: '🔥', title: 'Де перевитрата', dot: 'bg-rose-400' },
  good: { emoji: '👍', title: 'Що вийшло добре', dot: 'bg-green-400' },
  tip: { emoji: '💡', title: 'Порада', dot: 'bg-brand-light' },
}

/** Change against the previous month, e.g. { text: '↑ 23%', up: true }; null when there's nothing to compare */
function delta(now, before) {
  if (!before) return null
  const pct = Math.round(((now - before) / before) * 100)
  if (pct === 0) return { text: '= 0%', up: false }
  return { text: `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}%`, up: pct > 0 }
}

/** Income / spending against the previous month (not for a month still going on: half a month always looks cheaper) */
export function ReportChanges({ stats, monthIndex }) {
  if (!stats || stats.partial || !stats.transactions) return null
  const items = [
    { label: 'Витрати', d: delta(stats.expense, stats.previous.expense), good: false },
    { label: 'Доходи', d: delta(stats.income, stats.previous.income), good: true },
  ].filter(c => c.d)
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {items.map(c => {
        // More income is good; more spending isn't
        const fine = c.d.up === c.good
        return (
          <span
            key={c.label}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12.5px] ${fine ? 'bg-green-500/10 border-green-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}
          >
            <span className="font-semibold text-white/80">{c.label}</span>
            <span className={`font-extrabold tabular-nums ${fine ? 'text-green-400' : 'text-rose-400'}`}>{c.d.text}</span>
          </span>
        )
      })}
      <span className="text-xs text-white/40">порівняно з {MONTHS_INSTR[(monthIndex + 11) % 12]}</span>
    </div>
  )
}

/** The report laid out: the summary, then each part with its points; the tip stands out */
export function ReportBody({ text }) {
  const { summary, sections } = useMemo(() => parseReport(text), [text])
  return (
    <div>
      {summary && <p className="text-[17px] leading-snug font-bold text-white">{summary}</p>}
      {sections.map(s => {
        const meta = SECTION[s.type] ?? SECTION.changes
        const tip = s.type === 'tip'
        return (
          <div key={s.type} className={tip ? 'mt-4 p-3.5 rounded-2xl bg-brand/[0.12] border border-brand/40' : 'mt-4'}>
            <div className="text-xs font-extrabold uppercase tracking-wide text-white/60 mb-1.5">
              {meta.emoji} {meta.title}
            </div>
            <ul className="space-y-1.5">
              {s.points.map((p, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-white">
                  {!tip && <span className={`mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />}
                  <span className={tip ? 'font-semibold' : ''}>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

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

      <ReportChanges stats={stats} monthIndex={month.getMonth()} />

      {writing ? (
        <div className="flex items-center gap-3 py-2 text-white/65 text-sm">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand" />
          Пишу звіт за {MONTHS[month.getMonth()].toLowerCase()}…
        </div>
      ) : report ? (
        <>
          <ReportBody text={report.report} />
          <div className="flex items-center gap-3 mt-4 text-xs text-white/45">
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
              : 'Короткий розбір від GPT: що змінилось порівняно з минулим місяцем, де перевитрата, що вийшло добре, і порада на наступний.'}
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
