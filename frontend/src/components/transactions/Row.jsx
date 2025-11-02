import { fmtDate, fmtAmount } from '../../utils/format'
import { Trash2, Info } from 'lucide-react'

export default function Row({ tx, currency, onDetails, onAskDelete, onEdit }) {
  const isExp = Number(tx.amount) < 0
  const bg = isExp ? 'bg-rose-500/10' : 'bg-emerald-500/10'
  const hover = isExp ? 'hover:bg-rose-500/20' : 'hover:bg-emerald-500/20'

  return (
    <div 
      className={`flex items-center justify-between p-3 rounded-xl transition ${bg} ${hover}`}
      style={{
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)'
      }}
    >
      <div className="flex items-center gap-3">
        <div>
          <div className="font-semibold text-sm">{tx.category || 'Без категорії'}</div>
          <div className="text-xs text-gray-500">
            {[tx.card].filter(Boolean).join(' · ') || '—'} · {fmtDate(tx.created_at)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className={`font-semibold text-sm ${isExp ? '' : 'text-emerald-600'}`}>
          {fmtAmount(tx.amount, currency)}
        </div>

        <button
          onClick={() => onAskDelete(tx)}
          className="h-9 w-9 sm:h-7 sm:w-7 rounded-full bg-rose-500/10 hover:bg-rose-500/20 grid place-items-center text-rose-600"
          title="Видалити"
        >
          <Trash2 size={14} />
        </button>

        <button
          onClick={() => onDetails(tx, currency)}
          className="h-9 w-9 sm:h-7 sm:w-7 rounded-full bg-gray-200/70 hover:bg-gray-300 grid place-items-center text-gray-700"
          title="Деталі"
        >
          <Info size={14} />
        </button>

        <button
          onClick={() => onEdit(tx)}
          className="h-9 w-9 sm:h-7 sm:w-7 rounded-full bg-amber-500/10 hover:bg-amber-500/20 grid place-items-center text-amber-600"
          title="Редагувати"
        >
          ✏️
        </button>
      </div>
    </div>
  )
}
