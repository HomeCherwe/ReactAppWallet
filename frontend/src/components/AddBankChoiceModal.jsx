import { useEffect, useState } from 'react'
import { ArrowLeft, PenLine, RefreshCw, ShieldCheck } from 'lucide-react'
import BaseModal from './BaseModal'
import { ConnectBankCatalog } from './BankConnections'
import { listBankConnections } from '../api/bankConnections'

/**
 * "Додати банк" on the cards page: connect a real bank with automatic sync (TrueLayer),
 * or add your own account that you keep up to date manually.
 */
export default function AddBankChoiceModal({ open, onClose, onManual }) {
  const [step, setStep] = useState('choice')
  const [connectedIds, setConnectedIds] = useState([])
  const [defaultCountry, setDefaultCountry] = useState('fr')

  useEffect(() => {
    if (!open) return
    setStep('choice')
    // Mark banks that are already connected; start the catalog on the user's country
    listBankConnections()
      .then(list => {
        setConnectedIds(list.filter(c => c.status === 'active').map(c => c.provider_id))
        if (list[0]?.country) setDefaultCountry(list[0].country)
      })
      .catch(() => {})
  }, [open])

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={step === 'choice' ? 'Додати банк' : 'Підключити банк'}
      maxWidth="lg"
      zIndex={100}
    >
      {step === 'choice' ? (
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => setStep('connect')}
            className="group text-left rounded-2xl border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 hover:border-orange-400 hover:shadow-md transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-orange-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <RefreshCw size={20} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">Підключити банк</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
                    Рекомендовано
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Транзакції й баланс підтягуються автоматично. Monobank, Revolut, Wise, BNP Paribas, Monzo та ще 80+ банків.
                </p>
                <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                  <ShieldCheck size={13} /> Open Banking · лише читання · без доступу до пароля
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onManual}
            className="text-left rounded-2xl border-2 border-gray-200 bg-white p-4 hover:border-gray-400 hover:shadow-md transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center flex-shrink-0">
                <PenLine size={20} />
              </div>
              <div className="flex-1">
                <span className="font-semibold text-gray-900">Власний рахунок</span>
                <p className="text-sm text-gray-600 mt-1">
                  Готівка, скарбничка або банк без синхронізації — транзакції ви додаєте самі.
                </p>
              </div>
            </div>
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => setStep('choice')}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 w-fit"
          >
            <ArrowLeft size={15} /> Назад
          </button>
          <ConnectBankCatalog
            active={open}
            connectedIds={connectedIds}
            defaultCountry={defaultCountry}
            onConnected={onClose}
          />
        </div>
      )}
    </BaseModal>
  )
}
