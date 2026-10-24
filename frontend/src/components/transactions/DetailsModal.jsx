import { useEffect, useRef, useState } from 'react'
import { fmtDate, fmtAmount } from '../../utils/format'
import { ArrowLeftRight, Pencil, Sparkles } from 'lucide-react'
import { useAssistantStore } from '../../store/useAssistantStore'
import { canBeTransfer, listTransferLegs } from '../../api/transfers'
import { useCardLabeler } from '../../store/useCardsStore'
import BaseModal from '../BaseModal'

export default function DetailsModal({ open, tx, currency, onClose, onEdit, onSplit, cards = [], onMakeTransfer, onUnlinkTransfer }) {
  // A transfer: both of its legs (this one and the other account's), money out first
  const [legs, setLegs] = useState(null)
  const loadFor = useRef(null)
  const isTransfer = !!tx?.is_transfer && !!tx?.transfer_id

  useEffect(() => {
    setLegs(null)
    if (!open || !isTransfer) return
    const id = tx.transfer_id
    loadFor.current = id
    listTransferLegs([id])
      .then(list => {
        if (loadFor.current !== id) return
        setLegs([...list].sort((a, b) => (a.transfer_role === 'from' ? -1 : 0) - (b.transfer_role === 'from' ? -1 : 0)))
      })
      .catch(() => loadFor.current === id && setLegs([]))
  }, [open, tx?.id, tx?.transfer_id])

  const labelOf = useCardLabeler()
  const cardOf = l => (l?.card_id ? cards.find(c => c.id === l.card_id) : null)
  // A transfer leg without a card is cash
  const accountName = l => (l.card_id ? labelOf(l) || 'Рахунок' : 'Готівка')

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title="Деталі транзакції"
      zIndex={110}
      maxWidth="md"
    >
      <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/55">Тип</span>
                {isTransfer ? (
                  <span className="text-[#8AB4FF]">Переказ між рахунками</span>
                ) : (
                  <span className={Number(tx?.amount) < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                    {Number(tx?.amount) < 0 ? 'Витрата' : 'Дохід'}
                  </span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-white/55">Сума</span>
                <span className={Number(tx?.amount) < 0 || isTransfer ? '' : 'text-emerald-400'}>
                  {fmtAmount(tx?.amount, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/55">Категорія</span>
                <span>{tx?.category || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/55">Карта</span>
                <span>{tx ? labelOf(tx) || '—' : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/55">Дата</span>
                <span>{fmtDate(tx?.created_at)}</span>
              </div>
              {tx?.status === 'pending' && (
                <div className="flex justify-between">
                  <span className="text-white/55">Статус</span>
                  <span className="text-white/60">В обробці — банк ще не провів</span>
                </div>
              )}

              {/* A transfer between the user's accounts: both legs, money out first (like the iPhone app) */}
              {isTransfer && (
                <div className="mt-1 rounded-2xl border border-[#8AB4FF]/35 bg-[#8AB4FF]/[0.08] p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-[13px] font-extrabold text-[#8AB4FF]">
                    <ArrowLeftRight size={15} strokeWidth={2.4} />
                    Переказ між рахунками
                  </div>
                  {legs === null ? (
                    <div className="py-1.5 text-white/50">Завантаження…</div>
                  ) : (
                    legs.map((leg, i) => {
                      const legAmount = Number(leg.amount)
                      const isThis = leg.id === tx.id
                      return (
                        <div key={leg.id}>
                          {i > 0 && <div className="ml-2.5 text-white/40 leading-none py-0.5">↓</div>}
                          <div className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${isThis ? 'bg-white/10' : 'bg-white/[0.05]'}`}>
                            <span className="w-6 text-[12.5px] font-extrabold text-white/60">{legAmount < 0 ? 'З' : 'На'}</span>
                            <span className="flex-1 truncate font-bold">
                              {accountName(leg)}
                              {isThis && <span className="text-xs font-semibold text-white/40"> · ця</span>}
                            </span>
                            <span className="font-extrabold tabular-nums">
                              {legAmount < 0 ? '−' : '+'}
                              {fmtAmount(Math.abs(legAmount), leg.currency || cardOf(leg)?.currency || (isThis ? currency : undefined))}
                            </span>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div className="text-xs text-white/45">
                    {legs !== null && legs.length < 2
                      ? 'Другої частини переказу не знайдено (можливо, вона в архіві).'
                      : 'Не рахується ні витратою, ні доходом.'}
                  </div>
                  {onUnlinkTransfer && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose?.()
                        onUnlinkTransfer(tx)
                      }}
                      className="mt-1 px-3 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-[13px] font-bold text-white/80 transition"
                    >
                      Скасувати переказ
                    </button>
                  )}
                </div>
              )}

              {tx?.id && (
                <div className="ai-frame mt-1" style={{ '--ai-radius': '14px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose?.()
                      useAssistantStore.getState().show(tx)
                    }}
                    className="w-full h-11 px-4 flex items-center justify-center gap-2 font-bold text-white bg-[#24222C] hover:bg-[#2c2a36] transition-colors"
                  >
                    <Sparkles size={16} className="text-[#C77DFF]" />
                    Запитати AI про цю транзакцію
                  </button>
                </div>
              )}

              <div>
                <div className="text-white/55 mb-1">Нотатки</div>
                <div className="rounded-xl border p-3 bg-white/[0.03] min-h-[50px] whitespace-pre-line">
                  {tx?.note || '—'}
                </div>
              </div>

              {onEdit && tx?.id && (
                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(tx)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition"
                  >
                    <Pencil size={16} />
                    Редагувати
                  </button>
                  {onSplit && !isTransfer && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose?.()
                        onSplit(tx)
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand/10 hover:bg-brand/15 text-brand-light font-medium border border-brand/25 transition"
                    >
                      ✂️ Розділити
                    </button>
                  )}
                  {/* Money between your own accounts: pair it with the other side, or create that side */}
                  {onMakeTransfer && canBeTransfer(tx) && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose?.()
                        onMakeTransfer(tx)
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#8AB4FF]/10 hover:bg-[#8AB4FF]/15 text-[#8AB4FF] font-medium border border-[#8AB4FF]/30 transition"
                    >
                      <ArrowLeftRight size={15} />
                      Зробити переказом
                    </button>
                  )}
                </div>
              )}
            </div>
    </BaseModal>
  )
}
