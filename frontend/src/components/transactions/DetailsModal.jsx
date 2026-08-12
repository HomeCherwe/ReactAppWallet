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
                <span className="text-gray-500">Тип</span>
                <span className={Number(tx?.amount) < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                  {Number(tx?.amount) < 0 ? 'Витрата' : 'Дохід'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Сума</span>
                <span className={Number(tx?.amount) < 0 ? '' : 'text-emerald-600'}>
                  {fmtAmount(tx?.amount, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Категорія</span>
                <span>{tx?.category || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Карта</span>
                <span>{tx?.card || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Дата</span>
                <span>{fmtDate(tx?.created_at)}</span>
              </div>
              
              <div>
                <div className="text-gray-500 mb-1">Нотатки</div>
                <div className="rounded-xl border p-3 bg-gray-50 min-h-[50px] whitespace-pre-line">
                  {tx?.note || '—'}
                </div>
              </div>

              {onEdit && tx?.id && (
                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(tx)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition"
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
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium border border-purple-200 transition"
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
