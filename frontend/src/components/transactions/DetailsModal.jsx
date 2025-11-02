import { fmtDate, fmtAmount } from '../../utils/format'
import BaseModal from '../BaseModal'

export default function DetailsModal({ open, tx, currency, onClose }) {
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
            </div>
    </BaseModal>
  )
}
