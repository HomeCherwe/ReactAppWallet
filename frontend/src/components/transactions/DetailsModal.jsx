import { fmtDate, fmtAmount } from '../../utils/format'
import BaseModal from '../BaseModal'
import { MapPin, ExternalLink } from 'lucide-react'

export default function DetailsModal({ open, tx, currency, onClose }) {
  // Діагностика: логуємо дані транзакції
  if (open && tx) {
    console.log('Transaction data:', {
      merchant_name: tx.merchant_name,
      merchant_address: tx.merchant_address,
      merchant_lat: tx.merchant_lat,
      merchant_lng: tx.merchant_lng
    })
  }

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
              
              {/* Локація мерчанта */}
              {(tx?.merchant_name || tx?.merchant_address || (tx?.merchant_lat && tx?.merchant_lng)) && (
                <div>
                  <div className="text-gray-500 mb-2">Місце покупки</div>
                  <div className="rounded-xl border p-3 bg-gray-50 space-y-2">
                    {tx?.merchant_name && (
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-indigo-600 flex-shrink-0" />
                        <span className="font-medium">{tx.merchant_name}</span>
                      </div>
                    )}
                    {tx?.merchant_address && (
                      <div className={`text-sm text-gray-600 ${tx?.merchant_name ? 'ml-6' : ''}`}>
                        {tx.merchant_address}
                      </div>
                    )}
                    {tx?.merchant_lat && tx?.merchant_lng && (
                      <a
                        href={`https://www.google.com/maps?q=${tx.merchant_lat},${tx.merchant_lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors"
                      >
                        <MapPin size={14} />
                        <span>Відкрити на карті</span>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>
              )}
              
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
