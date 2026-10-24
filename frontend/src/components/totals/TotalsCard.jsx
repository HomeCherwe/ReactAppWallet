import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BarChart2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchBalances } from '../../api/totals'
import { updateCard } from '../../api/cards'
import { listBanks } from '../../api/banks'
import { invalidateCardsCache, invalidateSumByCardCache } from '../../utils/dataCache'
import { txBus } from '../../utils/txBus'
import BalanceHistoryModal from './BalanceHistoryModal'
import OwnAccountModal from '../cards/OwnAccountModal'
import { CardModal, cardPatchFromForm } from '../cards/CardModals'
import CardTransactionsDrawer from '../transactions/CardTransactionsDrawer'
import { useSettingsStore } from '../../store/useSettingsStore'
import useMonoRates from '../../hooks/useMonoRates'
import { usePrimaryCurrency, sumIn, convertAmount, equivalentCurrencies } from '../../utils/primaryCurrency'
import { formatMoney } from '../../utils/cardTheme'
import { BUCKETS, KIND_META, KIND_OF_BUCKET } from '../../utils/accountKind'

const EMPTY = { cards: {}, savings: {}, cash: {}, investments: {} }
const signed = (v, cur, opts) => `${v < 0 ? '−' : ''}${formatMoney(v, cur, opts)}`

/**
 * «Загальний баланс» — the same as the iPhone Home: everything in the main currency, the other two
 * of UAH / EUR / USD under it, and a short line per group (cards, piggy banks, cash, investments).
 * A line opens the group: its accounts and its balance chart.
 */
export default function TotalsCard({ title = 'Загальний баланс' }) {
  const hidden = useSettingsStore(state => state.settings?.hideAllBalances ?? false)
  const primary = usePrimaryCurrency()
  const rates = useMonoRates()
  const ratesReady = !!rates && Object.keys(rates).length > 0
  const [data, setData] = useState(EMPTY)
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [openCard, setOpenCard] = useState(null)
  const [editCard, setEditCard] = useState(null)
  const [banks, setBanks] = useState([])

  const load = useCallback(async ({ fresh = false } = {}) => {
    if (fresh) {
      invalidateCardsCache()
      invalidateSumByCardCache()
    }
    try {
      const resp = await fetchBalances()
      setData({ ...EMPTY, ...resp.totals })
      setAccounts(resp.accounts)
    } catch (e) {
      console.error('load totals failed', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Transactions changed anywhere: follow a moment later, once the server has them
    let timer = null
    const off = txBus.subscribe(() => {
      clearTimeout(timer)
      timer = setTimeout(() => load({ fresh: true }), 500)
    })
    return () => {
      clearTimeout(timer)
      off?.()
    }
  }, [load])

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

  // Every currency of every group, for the whole balance's history
  const allTotals = useMemo(() => {
    const out = {}
    for (const key of BUCKETS) {
      for (const [cur, v] of Object.entries(data[key] || {})) out[cur] = (out[cur] || 0) + v
    }
    return out
  }, [data])

  const equivalents = equivalentCurrencies(primary)
    .map(cur => {
      const v = convertAmount(total, primary, cur, rates)
      return v == null ? null : signed(v, cur, { hideCents: true })
    })
    .filter(Boolean)
    .join(' · ')

  const ready = !loading && ratesReady
  const opened = history === 'all'
    ? { title: 'Загальний баланс', totals: allTotals }
    : history && { title: KIND_META[KIND_OF_BUCKET[history]].many, totals: data[history] || {} }

  // An account in the window: its transactions (the window steps aside)
  const openAccount = (card) => {
    setHistory(null)
    setOpenCard(card)
  }

  const openSettings = async (card) => {
    setOpenCard(null)
    setEditCard(card)
    if (!banks.length) setBanks(await listBanks().catch(() => []))
  }

  const saveCard = async (form, file) => {
    try {
      await updateCard(editCard.id, cardPatchFromForm(form, editCard), file)
      setEditCard(null)
      toast.success(form.archived ? 'Сховано в архів' : 'Збережено')
      load({ fresh: true })
      txBus.emit({ type: 'SYNC' })
    } catch (e) {
      toast.error(e?.message || 'Не вдалося зберегти')
      throw e
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-white/[0.075] to-white/[0.025] backdrop-blur-xl shadow-glass p-4 sm:p-5 border border-brand/20 flex flex-col"
    >
      <div className="pointer-events-none absolute -z-10 -top-16 -right-16 h-40 w-40 rounded-full blur-3xl bg-brand/15" />

      <button
        type="button"
        onClick={() => setHistory('all')}
        className="group text-left -m-1 p-1 rounded-2xl"
        title="Графік балансу"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-sm font-semibold text-white/60">{title}</span>
          <BarChart2 size={14} className="text-brand-light opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        {ready ? (
          <>
            <div className="text-[26px] sm:text-3xl font-bold tracking-tight text-white tabular-nums truncate">
              {hidden ? '••••••' : signed(total, primary)}
            </div>
            <div className="mt-1 h-4 text-xs font-medium text-white/40 tabular-nums truncate">
              {hidden || !equivalents ? '' : `≈ ${equivalents}`}
            </div>
          </>
        ) : (
          <>
            <div className="h-9 w-2/3 rounded-xl bg-white/[0.07] animate-pulse" />
            <div className="mt-1 h-4 w-1/2 rounded bg-white/[0.06] animate-pulse" />
          </>
        )}
      </button>

      {/* One short line per group; a line opens its accounts and chart */}
      <div className="mt-auto pt-3">
        {/* Two to a row while the card spans the screen (like the iPhone), one in the narrow column */}
        <div className="pt-2 border-t border-white/[0.06] grid grid-cols-2 md:grid-cols-1 gap-x-6 gap-y-px">
          {ready
            ? groups.map(g => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setHistory(g.key)}
                  className="-mx-2 px-2 py-1 flex items-center gap-2 rounded-lg hover:bg-white/[0.06] transition-colors text-left"
                >
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: g.meta.accent[0] }} />
                  <span className="flex-1 min-w-0 truncate text-xs font-medium text-white/55">{g.meta.many}</span>
                  <span className={`text-[13px] font-semibold tabular-nums ${g.value < 0 ? 'text-[#FF6B6B]' : 'text-white'}`}>
                    {hidden ? '••••' : signed(g.value, primary, { hideCents: true })}
                  </span>
                </button>
              ))
            : [0, 1, 2].map(i => <div key={i} className="my-1 h-4 rounded bg-white/[0.05] animate-pulse" />)}
        </div>
      </div>

      <BalanceHistoryModal
        open={!!opened}
        onClose={() => setHistory(null)}
        bucket={history || 'all'}
        sectionTitle={opened?.title}
        initialCurrency={primary}
        totals={opened?.totals || {}}
        groups={groups}
        accounts={accounts}
        hidden={hidden}
        onOpenBucket={setHistory}
        onOpenAccount={openAccount}
        onAddPiggy={() => {
          setHistory(null)
          setAddOpen(true)
        }}
      />
      <OwnAccountModal open={addOpen} initialKind="savings" onClose={() => setAddOpen(false)} onCreated={() => load({ fresh: true })} />
      <CardModal open={!!editCard} initial={editCard} banks={banks} onClose={() => setEditCard(null)} onSubmit={saveCard} />
      <AnimatePresence>
        {openCard && (
          <CardTransactionsDrawer
            key={openCard.id}
            card={accounts.find(c => c.id === openCard.id) || openCard}
            onClose={() => setOpenCard(null)}
            onOpenSettings={openSettings}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
