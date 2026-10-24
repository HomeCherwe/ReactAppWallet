import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart2, Wallet } from 'lucide-react'
import { fetchTotalsByBucket } from '../../api/totals'
import { txBus } from '../../utils/txBus'
import BalanceHistoryModal from './BalanceHistoryModal'
import { useSettingsStore } from '../../store/useSettingsStore'
import useMonoRates from '../../hooks/useMonoRates'
import { usePrimaryCurrency, sumIn, convertAmount, equivalentCurrencies } from '../../utils/primaryCurrency'
import { formatMoney } from '../../utils/cardTheme'
import { BUCKETS, KIND_META, KIND_OF_BUCKET } from '../../utils/accountKind'

const EMPTY = { cards: {}, savings: {}, cash: {}, investments: {} }
const ORDER = ['UAH', 'EUR', 'USD', 'USDT', 'PLN', 'GBP', 'CHF', 'CZK', 'HUF']

const signed = (v, cur, opts) => `${v < 0 ? '−' : ''}${formatMoney(v, cur, opts)}`

/** «€7 250 · $3 800»: a group's money in the currencies it is actually in */
export function currencyBreakdown(byCurrency, opts = { hideCents: true }) {
  return Object.entries(byCurrency || {})
    .filter(([, v]) => Math.abs(v) >= 0.005)
    .sort((a, b) => (ORDER.indexOf(a[0]) + 1 || 99) - (ORDER.indexOf(b[0]) + 1 || 99))
    .map(([cur, v]) => signed(v, cur, opts))
    .join(' · ')
}

/**
 * «Загальний баланс» — the same as the iPhone Home: everything in the main currency, the other two
 * of UAH / EUR / USD under it, then what it is made of (cards, piggy banks, cash, investments), each
 * in the main currency and in the currencies it is in. A tap opens that group's balance history.
 */
export default function TotalsCard({ title = 'Загальний баланс' }) {
  const hidden = useSettingsStore(state => state.settings?.hideAllBalances ?? false)
  const primary = usePrimaryCurrency()
  const rates = useMonoRates()
  const ratesReady = !!rates && Object.keys(rates).length > 0
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState(null)

  useEffect(() => {
    let mounted = true
    let timer = null
    const load = async () => {
      try {
        const resp = await fetchTotalsByBucket()
        if (mounted) setData({ ...EMPTY, ...(resp || {}) })
      } catch (e) {
        console.error('load totals failed', e)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    // Transactions changed anywhere: follow a moment later, once the server has them
    const off = txBus.subscribe(() => {
      clearTimeout(timer)
      timer = setTimeout(load, 500)
    })
    return () => {
      mounted = false
      clearTimeout(timer)
      off?.()
    }
  }, [])

  const groups = useMemo(
    () =>
      BUCKETS.map(key => ({
        key,
        meta: KIND_META[KIND_OF_BUCKET[key]],
        totals: data[key] || {},
        value: sumIn(data[key], primary, rates),
      })).filter(g => Object.values(g.totals).some(v => Math.abs(v) >= 0.005)),
    [data, primary, rates]
  )
  const total = groups.reduce((s, g) => s + g.value, 0)
  const positive = groups.reduce((s, g) => s + Math.max(0, g.value), 0)

  // Every currency of every group, for the «Всі» history
  const allTotals = useMemo(() => {
    const out = {}
    for (const key of BUCKETS) {
      for (const [cur, v] of Object.entries(data[key] || {})) out[cur] = (out[cur] || 0) + v
    }
    return out
  }, [data])

  const equivalents = equivalentCurrencies(primary)
    .map(cur => convertAmount(total, primary, cur, rates))
    .map((v, i) => (v == null ? null : signed(v, equivalentCurrencies(primary)[i], { hideCents: true })))
    .filter(Boolean)
    .join(' · ')

  const ready = !loading && ratesReady
  const opened = history === 'all' ? { title: 'Загальний баланс', totals: allTotals } : groups.find(g => g.key === history)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-3xl bg-gradient-to-b from-white/[0.075] to-white/[0.025] backdrop-blur-xl shadow-glass overflow-hidden border border-white/10"
    >
      <button
        type="button"
        onClick={() => setHistory('all')}
        className="group w-full text-left px-4 pt-4 pb-3 hover:bg-white/[0.03] transition-colors"
        title="Переглянути графік балансу"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wallet size={15} className="text-brand" />
            <h3 className="text-[13px] font-semibold text-white/75">{title}</h3>
          </div>
          <BarChart2 size={14} className="text-brand-light opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        {ready ? (
          <>
            <div className="mt-2 text-[28px] leading-9 font-extrabold tracking-tight text-white tabular-nums">
              {hidden ? '••••••' : signed(total, primary)}
            </div>
            <div className="h-5 text-xs font-medium text-white/50 tabular-nums">{hidden ? '' : equivalents && `≈ ${equivalents}`}</div>
          </>
        ) : (
          <div className="mt-2">
            <div className="h-9 w-2/3 rounded-xl bg-white/[0.07] animate-pulse" />
            <div className="mt-1.5 h-3.5 w-1/2 rounded bg-white/[0.06] animate-pulse" />
          </div>
        )}
      </button>

      {ready && groups.length > 0 && (
        <div className="px-4 pb-4">
          {/* What the total is made of */}
          <div className="flex h-1.5 rounded-full overflow-hidden bg-white/[0.06] gap-[2px]">
            {groups
              .filter(g => g.value > 0)
              .map(g => (
                <span
                  key={g.key}
                  className="h-full rounded-full"
                  style={{ width: `${(g.value / positive) * 100}%`, background: `linear-gradient(90deg, ${g.meta.accent[0]}, ${g.meta.accent[1]})` }}
                />
              ))}
          </div>

          <div className="mt-3 grid gap-1">
            {groups.map(g => (
              <button
                key={g.key}
                type="button"
                onClick={() => setHistory(g.key)}
                className="flex items-center gap-2.5 -mx-2 px-2 py-1.5 rounded-xl hover:bg-white/[0.05] transition-colors text-left"
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: g.meta.accent[0] }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-white/85">
                    {g.meta.icon} {g.meta.many}
                  </span>
                  {/* In the currencies it is in, when that's not just the main one */}
                  {!hidden && Object.keys(g.totals).some(c => c !== primary) && (
                    <span className="block text-[11px] text-white/45 truncate tabular-nums">{currencyBreakdown(g.totals)}</span>
                  )}
                </span>
                <span className="text-right shrink-0">
                  <span className={`block text-[13px] font-bold tabular-nums ${g.value < 0 ? 'text-[#FF6B6B]' : 'text-white'}`}>
                    {hidden ? '••••' : signed(g.value, primary, { hideCents: true })}
                  </span>
                  {positive > 0 && g.value > 0 && (
                    <span className="block text-[10px] font-semibold text-white/35 tabular-nums">{Math.round((g.value / positive) * 100)}%</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <BalanceHistoryModal
        open={!!opened}
        onClose={() => setHistory(null)}
        bucket={history || 'all'}
        sectionTitle={opened?.title || opened?.meta?.many}
        initialCurrency={primary}
        totals={opened?.totals || {}}
      />
    </motion.div>
  )
}
