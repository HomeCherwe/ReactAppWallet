import { Archive, Trash2, X } from 'lucide-react'
import BaseModal from '../BaseModal'

export default function DeleteTxModal({ open, transaction, transactions, onDelete, onArchive, onCancel }) {
  // Підтримка як однієї транзакції, так і масиву транзакцій
  const isBulk = Array.isArray(transactions) && transactions.length > 0
  const count = isBulk ? transactions.length : (transaction ? 1 : 0)
  
  if (!transaction && !isBulk) return null

  // Розрахувати загальну суму для масового видалення
  const totalAmount = isBulk 
    ? transactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0)
    : Number(transaction?.amount || 0)

  return (
    <BaseModal
      open={open}
      onClose={onCancel}
      title={
        <div className="flex items-center gap-2 text-lg">
          <Trash2 className="text-rose-600" size={20} />
          <span>{isBulk ? `Видалити ${count} транзакцій?` : 'Видалити транзакцію?'}</span>
        </div>
      }
      zIndex={110}
      maxWidth="sm"
    >
      {/* Body */}
      <div className="text-sm text-gray-600 mb-5">
        {isBulk ? (
          <>
            <p className="mb-2">
              Ви справді хочете видалити <strong>{count}</strong> транзакцій?
            </p>
            {totalAmount !== 0 && (
              <p className="mb-2">
                Загальна сума: <strong>{totalAmount > 0 ? '+' : ''}{totalAmount.toFixed(2)}</strong>
              </p>
            )}
            <p className="text-xs text-gray-500 mt-3">
              Оберіть дію для цих транзакцій:
            </p>
          </>
        ) : (
          <>
            <p className="mb-2">
              Ви справді хочете видалити транзакцію на суму <strong>{transaction.amount}</strong>?
            </p>
            <p className="text-xs text-gray-500">
              Оберіть дію для цієї транзакції:
            </p>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          className="flex items-center justify-center gap-2 rounded-xl py-2.5 font-medium text-sm bg-rose-600 text-white hover:bg-rose-700 transition-colors"
          onClick={onDelete}
        >
          <Trash2 size={16} />
          {isBulk ? 'Видалити назавжди' : 'Видалити назавжди'}
        </button>
        {onArchive && (
          <button
            className="flex items-center justify-center gap-2 rounded-xl py-2.5 font-medium text-sm bg-gray-700 text-white hover:bg-gray-800 transition-colors"
            onClick={onArchive}
          >
            <Archive size={16} />
            {isBulk ? 'Заархівувати всі' : 'В архів'}
          </button>
        )}
        <button
          className="rounded-xl border border-gray-300 py-2.5 text-sm hover:bg-gray-100 transition-colors"
          onClick={onCancel}
        >
          Скасувати
        </button>
      </div>
    </BaseModal>
  )
}

