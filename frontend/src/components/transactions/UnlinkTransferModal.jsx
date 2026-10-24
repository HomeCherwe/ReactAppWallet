import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ArrowLeftRight } from 'lucide-react'
import BaseModal from '../BaseModal'
import { listTransferLegs, unlinkTransfer } from '../../api/transfers'
import { fmtAmount } from '../../utils/format'
import { txBus } from '../../utils/txBus'
import { cardLabel } from '../../utils/cardLabel'

/**
 * «Скасувати переказ» (same choices as the iPhone app). Unlinking keeps both legs as ordinary
 * transactions; a leg that isn't a bank import (the one the app created when the transfer was made,
 * or both for a transfer made in the app) can be deleted instead, so undoing doesn't leave money
 * that never moved.
 */
export default function UnlinkTransferModal({ tx, cards = [], onClose, onDone }) {
  const [legs, setLegs] = useState(null)
  // The legs couldn't be loaded: only «Роз’єднати» is offered (deleting needs to know the bank ones)
  const [legsFailed, setLegsFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  // Answers for a transfer opened earlier are dropped
  const loadFor = useRef(null)

  useEffect(() => {
    if (!tx?.transfer_id) return
    setLegs(null)
    setLegsFailed(false)
    loadFor.current = tx.transfer_id
    listTransferLegs([tx.transfer_id])
      .then(list => {
        if (loadFor.current !== tx.transfer_id) return
        setLegs([...list].sort((a, b) => (a.transfer_role === 'from' ? -1 : 0) - (b.transfer_role === 'from' ? -1 : 0)))
      })
      .catch(() => {
        if (loadFor.current !== tx.transfer_id) return
        setLegs([tx])
        setLegsFailed(true)
      })
  }, [tx?.transfer_id])

  const cardOf = l => (l.card_id ? cards.find(c => c.id === l.card_id) : null)
  const accountName = l => (l.card_id ? cardLabel(cardOf(l)) || l.card || 'рахунок' : 'Готівка')
  const label = l => {
    const amount = Number(l.amount)
    return `${amount < 0 ? '−' : '+'}${fmtAmount(Math.abs(amount), l.currency || cardOf(l)?.currency)} · ${accountName(l)}`
  }

  const list = legs || []
  // Not from a bank: made in the app (or typed in by hand) — the only legs that may be deleted
  const appMade = legsFailed ? [] : list.filter(l => !l.transaction_id_card)

  const run = async deleteIds => {
    if (!tx?.transfer_id || busy) return
    setBusy(true)
    try {
      await unlinkTransfer(tx.transfer_id, deleteIds)
      const kept = list.length - deleteIds.length
      toast.success(kept === 0 ? 'Переказ видалено' : 'Переказ скасовано — постав категорію тому, що лишилось')
      // Balances, totals and lists follow
      txBus.emit({ type: 'UPDATE' })
      onDone?.()
      onClose()
    } catch (e) {
      toast.error(`Не вдалося скасувати переказ: ${e?.message || e}`)
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    if (!busy) onClose()
  }

  return (
    <BaseModal open={!!tx} onClose={close} title="Скасувати переказ?" zIndex={120} maxWidth="md">
      <div className="space-y-3 text-sm">
        <div className="rounded-2xl border border-[#8AB4FF]/30 bg-[#8AB4FF]/[0.07] p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-[13px] font-extrabold text-[#8AB4FF]">
            <ArrowLeftRight size={15} strokeWidth={2.4} />
            Переказ між рахунками
          </div>
          {legs === null ? (
            <div className="py-2 text-white/50">Завантаження…</div>
          ) : (
            list.map(l => (
              <div key={l.id} className="flex items-center gap-2.5 rounded-xl bg-white/[0.05] px-3 py-2">
                <span className="w-6 text-[12.5px] font-extrabold text-white/60">{Number(l.amount) < 0 ? 'З' : 'На'}</span>
                <span className="flex-1 truncate font-bold">{accountName(l)}</span>
                {!l.transaction_id_card && <span className="text-[11px] text-white/40">не з банку</span>}
                <span className="font-extrabold tabular-nums">
                  {Number(l.amount) < 0 ? '−' : '+'}
                  {fmtAmount(Math.abs(Number(l.amount)), l.currency || cardOf(l)?.currency)}
                </span>
              </div>
            ))
          )}
        </div>

        <p className="text-white/65 leading-relaxed">
          Роз’єднані частини стануть звичайними транзакціями без категорії й повернуться в статистику.
          {legs !== null && list.length === 2 && appMade.length === 1 && (
            <> «{label(appMade[0])}» — не з банку: якщо застосунок створив її для цього переказу, видали її.</>
          )}
          {legs !== null && list.length > 0 && appMade.length === list.length && (
            <> Обидві частини зроблені в застосунку — переказ можна видалити повністю.</>
          )}
        </p>

        <div className="grid gap-2 pt-1">
          {legs !== null && list.length === 2 && appMade.length === 1 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run([appMade[0].id])}
              className="w-full px-3 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-semibold transition disabled:opacity-50"
            >
              Видалити {label(appMade[0])}
            </button>
          )}
          {legs !== null && list.length > 0 && appMade.length === list.length && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(appMade.map(l => l.id))}
              className="w-full px-3 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-semibold transition disabled:opacity-50"
            >
              Видалити переказ повністю
            </button>
          )}
          <button
            type="button"
            disabled={busy || legs === null}
            onClick={() => run([])}
            className="w-full px-3 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-semibold transition disabled:opacity-50"
          >
            {busy ? 'Зберігаю…' : 'Роз’єднати — лишити обидві'}
          </button>
          <button type="button" disabled={busy} onClick={close} className="w-full px-3 py-2 rounded-xl text-white/60 hover:text-white transition">
            Ні
          </button>
        </div>
      </div>
    </BaseModal>
  )
}
