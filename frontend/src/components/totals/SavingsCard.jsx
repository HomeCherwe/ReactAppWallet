import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PiggyBank } from 'lucide-react'
import toast from 'react-hot-toast'
import { listCards, updateCard } from '../../api/cards'
import { listBanks } from '../../api/banks'
import { sumTransactionsByCard } from '../../api/transactions'
import { invalidateCardsCache, invalidateSumByCardCache } from '../../utils/dataCache'
import { txBus } from '../../utils/txBus'
import { useSettingsStore } from '../../store/useSettingsStore'
import useMonoRates from '../../hooks/useMonoRates'
import { usePrimaryCurrency, sumIn } from '../../utils/primaryCurrency'
import { formatMoney } from '../../utils/cardTheme'
import { accountKind, goalProgress, KIND_META } from '../../utils/accountKind'
import { currencyBreakdown } from './TotalsCard'
import OwnAccountModal from '../cards/OwnAccountModal'
import { CardModal, cardPatchFromForm } from '../cards/CardModals'
import CardTransactionsDrawer from '../transactions/CardTransactionsDrawer'

const ACCENT = KIND_META.savings.accent
const signed = (v, cur, opts) => `${v < 0 ? '−' : ''}${formatMoney(v, cur, opts)}`
// A bank name that says nothing about where the money is
const NO_BANK = new Set(['', 'інші'])

/**
 * «Скарбнички» — the same block as on the iPhone Home: everything put aside in the main currency,
 * the currencies it is in, and every piggy bank with its goal. A tap opens its transactions.
 */
export default function SavingsCard() {
  const hidden = useSettingsStore(state => state.settings?.hideAllBalances ?? false)
  const primary = usePrimaryCurrency()
  const rates = useMonoRates()
  const ratesReady = !!rates && Object.keys(rates).length > 0
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
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
      const [list, sums] = await Promise.all([listCards(), sumTransactionsByCard().catch(() => ({}))])
      setCards((list || []).map(c => ({ ...c, _balance: Number(c.initial_balance || 0) + Number(sums[c.id] || 0) })))
    } catch (e) {
      console.error('SavingsCard load failed', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
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

  // Like the totals: not archived, not in a bank switched off; an empty one only with a goal
  const piggies = useMemo(
    () =>
      cards
        .filter(c => accountKind(c) === 'savings' && !c.archived && !c.bank_exclude_from_stats)
        .filter(c => Math.abs(c._balance) >= 0.005 || Number(c.goal_amount) > 0)
        .map(c => ({ ...c, _inPrimary: sumIn({ [c.currency || 'UAH']: c._balance }, primary, rates) }))
        .sort((a, b) => b._inPrimary - a._inPrimary),
    [cards, primary, rates]
  )
  const byCurrency = useMemo(() => {
    const out = {}
    for (const p of piggies) {
      const cur = (p.currency || 'UAH').toUpperCase()
      out[cur] = (out[cur] || 0) + p._balance
    }
    return out
  }, [piggies])
  const total = piggies.reduce((s, p) => s + p._inPrimary, 0)
  const ready = !loading && ratesReady

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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative rounded-3xl bg-gradient-to-b from-white/[0.075] to-white/[0.025] backdrop-blur-xl shadow-glass overflow-hidden border border-emerald-500/20"
    >
      <div className="pointer-events-none absolute -z-10 -top-16 -right-16 h-40 w-40 rounded-full blur-3xl bg-emerald-500/15" />

      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <div className="flex items-center gap-2">
          <PiggyBank size={15} className="text-emerald-400" />
          <h3 className="text-[13px] font-semibold text-white/75">Скарбнички</h3>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="px-2.5 py-1 rounded-full text-xs font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/15 transition-colors"
        >
          + Нова
        </button>
      </div>

      {!ready ? (
        <div className="px-4 pb-4 mt-2">
          <div className="h-9 w-1/2 rounded-xl bg-white/[0.07] animate-pulse" />
          <div className="mt-3 h-12 rounded-2xl bg-white/[0.05] animate-pulse" />
        </div>
      ) : piggies.length === 0 ? (
        <div className="px-4 pb-5 pt-3 text-center">
          <div className="text-[34px]">🐷</div>
          <div className="mt-1 text-sm font-semibold text-white">Поки що жодної скарбнички</div>
          <div className="mt-1 text-xs text-white/50">
            Гроші, які відкладаєте, — окремо від карток: видно, скільки зібрано і на що
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-3 px-4 h-9 rounded-full text-sm font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT[0]}, ${ACCENT[1]})` }}
          >
            Створити скарбничку
          </button>
        </div>
      ) : (
        <>
          <div className="px-4 mt-2 text-[28px] leading-9 font-extrabold tracking-tight text-white tabular-nums">
            {hidden ? '••••••' : signed(total, primary)}
          </div>
          {/* The euros and dollars as they are, not converted */}
          <div className="px-4 h-5 text-xs font-medium text-white/50 tabular-nums truncate">
            {hidden ? '' : Object.keys(byCurrency).some(c => c !== primary) ? currencyBreakdown(byCurrency) : ''}
          </div>

          <div className="px-2 pb-2 mt-2 grid gap-0.5">
            {piggies.map(p => {
              const progress = goalProgress(p, p._balance)
              const bank = String(p.bank || '').trim()
              const where = NO_BANK.has(bank.toLowerCase()) ? '' : bank
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setOpenCard(p)}
                  className="flex items-center gap-3 px-2 py-2 rounded-2xl hover:bg-white/[0.05] transition-colors text-left"
                >
                  <span
                    className="h-10 w-10 shrink-0 rounded-[13px] grid place-items-center text-lg"
                    style={{ background: `linear-gradient(135deg, ${ACCENT[0]}, ${ACCENT[1]})` }}
                  >
                    🐷
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold text-white truncate">{p.name}</span>
                      <span className={`text-sm font-extrabold tabular-nums shrink-0 ${p._balance < 0 ? 'text-[#FF6B6B]' : 'text-white'}`}>
                        {hidden ? '••••' : signed(p._balance, p.currency)}
                      </span>
                    </span>
                    {progress != null ? (
                      <>
                        <span className="mt-1.5 block h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${ACCENT[0]}, ${ACCENT[1]})` }}
                          />
                        </span>
                        <span className="mt-1 flex justify-between gap-2 text-[11px] text-white/45 tabular-nums">
                          <span className="truncate">
                            {where ? `${where} · ` : ''}ціль {hidden ? '••••' : formatMoney(p.goal_amount, p.currency, { hideCents: true })}
                          </span>
                          <span className={progress >= 1 ? 'text-emerald-300 font-semibold' : ''}>
                            {progress >= 1 ? '✓ зібрано' : `${Math.floor(progress * 100)}%`}
                          </span>
                        </span>
                      </>
                    ) : (
                      where && <span className="block text-[11px] text-white/45 truncate">{where}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      <OwnAccountModal open={addOpen} initialKind="savings" onClose={() => setAddOpen(false)} onCreated={() => load({ fresh: true })} />
      <CardModal open={!!editCard} initial={editCard} banks={banks} onClose={() => setEditCard(null)} onSubmit={saveCard} />
      <AnimatePresence>
        {openCard && (
          <CardTransactionsDrawer
            key={openCard.id}
            card={cards.find(c => c.id === openCard.id) || openCard}
            onClose={() => setOpenCard(null)}
            onOpenSettings={openSettings}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
