import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import BaseModal from '../BaseModal'
import { createCard } from '../../api/cards'
import { createBank, listBanks } from '../../api/banks'
import { SUPPORTED_CURRENCIES, usePrimaryCurrency } from '../../utils/primaryCurrency'

// Cash is a bank named "Готівка" (it lands in the cash group by that name), as on the iPhone
const CASH_BANK_NAME = 'Готівка'
const NEW_BANK = '__new__'
const CASH = '__cash__'

const pill = (active) =>
  `shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-semibold border transition-colors ${
    active ? 'bg-brand/15 border-brand/60 text-orange-200' : 'bg-white/[0.05] border-white/10 text-white/80 hover:bg-white/[0.08]'
  }`
const label = 'block text-xs font-bold uppercase tracking-[0.05em] text-white/55 mb-2 px-1'
const input = 'w-full px-3.5 py-2.5 rounded-xl border border-white/[0.14] focus:ring-2 focus:ring-brand focus:border-brand outline-none transition'

/** "Власний рахунок": an account you keep up to date yourself (iPhone AddCardModal) */
export default function OwnAccountModal({ open, onClose, onCreated }) {
  const primary = usePrimaryCurrency()
  const [banks, setBanks] = useState(null)
  const [selectedBank, setSelectedBank] = useState(NEW_BANK)
  const [newBankName, setNewBankName] = useState('')
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState(primary)
  const [initialBalance, setInitialBalance] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setCurrency(primary)
    listBanks()
      .then(list => {
        const own = (list || []).filter(b => b.name !== CASH_BANK_NAME)
        setBanks(own)
        setSelectedBank(own[0]?.id ?? NEW_BANK)
      })
      .catch(() => setBanks([]))
  }, [open, primary])

  // Bank for the new card: an existing one, the cash bank, or one created now
  const resolveBankId = async () => {
    if (selectedBank === NEW_BANK) return (await createBank({ name: newBankName.trim() })).id
    if (selectedBank === CASH) {
      const cash = (await listBanks()).find(b => b.name === CASH_BANK_NAME)
      return cash ? cash.id : (await createBank({ name: CASH_BANK_NAME })).id
    }
    return selectedBank
  }

  const save = async (e) => {
    e.preventDefault()
    if (selectedBank === NEW_BANK && !newBankName.trim()) return setError('Вкажіть назву банку')
    if (!name.trim()) return setError('Вкажіть назву картки або рахунку')
    setError('')
    setBusy(true)
    try {
      const bankId = await resolveBankId()
      await createCard({
        bank_id: bankId,
        name: name.trim(),
        currency,
        initial_balance: parseFloat(initialBalance.replace(',', '.')) || 0,
        card_number: cardNumber.trim() || undefined,
      })
      toast.success('Рахунок створено')
      setName('')
      setNewBankName('')
      setInitialBalance('')
      setCardNumber('')
      onCreated?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Помилка при створенні картки')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BaseModal open={open} onClose={onClose} title="Власний рахунок" maxWidth="md" zIndex={100}>
      <form onSubmit={save} className="grid gap-5">
        <div>
          <span className={label}>Банк</span>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(banks || []).map(b => (
              <button key={b.id} type="button" onClick={() => setSelectedBank(b.id)} className={pill(selectedBank === b.id)}>
                🏦 {b.name}
              </button>
            ))}
            <button type="button" onClick={() => setSelectedBank(CASH)} className={pill(selectedBank === CASH)}>
              💵 Готівка
            </button>
            <button type="button" onClick={() => setSelectedBank(NEW_BANK)} className={`${pill(selectedBank === NEW_BANK)} border-dashed`}>
              ＋ Новий банк
            </button>
          </div>
          {selectedBank === NEW_BANK && (
            <input
              className={`${input} mt-2.5`}
              placeholder="Назва банку, напр. ПриватБанк, Скарбничка…"
              value={newBankName}
              onChange={e => setNewBankName(e.target.value)}
            />
          )}
        </div>

        <div>
          <span className={label}>Назва картки</span>
          <input className={input} placeholder="напр. Monobank Black, Зарплатна..." value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div>
          <span className={label}>Валюта</span>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_CURRENCIES.map(c => (
              <button key={c.code} type="button" onClick={() => setCurrency(c.code)} className={pill(currency === c.code)}>
                <span className="opacity-70">{c.symbol}</span> {c.code}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>Початковий баланс</span>
            <input className={input} inputMode="decimal" placeholder="0.00" value={initialBalance} onChange={e => setInitialBalance(e.target.value)} />
          </div>
          <div>
            <span className={label}>Останні 4 цифри</span>
            <input
              className={input}
              inputMode="numeric"
              maxLength={4}
              placeholder="1234 (не обов'язково)"
              value={cardNumber}
              onChange={e => setCardNumber(e.target.value.replace(/\D/g, ''))}
            />
          </div>
        </div>

        {error && <div className="text-sm font-semibold text-[#FF6B6B] -mt-2">{error}</div>}

        <button type="submit" disabled={busy} className="btn-primary h-12 rounded-2xl font-bold disabled:opacity-60">
          {busy ? 'Збереження...' : 'Створити рахунок'}
        </button>
      </form>
    </BaseModal>
  )
}
