// components/ConfirmModal.jsx
import { AlertTriangle } from 'lucide-react'
import BaseModal from './BaseModal'

export default function ConfirmModal({ open, title, message, onConfirm, onCancel, confirmLabel = 'Підтвердити', cancelLabel = 'Скасувати', danger }) {
  return (
    <BaseModal
      open={open}
      onClose={onCancel}
      title={
        <div className="flex items-center gap-2 text-lg">
          <AlertTriangle className={danger ? 'text-rose-400' : 'text-yellow-400'} size={20} />
          {title || 'Підтвердження'}
        </div>
      }
      zIndex={110}
      maxWidth="sm"
    >
      {/* Body */}
      <div className="text-sm text-white/70 mb-5">{message || 'Ви впевнені?'}</div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            className={`flex-1 rounded-xl py-2 font-medium text-sm ${
              danger
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : 'bg-brand text-white hover:bg-surface-raised'
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button
            className="flex-1 rounded-xl border border-white/[0.14] py-2 text-sm hover:bg-white/[0.06]"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
        </div>
    </BaseModal>
  )
}
