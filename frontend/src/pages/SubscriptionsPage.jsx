import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Repeat, RefreshCw, ChevronRight, ChevronDown, EyeOff, Pencil, Trash2, Undo2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { listCards } from '../api/cards'
import { deleteSubscription, detectSubscriptions, listSubscriptions, monthlyCost, updateSubscription } from '../api/insights'
import DeleteSubscriptionModal from '../components/subscriptions/DeleteSubscriptionModal'
import SubscriptionTransactionsDrawer from '../components/subscriptions/SubscriptionTransactionsDrawer'
import useMonoRates from '../hooks/useMonoRates'
import { convertAmount, usePrimaryCurrency } from '../utils/primaryCurrency'
import { formatMoney } from '../utils/cardTheme'
import { getCategoryVisual } from '../utils/categoryIcon'

const FREQ = { weekly: 'щотижня', monthly: 'щомісяця', yearly: 'щороку' }
const DAY = 864e5

function dueLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date().setHours(0, 0, 0, 0)) / DAY)
  if (days === 0) return 'сьогодні'
  if (days === 1) return 'завтра'
  if (days > 1 && days <= 6) return `через ${days} ${days < 5 ? 'дні' : 'днів'}`
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
}

const shortDate = iso => (iso ? new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

/**
 * Subscriptions the bank's charges show (Netflix, rent, the phone…) — for information only: the
 * charges come from the bank, MyWallet just finds them (same as the iPhone app). Click one to see
 * every charge.
 */
export default function SubscriptionsPage() {
  const [subs, setSubs] = useState(null)
  const [cards, setCards] = useState([])
  const [detecting, setDetecting] = useState(false)
  const [open, setOpen] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [expanded, setExpanded] = useState({ inactive: false, old: false, hidden: false })
  const rates = useMonoRates()
  const currency = usePrimaryCurrency()

  const load = async (detect = false, force = false) => {
    try {
      if (detect) {
        setDetecting(true)
        await detectSubscriptions(force).catch(e => force && toast.error(`Не вдалося перевірити: ${e.message}`))
      }
      setSubs((await listSubscriptions()) || [])
    } catch (e) {
      setSubs(prev => prev ?? [])
      toast.error(`Не вдалося завантажити підписки: ${e.message}`)
    } finally {
      setDetecting(false)
    }
  }

  useEffect(() => {
    load(true)
    listCards().then(setCards).catch(() => {})
  }, [])

  const cardOf = id => cards.find(c => c.id === id)
  const curOf = s => String(s.currency || cardOf(s.card_id)?.currency || 'UAH').toUpperCase()
  const chargeText = s => {
    const per = Math.max(1, s.charges_per_period || 1)
    return per > 1 ? `${per} × ${formatMoney(s.amount, curOf(s))}` : formatMoney(s.amount, curOf(s))
  }

  const groups = useMemo(() => {
    const list = subs ?? []
    const detected = list.filter(s => s.source === 'detected' && !s.hidden)
    return {
      active: detected.filter(s => s.is_active).sort((a, b) => (a.next_execution_at || '').localeCompare(b.next_execution_at || '')),
      inactive: detected.filter(s => !s.is_active).sort((a, b) => (b.last_executed_at || '').localeCompare(a.last_executed_at || '')),
      old: list.filter(s => s.source !== 'detected' && !s.hidden),
      hidden: list.filter(s => s.hidden),
    }
  }, [subs])

  const monthly = groups.active.reduce((sum, s) => sum + (convertAmount(monthlyCost(s), curOf(s), currency, rates) ?? 0), 0)

  const rename = async s => {
    const name = window.prompt('Назва підписки', s.name)?.trim()
    if (!name || name === s.name) return
    try {
      await updateSubscription(s.id, { name })
      load()
    } catch (e) {
      toast.error(`Не вдалося: ${e.message}`)
    }
  }

  const setHidden = async (s, hidden) => {
    try {
      await updateSubscription(s.id, { hidden })
      toast.success(hidden ? `«${s.name}» — не підписка` : `«${s.name}» знову в підписках`)
      load()
    } catch (e) {
      toast.error(`Не вдалося: ${e.message}`)
    }
  }

  const remove = async () => {
    const s = toDelete
    setToDelete(null)
    try {
      await deleteSubscription(s.id)
      toast.success('Видалено')
      load()
    } catch (e) {
      toast.error(`Не вдалося видалити: ${e.message}`)
    }
  }

  const row = (s, muted = false) => {
    const { Icon, color } = getCategoryVisual(s.category || 'Підписки', -1, false)
    const card = cardOf(s.card_id)
    return (
      <div
        key={s.id}
        onClick={() => setOpen(s)}
        className={`group flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition bg-white/[0.035] hover:bg-white/[0.07] ${muted ? 'opacity-70' : ''}`}
      >
        <div
          className="h-10 w-10 shrink-0 rounded-[11px] grid place-items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
          style={{ background: muted ? 'rgba(255,255,255,0.12)' : `linear-gradient(180deg, ${color}, ${color}d9)` }}
        >
          <Icon size={20} strokeWidth={2.2} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[15px] text-white truncate">{s.name}</div>
          <div className="text-xs text-white/55 truncate">
            {s.hidden
              ? 'прихована — не підписка'
              : s.source !== 'detected'
                ? 'додана вручну раніше'
                : s.is_active
                  ? `${FREQ[s.frequency] || ''} · наступне ${dueLabel(s.next_execution_at)}`
                  : `не списується з ${shortDate(s.last_executed_at)}`}
            {card ? ` · ${card.bank ? `${card.bank} ` : ''}${card.name}` : ''}
          </div>
        </div>
        <div className="font-semibold text-[15px] tabular-nums whitespace-nowrap">{chargeText(s)}</div>
        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition" onClick={e => e.stopPropagation()}>
          <IconBtn title="Перейменувати" onClick={() => rename(s)}><Pencil size={14} /></IconBtn>
          {s.hidden ? (
            <IconBtn title="Повернути в підписки" onClick={() => setHidden(s, false)}><Undo2 size={14} /></IconBtn>
          ) : s.source === 'detected' ? (
            <IconBtn title="Це не підписка" onClick={() => setHidden(s, true)}><EyeOff size={14} /></IconBtn>
          ) : (
            <IconBtn title="Видалити" danger onClick={() => setToDelete(s)}><Trash2 size={14} /></IconBtn>
          )}
        </div>
        <ChevronRight size={18} className="text-white/35 shrink-0" />
      </div>
    )
  }

  const collapsible = (key, title, list) =>
    list.length > 0 && (
      <div className="mt-4">
        <button
          onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}
          className="flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white/85 transition mb-2"
        >
          {expanded[key] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          {title} ({list.length})
        </button>
        {expanded[key] && <div className="space-y-2">{list.map(s => row(s, true))}</div>}
      </div>
    )

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-b from-white/[0.075] to-white/[0.025] backdrop-blur-xl rounded-3xl shadow-glass p-4 sm:p-6 border border-white/10"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Repeat size={22} />
            Підписки
          </h2>
          <p className="text-sm text-white/55 mt-1 max-w-xl">
            MyWallet сам знаходить регулярні списання у ваших банках — нічого не створює, лише показує. Натисніть на підписку,
            щоб побачити всі її списання.
          </p>
        </div>
        <button
          onClick={() => load(true, true)}
          disabled={detecting}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.07] hover:bg-white/[0.12] text-sm font-semibold text-white/85 disabled:opacity-60 transition shrink-0"
        >
          <RefreshCw size={15} className={detecting ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">{detecting ? 'Шукаю…' : 'Перевірити'}</span>
        </button>
      </div>

      {groups.active.length > 0 && (
        <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-brand/[0.14] to-brand/[0.05] border border-brand/25 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <div className="text-xs text-white/60">Активні підписки на місяць</div>
            <div className="text-2xl font-bold text-brand-light tabular-nums">≈ {formatMoney(monthly, currency, { hideCents: true })}</div>
          </div>
          <div className="text-sm text-white/60">
            ≈ {formatMoney(monthly * 12, currency, { hideCents: true })} на рік · {groups.active.length} шт.
          </div>
        </div>
      )}

      {subs === null ? (
        <div className="py-12 grid place-items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
        </div>
      ) : groups.active.length === 0 && groups.inactive.length === 0 ? (
        <div className="text-center py-12 text-white/55">
          <Repeat size={44} className="mx-auto mb-3 opacity-50" />
          <p>Регулярних списань поки не видно</p>
          <p className="text-sm mt-1">Коли банк кілька разів спише ту саму суму щомісяця — підписка з’явиться тут.</p>
        </div>
      ) : (
        <div className="space-y-2">{groups.active.map(s => row(s))}</div>
      )}

      {collapsible('inactive', 'Більше не списуються', groups.inactive)}
      {collapsible('old', 'Додані вручну раніше', groups.old)}
      {collapsible('hidden', 'Приховані', groups.hidden)}

      <p className="text-xs text-white/40 mt-5">
        На iPhone MyWallet нагадає за день до списання. Помилилися? «Це не підписка» прибере її зі списку.
      </p>

      <SubscriptionTransactionsDrawer open={!!open} onClose={() => setOpen(null)} subscription={open} cards={cards} />
      <DeleteSubscriptionModal open={!!toDelete} subscription={toDelete} onDelete={remove} onCancel={() => setToDelete(null)} />
    </motion.div>
  )
}

function IconBtn({ title, onClick, danger, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`h-8 w-8 grid place-items-center rounded-full transition ${danger ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400' : 'bg-white/[0.06] hover:bg-white/[0.14] text-white/70'}`}
    >
      {children}
    </button>
  )
}
