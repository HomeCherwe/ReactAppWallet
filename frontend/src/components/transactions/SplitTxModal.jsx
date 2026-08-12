import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import BaseModal from '../BaseModal'
import { listCards } from '../../api/cards'
import { getTransactionCategories, createTransaction, updateTransaction, listTransactions } from '../../api/transactions'
import { txBus } from '../../utils/txBus'
import { fmtAmount, fmtDate } from '../../utils/format'
import { useSettingsStore } from '../../store/useSettingsStore'
import toast from 'react-hot-toast'
import { Plus, Trash2, Check, ArrowRight, RefreshCw, ChevronDown, Split, Sparkles, Search } from 'lucide-react'

const DEFAULT_CATEGORIES = [
  'Продукти', 'Транспорт', 'Шопінг', "Здоров'я", 'Розваги',
  'Комунальні', 'Кафе', 'Підписки', 'Борг', 'Інше'
]

export default function SplitTxModal({ open, tx, currency = 'UAH', onClose, onSplitComplete }) {
  const [step, setStep] = useState('build') // 'build' | 'review'
  const [cards, setCards] = useState([])
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [saving, setSaving] = useState(false)

  // Split parts
  // Each part: { id, amount: number, category: string, cardId: string, note: string, isExisting: boolean, existingTxId?: string }
  const [parts, setParts] = useState([])

  // Selection of existing transactions to attach
  const [showExistingSelector, setShowExistingSelector] = useState(false)
  const [existingTxs, setExistingTxs] = useState([])
  const [loadingExisting, setLoadingExisting] = useState(false)

  // State for Review step selection
  const [selectedPartIds, setSelectedPartIds] = useState(new Set())
  const [selectedExistingIds, setSelectedExistingIds] = useState(new Set())

  // Settings hook
  const settings = useSettingsStore((state) => state.settings)
  const showUsdt = settings?.transactionsFilters?.showUsdt ?? true

  // Load cards & categories
  useEffect(() => {
    if (!open || !tx) return
    setStep('build')
    setParts([])
    setShowExistingSelector(false)
    setSelectedExistingIds(new Set())
    
    ;(async () => {
      try {
        const [c, cats] = await Promise.all([listCards(), getTransactionCategories()])
        setCards(c || [])
        if (cats && cats.length > 0) {
          setCategories([...new Set([...DEFAULT_CATEGORIES, ...cats])])
        }
      } catch (e) {
        console.error('Failed to fetch modal metadata:', e)
      }
    })()
  }, [open, tx])

  if (!open || !tx) return null

  const isExp = Number(tx.amount) < 0
  const totalOriginalAbs = Math.abs(Number(tx.amount) || 0)
  
  // Calculate sum of split parts
  const partsSumAbs = parts.reduce((acc, p) => acc + (Math.abs(Number(p.amount)) || 0), 0)
  const remainingAbs = Math.max(0, totalOriginalAbs - partsSumAbs)

  // Add manual part
  const addManualPart = (defaultAmount = '') => {
    const amountVal = defaultAmount !== '' ? defaultAmount : (remainingAbs > 0 ? remainingAbs.toString() : '')
    const baseNote = (tx.note || '').trim()
    const origAmountFormatted = fmtAmount(tx.amount, currency)
    const initialPartNote = baseNote 
      ? `${baseNote} (Розділено з основної суми ${origAmountFormatted})` 
      : `Розділено з основної суми ${origAmountFormatted}`

    setParts(prev => [
      ...prev,
      {
        id: 'part_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        amount: amountVal,
        category: tx.category || categories[0] || 'Інше',
        cardId: tx.card_id || (cards[0]?.id || ''),
        note: initialPartNote,
        isExisting: false
      }
    ])
  }

  // Load recent transactions for attaching
  const loadExistingTransactions = async () => {
    setLoadingExisting(true)
    setShowExistingSelector(true)
    try {
      const res = await listTransactions({ from: 0, to: 30, excludeUsdt: !showUsdt })
      // Exclude main current transaction and already selected existing ones
      const attachedIds = new Set(parts.filter(p => p.isExisting).map(p => p.existingTxId))
      const filtered = (res || []).filter(item => item.id !== tx.id && !attachedIds.has(item.id))
      setExistingTxs(filtered)
    } catch (e) {
      toast.error('Не вдалося завантажити транзакції')
    } finally {
      setLoadingExisting(false)
    }
  }

  // Selection for multi-attach existing txs
  const toggleSelectExisting = (id) => {
    setSelectedExistingIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const attachSelectedExistingTxs = () => {
    if (selectedExistingIds.size === 0) return

    const toAttach = existingTxs.filter(txItem => selectedExistingIds.has(txItem.id))
    const newParts = toAttach.map(extTx => ({
      id: 'part_ext_' + extTx.id,
      amount: Math.abs(Number(extTx.amount)).toString(),
      category: tx.category || extTx.category || 'Інше',
      cardId: extTx.card_id || '',
      note: extTx.note || `Існуюча транзакція (${extTx.category})`,
      isExisting: true,
      existingTxId: extTx.id
    }))

    setParts(prev => [...prev, ...newParts])
    setSelectedExistingIds(new Set())
    setShowExistingSelector(false)
  }

  const removePart = (id) => {
    setParts(prev => prev.filter(p => p.id !== id))
  }

  const updatePart = (id, field, value) => {
    setParts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  const handleGoToReview = () => {
    if (parts.length === 0) {
      toast.error('Додайте хоча б одну частину для розділення')
      return
    }
    const invalid = parts.find(p => !p.amount || isNaN(Number(p.amount)) || Number(p.amount) <= 0)
    if (invalid) {
      toast.error('Вкажіть коректні суми для всіх частин')
      return
    }
    if (partsSumAbs > totalOriginalAbs) {
      toast.error(`Сума частин (${partsSumAbs}) не може перевищувати основну суму (${totalOriginalAbs})`)
      return
    }
    // Select all parts by default for review
    setSelectedPartIds(new Set(parts.map(p => p.id)))
    setStep('review')
  }

  const toggleSelectPart = (id) => {
    setSelectedPartIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirmSplit = async () => {
    const activeParts = parts.filter(p => selectedPartIds.has(p.id))
    if (activeParts.length === 0) {
      toast.error('Оберіть хоча б одну частину для підтвердження')
      return
    }

    setSaving(true)
    try {
      const activeSumAbs = activeParts.reduce((acc, p) => acc + Math.abs(Number(p.amount)), 0)
      const lastPartAbs = Math.abs(Number(activeParts[activeParts.length - 1].amount))
      
      let newMainAbs = totalOriginalAbs - activeSumAbs
      // Логіка: Якщо виходить 0 (або < 0.01), то на основній транзі робимо суму останнього розділу
      if (newMainAbs <= 0.001) {
        newMainAbs = lastPartAbs
      }

      const signedMainAmount = isExp ? -newMainAbs : newMainAbs

      // 1. Оновлюємо основну транзакцію — лише суму та нотатку, решта лишається
      await updateTransaction(tx.id, {
        amount: signedMainAmount,
        category: tx.category,
        note: (tx.note ? tx.note + '\n' : '') + `[Розділено на ${activeParts.length} ч.]`,
        card: tx.card,
        card_id: tx.card_id,
        created_at: tx.created_at,
        exclude_from_stats: tx.exclude_from_stats,
        is_debt: tx.is_debt,
      })

      // 2. Створюємо нові транзакції для ВСІХ підтверджених частин
      const origAmountFormatted = fmtAmount(tx.amount, currency)
      const baseNote = (tx.note || '').trim()
      const fallbackNote = baseNote 
        ? `${baseNote} (Розділено з основної суми ${origAmountFormatted})` 
        : `Розділено з основної суми ${origAmountFormatted}`

      for (const part of activeParts) {
        // Знак нової транзакції = знаку основної
        const partSignedAmount = isExp ? -Math.abs(Number(part.amount)) : Math.abs(Number(part.amount))
        
        await createTransaction({
          amount: partSignedAmount,
          category: part.category || tx.category,
          card: tx.card,         // Назва карти з основної транзакції
          card_id: tx.card_id,   // ID карти з основної транзакції
          note: part.note || fallbackNote,
          created_at: tx.created_at || new Date().toISOString(), // Час/дата основної транзакції
        })
      }

      txBus.emit('tx-updated')
      toast.success('Транзакцію успішно розділено!')
      onSplitComplete?.()
      onClose()
    } catch (e) {
      console.error('Split error:', e)
      toast.error(e?.message || 'Помилка при розділенні транзакції')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={step === 'build' ? 'Розділити транзакцію' : 'Підтвердження розділення'}
      maxWidth="lg"
      zIndex={115}
    >
      <div className="space-y-4 text-sm">
        {/* Main transaction summary header */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-50/80 via-purple-50/50 to-pink-50/40 border border-indigo-100 flex items-center justify-between shadow-xs">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600/80">Основна транзакція</div>
            <div className="font-semibold text-gray-900 text-base">{tx.category || 'Без категорії'}</div>
            <div className="text-xs text-gray-500">{tx.card || 'Карта'} · {fmtDate(tx.created_at)}</div>
          </div>
          <div className="text-right">
            <div className={`text-lg font-bold ${isExp ? 'text-gray-900' : 'text-emerald-600'}`}>
              {fmtAmount(tx.amount, currency)}
            </div>
            <div className="text-xs font-medium text-indigo-600">
              Залишок: <span className="font-bold">{fmtAmount(isExp ? -remainingAbs : remainingAbs, currency)}</span>
            </div>
          </div>
        </div>

        {/* STEP 1: BUILD SPLITS */}
        {step === 'build' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-700 text-xs uppercase tracking-wider">
                Частини розділу ({parts.length})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadExistingTransactions}
                  className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium transition flex items-center gap-1.5"
                >
                  <Search size={14} />
                  Обрати з існуючих
                </button>
                <button
                  type="button"
                  onClick={() => addManualPart()}
                  className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition flex items-center gap-1.5 shadow-xs"
                >
                  <Plus size={14} />
                  Додати суму
                </button>
              </div>
            </div>

            {/* List of active split parts */}
            {parts.length === 0 ? (
              <div className="py-8 text-center border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                <Split className="mx-auto text-indigo-400 mb-2 opacity-60" size={32} />
                <p className="text-gray-600 font-medium">Ще немає доданих частин</p>
                <p className="text-xs text-gray-400 max-w-xs mx-auto mt-1">
                  Натисніть "Додати суму" або залучіть існуючі транзакції для розподілу.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {parts.map((p, idx) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-3 rounded-xl border transition ${
                      p.isExisting ? 'bg-amber-50/40 border-amber-200' : 'bg-white border-gray-200 hover:border-indigo-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 grid place-items-center text-[10px]">
                          {idx + 1}
                        </span>
                        {p.isExisting ? 'Існуюча транзакція' : 'Нова частина'}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePart(p.id)}
                        className="p-1 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-[11px] text-gray-400 block mb-0.5">Сума ({currency})</label>
                        <input
                          type="number"
                          step="any"
                          disabled={p.isExisting}
                          value={p.amount}
                          onChange={(e) => updatePart(p.id, 'amount', e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-sm disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-gray-400 block mb-0.5">Категорія</label>
                        <select
                          disabled={p.isExisting}
                          value={p.category}
                          onChange={(e) => updatePart(p.id, 'category', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs disabled:bg-gray-100"
                        >
                          {categories.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] text-gray-400 block mb-0.5">Нотатка</label>
                        <input
                          type="text"
                          value={p.note}
                          onChange={(e) => updatePart(p.id, 'note', e.target.value)}
                          placeholder="Опис розділу..."
                          className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Existing Tx Picker Overlay */}
            <AnimatePresence>
              {showExistingSelector && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="p-3.5 rounded-2xl bg-slate-50 border border-indigo-100 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs uppercase tracking-wider text-indigo-900">
                      Оберіть існуючі транзакції ({selectedExistingIds.size})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowExistingSelector(false)}
                      className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition text-xs font-bold"
                    >
                      ✕
                    </button>
                  </div>

                  {loadingExisting ? (
                    <div className="py-6 text-center text-xs text-gray-500 font-medium">Завантаження транзакцій...</div>
                  ) : existingTxs.length === 0 ? (
                    <div className="py-6 text-center text-xs text-gray-500 font-medium">Немає доступних транзакцій для вибору</div>
                  ) : (
                    <>
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {existingTxs.map(eTx => {
                          const isSelected = selectedExistingIds.has(eTx.id)
                          return (
                            <div
                              key={eTx.id}
                              onClick={() => toggleSelectExisting(eTx.id)}
                              className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between text-xs transition shadow-2xs ${
                                isSelected ? 'bg-indigo-50/90 border-indigo-300 ring-1 ring-indigo-200' : 'bg-white hover:bg-indigo-50/40 border-gray-200/80'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                                <div>
                                  <div className="font-semibold text-gray-900">{eTx.category || 'Без категорії'}</div>
                                  <div className="text-[11px] text-gray-500">{fmtDate(eTx.created_at)} · {eTx.card || 'Карта'}</div>
                                </div>
                              </div>
                              <div className="font-bold text-sm text-indigo-600">
                                {fmtAmount(eTx.amount, currency)}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          disabled={selectedExistingIds.size === 0}
                          onClick={attachSelectedExistingTxs}
                          className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium transition flex items-center gap-1.5 shadow-xs"
                        >
                          <Plus size={14} />
                          Додати обрані ({selectedExistingIds.size})
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleGoToReview}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium flex items-center gap-1.5 shadow-md"
              >
                Перегляд і підтвердження
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: REVIEW AND CONFIRM */}
        {step === 'review' && (() => {
          const selectedSumAbs = parts
            .filter(p => selectedPartIds.has(p.id))
            .reduce((acc, p) => acc + Math.abs(Number(p.amount)), 0)
          const lastSelectedAbs = parts.filter(p => selectedPartIds.has(p.id)).slice(-1)[0]
            ? Math.abs(Number(parts.filter(p => selectedPartIds.has(p.id)).slice(-1)[0].amount))
            : 0
          let reviewMainAbs = totalOriginalAbs - selectedSumAbs
          if (reviewMainAbs <= 0.001 && lastSelectedAbs > 0) reviewMainAbs = lastSelectedAbs
          const reviewMainSigned = isExp ? -reviewMainAbs : reviewMainAbs

          return (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-indigo-900">
              ⚡ Перевірте деталі розділу перед збереженням. Оберіть прапорцями частини, які потрібно створити.
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {parts.map((p) => {
                const isSelected = selectedPartIds.has(p.id)
                return (
                  <div
                    key={p.id}
                    onClick={() => toggleSelectPart(p.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                      isSelected ? 'bg-indigo-50/40 border-indigo-300 ring-1 ring-indigo-300' : 'bg-gray-50 border-gray-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <div className="font-semibold text-gray-900 text-sm">{p.category}</div>
                        <div className="text-xs text-gray-500">{tx.card || 'Карта'} · {p.note || 'Без нотатки'}</div>
                      </div>
                    </div>
                    <div className="text-right font-bold text-sm text-gray-900">
                      {fmtAmount(isExp ? -Math.abs(Number(p.amount)) : Math.abs(Number(p.amount)), currency)}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Залишок на основній транзакції */}
            <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 flex items-center justify-between text-xs">
              <div>
                <div className="font-semibold text-amber-900">Основна транзакція після розділу</div>
                <div className="text-amber-700/80">{tx.category} · {tx.card || 'Карта'}</div>
              </div>
              <div className={`font-bold text-base ${isExp ? 'text-amber-800' : 'text-emerald-700'}`}>
                {fmtAmount(reviewMainSigned, currency)}
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep('build')}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-xs"
              >
                ← Назад до редагування
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmSplit}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center gap-2 shadow-md disabled:opacity-50"
              >
                {saving ? 'Збереження...' : 'Підтвердити та розділити'}
                <Check size={16} />
              </button>
            </div>
          </div>
          )
        })()}
      </div>
    </BaseModal>
  )
}
