import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import BaseModal from '../BaseModal'
import Row from './Row'
import { listTransferCandidates, markExistingAsTransfer, transferFromExisting } from '../../api/transfers'
import { convertWithRates } from '../../utils/currency'
import { fmtAmount } from '../../utils/format'
import { txBus } from '../../utils/txBus'
import { cardLabel } from '../../utils/cardLabel'
import useMonoRates from '../../hooks/useMonoRates'

const DAY = 864e5
const MAX_CANDIDATES = 12

/**
 * «Зробити переказом» (same as the iPhone app): an existing transaction becomes a transfer between
 * your accounts, so it leaves the statistics. Either pair it with the other side that's already
 * there (money out on one card, in on another), or create the missing side on the account it went
 * to / came from.
 */
export default function TransferFromTxModal({ tx, cards = [], onClose, onDone }) {
  // Keep showing it while the modal closes
  const last = useRef(null)
  if (tx) last.current = tx
  const t = last.current

  const rates = useMonoRates()
  const [candidates, setCandidates] = useState(null)
  const [pairWith, setPairWith] = useState(null)
  const [targetId, setTargetId] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  // Answers for a transaction opened earlier are dropped
  const loadFor = useRef(null)

  const cardsById = useMemo(() => Object.fromEntries(cards.map(c => [c.id, c])), [cards])
  const currencyOf = x => x?.currency || (x?.card_id && cardsById[x.card_id]?.currency) || 'UAH'
  const isOutgoing = !!t && Number(t.amount) < 0
  const ownCard = t?.card_id ? cardsById[t.card_id] : null
  const otherCards = useMemo(() => cards.filter(c => c.id !== t?.card_id && !c.archived), [cards, t?.card_id])
  const target = targetId ? cardsById[targetId] : null

  useEffect(() => {
    if (!tx) return
    setCandidates(null)
    setPairWith(null)
    setTargetId('')
    setAmount('')
    loadFor.current = tx.id
    listTransferCandidates(tx)
      .then(list => loadFor.current === tx.id && setCandidates(list))
      .catch(() => loadFor.current === tx.id && setCandidates([]))
  }, [tx?.id])

  // The other side, most likely first: the same amount (in one currency, or converted), then the closest date
  const ranked = useMemo(() => {
    if (!t || !candidates) return []
    const amountAbs = Math.abs(Number(t.amount))
    const cur = currencyOf(t)
    const at = new Date(t.created_at).getTime()
    return candidates
      .map(c => {
        const theirs = Math.abs(Number(c.amount))
        const converted = convertWithRates(theirs, currencyOf(c), cur, rates)
        const off = amountAbs && converted != null ? Math.abs(Math.abs(converted) - amountAbs) / amountAbs : 1
        const exact = currencyOf(c) === cur && Math.abs(theirs - amountAbs) < 0.005
        const days = Math.abs(new Date(c.created_at).getTime() - at) / DAY
        // Exact amount, then within 3% after conversion, then within 15%; by date inside. Another
        // currency while the rates aren't loaded can't be compared: kept, by date
        const tier = exact ? 0 : converted == null ? 2 : off <= 0.03 ? 1 : off <= 0.15 ? 2 : 3
        return { c, tier, days }
      })
      .filter(x => x.tier < 3)
      .sort((a, b) => a.tier - b.tier || a.days - b.days)
      .slice(0, MAX_CANDIDATES)
      .map(x => x.c)
  }, [candidates, t, rates, cardsById])

  // The amount for a new leg: ours, converted when the other account has another currency
  useEffect(() => {
    if (!t || !target) return
    const ours = Math.abs(Number(t.amount))
    const v = convertWithRates(ours, currencyOf(t), target.currency || 'UAH', rates)
    // No rate for another currency: the field stays empty for the real credited amount
    setAmount(v == null ? '' : String(Math.round(Math.abs(v) * 100) / 100))
  }, [targetId, rates])

  const close = () => {
    if (!busy) onClose()
  }

  const finish = text => {
    toast.success(text)
    // Balances, totals and lists follow
    txBus.emit({ type: 'UPDATE' })
    onDone?.()
    onClose()
  }

  const pair = async () => {
    if (!t || !pairWith || busy) return
    setBusy(true)
    try {
      await markExistingAsTransfer({ fromTxId: isOutgoing ? t.id : pairWith.id, toTxId: isOutgoing ? pairWith.id : t.id })
      finish('Переказ готовий — обидві транзакції вийшли зі статистики')
    } catch (e) {
      toast.error(`Не вдалося: ${e?.message || e}`)
    } finally {
      setBusy(false)
    }
  }

  const parsed = parseFloat(String(amount).replace(',', '.').replace(/\s/g, ''))
  const canCreate = !!target && Number.isFinite(parsed) && parsed > 0 && !busy

  const create = async () => {
    if (!t || !canCreate) return
    setBusy(true)
    try {
      await transferFromExisting({ txId: t.id, cardId: target.id, amount: parsed })
      finish(`Переказ готовий: ${isOutgoing ? 'на' : 'з'} «${cardLabel(target)}» ${isOutgoing ? 'додано' : 'списано'} ${fmtAmount(parsed, target.currency)}`)
    } catch (e) {
      toast.error(`Не вдалося: ${e?.message || e}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <BaseModal open={!!tx} onClose={close} title="Зробити переказом" zIndex={120} maxWidth="xl">
      {t && (
        <div className="space-y-3 text-sm">
          <div className="rounded-2xl ring-1 ring-brand/45">
            <Row tx={t} currency={currencyOf(t)} showEditButton={false} />
          </div>
          <p className="text-[15px] text-white">
            {isOutgoing
              ? `Гроші пішли ${ownCard ? `з «${cardLabel(ownCard)}»` : 'з готівки'}. Куди вони прийшли?`
              : `Гроші прийшли ${ownCard ? `на «${cardLabel(ownCard)}»` : 'в готівку'}. Звідки?`}
          </p>

          {/* The other side is already there */}
          <div className="text-[11px] font-bold tracking-wider text-white/45 pt-1">ДРУГА ЧАСТИНА ВЖЕ Є</div>
          {candidates === null ? (
            <div className="py-3 text-white/50">Шукаю…</div>
          ) : ranked.length === 0 ? (
            <div className="text-white/60">
              Схожої транзакції {isOutgoing ? 'надходження' : 'списання'} на інших рахунках за тиждень поруч немає — створи її нижче.
            </div>
          ) : (
            <div className="space-y-1 max-h-[34vh] overflow-y-auto pr-1">
              {ranked.map(c => (
                <Row
                  key={c.id}
                  tx={c}
                  currency={currencyOf(c)}
                  compact
                  showEditButton={false}
                  selected={pairWith?.id === c.id}
                  onDetails={() => setPairWith(prev => (prev?.id === c.id ? null : c))}
                />
              ))}
            </div>
          )}
          {pairWith && (
            <button
              type="button"
              disabled={busy}
              onClick={pair}
              className="w-full px-3 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold transition disabled:opacity-50"
            >
              {busy ? 'Зберігаю…' : 'Об’єднати в переказ'}
            </button>
          )}

          {/* Create the missing side */}
          <div className="text-[11px] font-bold tracking-wider text-white/45 pt-2">
            {isOutgoing ? 'ДРУГОЇ ЧАСТИНИ НЕМАЄ — КУДИ ПРИЙШЛИ?' : 'ДРУГОЇ ЧАСТИНИ НЕМАЄ — ЗВІДКИ?'}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {otherCards.map(c => {
              const active = c.id === targetId
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setTargetId(active ? '' : c.id)}
                  className={`shrink-0 min-w-[110px] text-left px-3 py-2 rounded-xl border transition ${
                    active ? 'bg-brand/20 border-brand/60' : 'bg-white/[0.06] border-white/[0.08] hover:bg-white/10'
                  }`}
                >
                  <div className="text-[11px] font-bold text-white/40 truncate">{c.bank || 'Рахунок'}</div>
                  <div className={`text-[13.5px] font-bold truncate ${active ? 'text-white' : 'text-white/80'}`}>
                    {c.name} · {c.currency}
                  </div>
                </button>
              )
            })}
          </div>
          {target && (
            <label className="flex items-center gap-2.5 rounded-xl bg-white/[0.06] px-3.5 py-2.5">
              <span className="flex-1 text-white/60">{isOutgoing ? 'Прийшло на рахунок' : 'Списалось з рахунку'}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-32 bg-transparent text-right text-lg font-extrabold tabular-nums focus:outline-none"
              />
              <span className="font-bold text-white/60">{target.currency}</span>
            </label>
          )}
          <button
            type="button"
            onClick={create}
            disabled={!canCreate}
            className="w-full px-3 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold transition disabled:opacity-40"
          >
            {busy ? 'Зберігаю…' : target ? 'Створити переказ' : 'Оберіть рахунок'}
          </button>
          <p className="text-xs text-white/40">
            Переказ не рахується ні витратою, ні доходом. Скасувати можна в деталях транзакції: «Скасувати переказ».
          </p>
        </div>
      )}
    </BaseModal>
  )
}
