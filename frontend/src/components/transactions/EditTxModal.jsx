import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { updateTransaction, getTransaction, getTransactionCategories } from '../../api/transactions'
import { txBus } from '../../utils/txBus'
import BaseModal from '../BaseModal'
import { listCards } from '../../api/cards'

export default function EditTxModal({ open, tx, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [cards, setCards] = useState([])
  const [categories, setCategories] = useState([])
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const categoryInputRef = useRef(null)
  const categoryDropdownRef = useRef(null)
  const [form, setForm] = useState({
    kind: 'expense',
    amount: '',
    category: '',
    cardId: '',
    note: '',
    rateToUAH: 1,
  })

  // чек/камера (за бажанням лишаємо — можна вирізати)
  const [showReceiptActions, setShowReceiptActions] = useState(false)
  const [parsing, setParsing] = useState(false)
  const fileInputRef = useRef(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [stream, setStream] = useState(null)
  const originalRef = useRef(null)

  useEffect(() => {
    if (!open || !tx) return
    ;(async () => {
      try {
        const [cardRows, freshTx, categoriesData] = await Promise.all([
          listCards(),
          getTransaction(tx.id),
          getTransactionCategories()
        ])
        setCards(cardRows || [])
        setCategories(categoriesData || [])

        const base = freshTx || tx
        const isExp = Number(base.amount) < 0
        const abs = Math.abs(Number(base.amount || 0))
        setForm({
          kind: isExp ? 'expense' : 'income',
          amount: String(abs || ''),
          category: base.category || '',
          cardId: base.card_id || '',
          note: base.note || '',
          rateToUAH: 1,
        })
        // keep original transaction for delta calculations
        originalRef.current = base
      } catch (error) {
        console.error('Failed to load transaction data:', error)
      }
    })()
  }, [open, tx?.id])

  useEffect(() => {
    if (!open) {
      setShowReceiptActions(false)
      setParsing(false)
      try { stream?.getTracks()?.forEach(t => t.stop()) } catch {}
      setStream(null)
      setCameraOpen(false)
    }
  }, [open])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showCategoryDropdown) return
    const handleClickOutside = (e) => {
      if (categoryInputRef.current && !categoryInputRef.current.contains(e.target) &&
          categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
        setShowCategoryDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showCategoryDropdown])

  const save = async (e) => {
    e?.preventDefault?.()
    const raw = Math.abs(parseFloat(form.amount || '0')) || 0
    const signed = form.kind === 'expense' ? -raw : raw
    const sel = cards.find(c => c.id === form.cardId)
    const cardLabel = sel ? `${sel.bank} ${sel.name}` : null

    setSaving(true)
    try {
      const payload = {
        amount: signed,
        category: form.category || null,
        note: form.note || null,
        card: cardLabel,
        card_id: form.cardId || null,
      }
      await updateTransaction(tx.id, payload)
      // emit delta events so other components update
      try {
        const orig = originalRef.current || tx || {}
        const oldAmount = Number(orig.amount || 0)
        const newAmount = Number(signed || 0)
        const oldCard = orig.card_id || null
        const newCard = payload.card_id || null

        if (oldCard === newCard) {
          const delta = newAmount - oldAmount
          if (newCard && delta) txBus.emit({ card_id: newCard, delta })
        } else {
          // remove effect from old card
          if (oldCard) txBus.emit({ card_id: oldCard, delta: -oldAmount })
          // apply effect to new card
          if (newCard) txBus.emit({ card_id: newCard, delta: newAmount })
        }
      } catch (e) {
        console.error('emit tx update event failed', e)
      }

      onSaved?.({ ...tx, ...payload })
      onClose()
    } catch (e) {
      console.error('Update tx error:', e)
      alert('Не вдалося зберегти зміни')
    } finally {
      setSaving(false)
    }
  }

  if (!open || !tx) return null

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title="Редагування транзакції"
      zIndex={110}
      maxWidth="md"
    >
      <form onSubmit={save} className="grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                <button type="button"
                  className={`px-3 py-2 rounded-xl border ${form.kind==='expense' ? 'bg-black text-white' : 'bg-white'}`}
                  onClick={()=>setForm(f=>({...f, kind:'expense'}))}
                >Витрата</button>
                <button type="button"
                  className={`px-3 py-2 rounded-xl border ${form.kind==='income' ? 'bg-black text-white' : 'bg-white'}`}
                  onClick={()=>setForm(f=>({...f, kind:'income'}))}
                >Дохід</button>
              </div>

              <input type="number" step="0.01" min="0" className="border rounded-xl px-3 py-2"
                placeholder="Сума" value={form.amount}
                onChange={e=>setForm({...form, amount: e.target.value})} required />

              <div className="relative" ref={categoryInputRef}>
                <input className="border rounded-xl px-3 py-2 w-full"
                  placeholder="Категорія"
                  value={form.category}
                  onChange={e=>setForm({...form, category: e.target.value})}
                  onFocus={()=>setShowCategoryDropdown(true)} />
                
                <AnimatePresence>
                  {showCategoryDropdown && categories.length > 0 && (() => {
                    const filteredCategories = form.category.trim() 
                      ? categories.filter(cat => cat.toLowerCase().includes(form.category.toLowerCase()))
                      : categories
                    
                    return filteredCategories.length > 0 && (
                      <motion.div
                        ref={categoryDropdownRef}
                        className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded-xl max-h-48 overflow-y-auto"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        {filteredCategories.map((cat, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl"
                            onClick={() => {
                              setForm({...form, category: cat})
                              setShowCategoryDropdown(false)
                            }}
                          >
                            {cat}
                          </button>
                        ))}
                      </motion.div>
                    )
                  })()}
                </AnimatePresence>
              </div>

              <select className="border rounded-xl px-3 py-2"
                value={form.cardId}
                onChange={e=>setForm({...form, cardId: e.target.value})}>
                <option value="">— Без карти —</option>
                {cards.map(c=>(
                  <option key={c.id} value={c.id}>{c.bank} — {c.name}</option>
                ))}
              </select>

              <textarea className="border rounded-xl px-3 py-2 min-h-[90px]"
                placeholder="Нотатки"
                value={form.note}
                onChange={e=>setForm({...form, note: e.target.value})} />

              <div className="mt-2 flex gap-2">
                <button className="btn btn-primary flex-1" type="submit" disabled={saving || parsing}>
                  {saving ? 'Збереження…' : 'Зберегти'}
                </button>
                <button type="button" className="btn btn-soft" onClick={onClose}>Скасувати</button>
              </div>
            </form>
    </BaseModal>
  )
}
