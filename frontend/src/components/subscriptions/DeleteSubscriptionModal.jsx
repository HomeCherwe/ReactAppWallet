import { Trash2 } from 'lucide-react'
import BaseModal from '../BaseModal'

export default function DeleteSubscriptionModal({ open, subscription, onDelete, onCancel }) {
  if (!subscription) return null

  return (
    <BaseModal
      open={open}
      onClose={onCancel}
      title={
        <div className="flex items-center gap-2 text-lg">
          <Trash2 className="text-rose-400" size={20} />
          <span>Видалити підписку?</span>
        </div>
      }
      zIndex={110}
      maxWidth="sm"
    >
      {/* Body */}
      <div className="text-sm text-white/70 mb-5">
        <p className="mb-2">
          Ви справді хочете видалити підписку <strong>{subscription.name}</strong>?
        </p>
        <p className="text-xs text-white/55">
          Ця дія незворотна. Автоматичні транзакції більше не будуть створюватись.
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          className="flex items-center justify-center gap-2 rounded-xl py-2.5 font-medium text-sm bg-rose-600 text-white hover:bg-rose-700 transition-colors"
          onClick={onDelete}
        >
          <Trash2 size={16} />
          Видалити назавжди
        </button>
        <button
          className="rounded-xl border border-white/[0.14] py-2.5 text-sm hover:bg-white/[0.06] transition-colors"
          onClick={onCancel}
        >
          Скасувати
        </button>
      </div>
    </BaseModal>
  )
}

