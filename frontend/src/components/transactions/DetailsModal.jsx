import { fmtDate, fmtAmount } from '../../utils/format'
import { Pencil } from 'lucide-react'
import BaseModal from '../BaseModal'

export default function DetailsModal({ open, tx, currency, onClose, onEdit, onSplit }) {
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
                <span className={Number(tx?.amount) < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                  {Number(tx?.amount) < 0 ? 'Витрата' : 'Дохід'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/55">Сума</span>
                <span className={Number(tx?.amount) < 0 ? '' : 'text-emerald-400'}>
                  {fmtAmount(tx?.amount, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/55">Категорія</span>
                <span>{tx?.category || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/55">Карта</span>
                <span>{tx?.card || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/55">Дата</span>
                <span>{fmtDate(tx?.created_at)}</span>
              </div>
              
              <div>
                <div className="text-white/55 mb-1">Нотатки</div>
                <div className="rounded-xl border p-3 bg-white/[0.03] min-h-[50px] whitespace-pre-line">
                  {tx?.note || '—'}
                </div>
              </div>

              {onEdit && tx?.id && (
                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(tx)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition"
                  >
                    <Pencil size={16} />
                    Редагувати
                  </button>
                  {onSplit && (
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
                </div>
              )}
            </div>
    </BaseModal>
  )
}
