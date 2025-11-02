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
          <AlertTriangle className={danger ? 'text-rose-600' : 'text-yellow-500'} size={20} />
          {title || 'Підтвердження'}
        </div>
      }
      zIndex={110}
      maxWidth="sm"
    >
      {/* Body */}
      <div className="text-sm text-gray-600 mb-5">{message || 'Ви впевнені?'}</div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            className={`flex-1 rounded-xl py-2 font-medium text-sm ${
              danger
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : 'bg-black text-white hover:bg-gray-800'
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button
            className="flex-1 rounded-xl border border-gray-300 py-2 text-sm hover:bg-gray-100"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
        </div>
    </BaseModal>
  )
}
