import { fmtDate, fmtAmount } from '../../utils/format'
import { Trash2, Info, MapPin, RotateCcw } from 'lucide-react'

export default function Row({
  tx,
  currency,
  onDetails,
  onAskDelete,
  onEdit,
  onRefund,
  selected,
  onSelect,
  amountOverride,
}) {
  const isExp = Number(tx.amount) < 0
  const bg = isExp ? 'bg-rose-500/10' : 'bg-emerald-500/10'
  const hover = isExp ? 'hover:bg-rose-500/20' : 'hover:bg-emerald-500/20'

  return (
    <div 
      className={`flex items-center justify-between p-3 rounded-xl transition ${bg} ${hover} ${selected ? 'ring-2 ring-indigo-500' : ''} ${onDetails ? 'cursor-pointer' : ''}`}
      style={{
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)'
      }}
      onClick={onDetails ? () => onDetails(tx, currency) : undefined}
    >
      <div className="flex items-center gap-3">
        {onSelect && (
          <input
            type="checkbox"
            checked={selected || false}
            onChange={(e) => {
              // onChange викликається, але shiftKey тут може бути недоступний
              // Тому використовуємо onClick для обробки Shift
            }}
            onClick={(e) => {
              e.stopPropagation()
              // Перевіряємо shiftKey - в onClick він має бути доступний
              const shiftKey = e.shiftKey || (e.nativeEvent && e.nativeEvent.shiftKey) || false
              const newChecked = !selected
              // Створюємо синтетичний event з shiftKey
              const syntheticEvent = { shiftKey }
              onSelect(tx.id, newChecked, syntheticEvent)
            }}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
          />
        )}
        <div>
          <div className="font-semibold text-sm flex items-center gap-2">
            {tx.category || 'Без категорії'}
            {tx?.merchant_lat && tx?.merchant_lng && (
              <MapPin size={12} className="text-indigo-600" title="Є локація на карті" />
            )}
          </div>
          <div className="text-xs text-gray-500">
            {[tx.card].filter(Boolean).join(' · ') || '—'} · {fmtDate(tx.created_at)}
            {tx?.merchant_name && (
              <span className="ml-2 text-indigo-600">
                · {tx.merchant_name}
                {tx?.merchant_lat && tx?.merchant_lng && (
                  <a
                    href={`https://www.google.com/maps?q=${tx.merchant_lat},${tx.merchant_lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="ml-1 inline-flex items-center text-indigo-600 hover:text-indigo-700 hover:underline"
                    title="Відкрити на карті"
                  >
                    <MapPin size={10} />
                  </a>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {amountOverride ? (
          <div className="flex flex-col items-end leading-tight">
            <div className={`font-semibold text-sm ${Number(amountOverride.primaryAmount) < 0 ? '' : 'text-emerald-600'}`}>
              {fmtAmount(amountOverride.primaryAmount, amountOverride.currency || currency)}
            </div>
            {amountOverride.secondaryAmount != null && (
              <div className="text-[11px] text-gray-500">
                {fmtAmount(amountOverride.secondaryAmount, amountOverride.currency || currency)}
              </div>
            )}
          </div>
        ) : (
          <div className={`font-semibold text-sm ${isExp ? '' : 'text-emerald-600'}`}>
            {fmtAmount(tx.amount, currency)}
          </div>
        )}

        {onRefund && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRefund(tx)
            }}
            className="h-9 w-9 sm:h-7 sm:w-7 rounded-full bg-indigo-500/10 hover:bg-indigo-500/20 grid place-items-center text-indigo-600"
            title="Повернення"
          >
            <RotateCcw size={14} />
          </button>
        )}

        {onAskDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAskDelete(tx)
            }}
            className="h-9 w-9 sm:h-7 sm:w-7 rounded-full bg-rose-500/10 hover:bg-rose-500/20 grid place-items-center text-rose-600"
            title="Видалити"
          >
            <Trash2 size={14} />
          </button>
        )}

        {onDetails && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDetails(tx, currency)
            }}
            className="h-9 w-9 sm:h-7 sm:w-7 rounded-full bg-gray-200/70 hover:bg-gray-300 grid place-items-center text-gray-700"
            title="Деталі"
          >
            <Info size={14} />
          </button>
        )}

        {onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit(tx)
            }}
            className="h-9 w-9 sm:h-7 sm:w-7 rounded-full bg-amber-500/10 hover:bg-amber-500/20 grid place-items-center text-amber-600"
            title="Редагувати"
          >
            ✏️
          </button>
        )}
      </div>
    </div>
  )
}
