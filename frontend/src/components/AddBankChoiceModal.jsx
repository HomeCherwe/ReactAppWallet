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
  const [formOpen, setFormOpen] = useState(false)

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
            className="group text-left rounded-2xl border-2 border-orange-500/25 bg-gradient-to-br from-orange-500/10 to-white/[0.04] p-4 hover:border-orange-400 hover:shadow-md transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-orange-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <RefreshCw size={20} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">Підключити банк</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-orange-400 bg-orange-500/15 px-1.5 py-0.5 rounded">
                    Рекомендовано
                  </span>
                </div>
                <p className="text-sm text-white/70 mt-1">
                  Транзакції й баланс підтягуються автоматично. Monobank, Revolut, Wise, BNP Paribas, Monzo, 80+ банків і Binance.
                </p>
                <p className="text-xs text-white/40 mt-2 flex items-center gap-1">
                  <ShieldCheck size={13} /> Open Banking · лише читання · без доступу до пароля
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onManual}
            className="text-left rounded-2xl border-2 border-white/10 bg-surface/90 p-4 hover:border-white/20 hover:shadow-md transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/[0.06] text-white/85 flex items-center justify-center flex-shrink-0">
                <PenLine size={20} />
              </div>
              <div className="flex-1">
                <span className="font-semibold text-white">Власний рахунок</span>
                <p className="text-sm text-white/70 mt-1">
                  Готівка, скарбничка або банк без синхронізації — транзакції ви додаєте самі.
                </p>
              </div>
            </div>
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {!formOpen && (
            <button
              type="button"
              onClick={() => setStep('choice')}
              className="inline-flex items-center gap-1 text-sm text-white/55 hover:text-white w-fit"
            >
              <ArrowLeft size={15} /> Назад
            </button>
          )}
          <ConnectBankCatalog
            active={open}
            connectedIds={connectedIds}
            defaultCountry={defaultCountry}
            onConnected={onClose}
            onFormOpenChange={setFormOpen}
          />
        </div>
      )}
    </BaseModal>
  )
}
