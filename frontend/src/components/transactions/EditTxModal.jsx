import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { updateTransaction, getTransaction, getTransactionCategories } from '../../api/transactions'
import { txBus } from '../../utils/txBus'
import BaseModal from '../BaseModal'
import { listCards } from '../../api/cards'
import useMonoRates from '../../hooks/useMonoRates'
import { getApiUrl } from '../../utils.jsx'
import toast from 'react-hot-toast'

// Функція для безпечного обчислення математичних виразів
function calculateExpression(value) {
  if (!value || typeof value !== 'string') return null
  
  // Перевірка, чи містить вираз математичні операції
  const hasOperator = /[+\-*/%]/.test(value)
  if (!hasOperator) return null
  
  // Перевірка, чи рядок містить тільки дозволені символи
  // Дозволені: цифри, оператори +, -, *, /, %, пробіли, крапки, дужки
  if (!/^[\d+\-*/().%\s]+$/.test(value)) return null
  
  try {
    // Замінюємо % на /100 для відсотків (наприклад, 50% = 0.5)
    let expression = value.replace(/%/g, '/100')
    
    // Обчислюємо результат
    // Використовуємо Function constructor для безпеки (не має доступу до глобального scope)
    const result = Function('"use strict"; return (' + expression + ')')()
    
    // Перевірка на валідне число
    if (typeof result !== 'number' || !isFinite(result)) return null
    
    // Округлюємо до 2 знаків після коми
    return Math.round(result * 100) / 100
  } catch (e) {
    return null
  }
}

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
    merchantName: null,
    merchantAddress: null,
  })

  const [errors, setErrors] = useState({
    amount: '',
    category: '',
    cardId: '',
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
  const rates = useMonoRates()

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
      // Очистити помилки при закритті модалки
      setErrors({ amount: '', category: '', cardId: '' })
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

  // Функції для роботи з чеком
  async function parseReceiptViaApi(blob, cardCurrency) {
    const fd = new FormData()
    fd.append('image', blob, 'receipt.jpg')
    fd.append('cardCurrency', cardCurrency || '')
    const apiEndpoint = import.meta.env.PROD 
      ? `${getApiUrl()}/api/parse-receipt`
      : '/api/parse-receipt'
    const res = await fetch(apiEndpoint, { method: 'POST', body: fd })
    if (!res.ok) throw new Error('Парсинг чека не вдалось')
    return await res.json()
  }

  function buildNoteFromItems(items, currency, rateToUAH, merchant = null) {
    const toUAH = (amt) => Number(rateToUAH || 1) * Number(amt || 0)
    const num = (n) => Number(n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const itemsText = (items || []).map(it => {
      const qty = Number(it.qty || 1)
      const unit = Number(it.unit_price || 0)
      const totalLine = unit * qty
      const baseLine = `${it.name || 'Товар'} - ${qty}шт - ${num(unit)} ${currency} (${num(toUAH(unit))} грн)`
      if (qty === 1) {
        return baseLine
      }
      return `${baseLine} - ${num(totalLine)} ${currency} (${num(toUAH(totalLine))} грн)`
    }).join('\n')
    
    // merchant може бути string або object {name, address}
    let merchantText = ''
    if (merchant) {
      if (typeof merchant === 'object' && merchant.name) {
        merchantText = merchant.address 
          ? `${merchant.name}\n${merchant.address}`
          : merchant.name
      } else if (typeof merchant === 'string') {
        merchantText = merchant
      }
    }
    
    if (merchantText) {
      return `${merchantText.trim()}\n\n${itemsText}`
    }
    
    return itemsText
  }

  // Підрахунок кількості чеків в note (шукаємо роздільники "--- X чек ---")
  function countReceiptsInNote(note) {
    if (!note || !note.trim()) return 0
    // Шукаємо всі роздільники чеків
    const receiptSeparators = note.match(/---\s+(.+?)\s+чек\s+---/gi)
    if (receiptSeparators) {
      return receiptSeparators.length + 1 // +1 бо перший чек без роздільника
    }
    // Якщо немає роздільників, але є текст - це перший чек
    return 1
  }

  // Отримання номера наступного чека
  function getNextReceiptNumber(note) {
    const count = countReceiptsInNote(note)
    const numbers = ['', 'Другий', 'Третій', 'Четвертий', 'П\'ятий', 'Шостий', 'Сьомий', 'Восьмий', 'Дев\'ятий', 'Десятий']
    return numbers[count] || `${count}-й`
  }

  async function handleReceiptBlob(blob) {
    setParsing(true)
    try {
      const selected = cards.find(c => c.id === form.cardId)
      const cardCur = (selected?.currency || 'UAH').toUpperCase()
      const parsed = await parseReceiptViaApi(blob, cardCur)
      const billCur = (parsed.currency || cardCur || 'UAH').toUpperCase()
      const codeMap = { UAH: 980, USD: 840, EUR: 978, GBP: 826 }
      const billCode = codeMap[billCur]
      let derivedRate = 1
      if (billCur === 'UAH') derivedRate = 1
      else if (billCode && rates[`${billCode}->980`]) derivedRate = rates[`${billCode}->980`]
      
      const receiptTotal = Math.abs(Number(parsed.totalAmount || 0))
      const currentAmount = parseFloat(form.amount || '0')
      
      // Обробка merchant (може бути string або object {name, address})
      let merchantName = null
      let merchantAddress = null
      if (parsed.merchant) {
        if (typeof parsed.merchant === 'object' && parsed.merchant.name) {
          merchantName = parsed.merchant.name
          merchantAddress = parsed.merchant.address || null
        } else if (typeof parsed.merchant === 'string') {
          merchantName = parsed.merchant
        }
      }
      
      // Формуємо текст нового чека
      const receiptNote = buildNoteFromItems(parsed.items || [], billCur, derivedRate, parsed.merchant)
      const receiptNumber = getNextReceiptNumber(form.note)
      const receiptHeader = `\n\n--- ${receiptNumber} чек ---\n${receiptNote}`
      
      // Додаємо новий чек в кінець note
      const newNote = form.note 
        ? `${form.note}${receiptHeader}`
        : receiptNote
      
      // Обробка суми: якщо сума така сама - не міняємо, якщо інша - додаємо
      let newAmount = currentAmount
      if (Math.abs(receiptTotal - currentAmount) > 0.01) {
        // Суми різні - додаємо
        newAmount = currentAmount + receiptTotal
      }
      // Якщо суми однакові - залишаємо currentAmount без змін
      
      setForm(f => ({
        ...f,
        amount: String(newAmount),
        note: newNote,
        category: f.category || ((parsed.items || []).length ? 'Продукти' : ''),
        merchantName, // Зберігаємо для передачі в payload
        merchantAddress // Зберігаємо для передачі в payload
      }))

      setShowReceiptActions(false)
      toast.success('Чек розпізнано та додано')
    } catch (e) {
      console.error(e)
      toast.error(e?.message || 'Помилка обробки чека')
    } finally {
      setParsing(false)
    }
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      setStream(stream)
      setCameraOpen(true)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (e) {
      console.error('Camera error:', e)
      toast.error('Не вдалося відкрити камеру')
    }
  }

  const stopCamera = () => {
    try { stream?.getTracks()?.forEach(t => t.stop()) } catch {}
    setStream(null)
    setCameraOpen(false)
  }

  const capturePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(async (blob) => {
      stopCamera()
      if (blob) await handleReceiptBlob(blob)
    }, 'image/jpeg', 0.9)
  }

  const onPickFile = () => fileInputRef.current?.click()
  const onFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (file) await handleReceiptBlob(file)
    e.target.value = ''
  }

  const validateForm = () => {
    const newErrors = {
      amount: '',
      category: '',
      cardId: '',
    }

    // Валідація суми
    const amountValue = parseFloat(form.amount || '0')
    if (!form.amount || form.amount.trim() === '' || isNaN(amountValue) || amountValue <= 0) {
      newErrors.amount = 'Введіть суму більше нуля'
    }

    // Валідація категорії
    if (!form.category || form.category.trim() === '') {
      newErrors.category = 'Оберіть або введіть категорію'
    }

    // Валідація карти
    if (!form.cardId || form.cardId.trim() === '') {
      newErrors.cardId = 'Оберіть карту'
    }

    setErrors(newErrors)
    return !newErrors.amount && !newErrors.category && !newErrors.cardId
  }

  const save = async (e) => {
    e?.preventDefault?.()
    
    // Валідація перед збереженням
    if (!validateForm()) {
      return
    }

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
        merchant_name: form.merchantName || null,
        merchant_address: form.merchantAddress || null,
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
      toast.error('Не вдалося зберегти зміни')
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
                  className={`px-3 py-2 rounded-xl font-medium transition-colors ${
                    form.kind==='expense' 
                      ? 'bg-red-100 text-red-700 border-2 border-red-300' 
                      : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                  }`}
                  onClick={()=>setForm(f=>({...f, kind:'expense'}))}
                >Витрата</button>
                <button type="button"
                  className={`px-3 py-2 rounded-xl font-medium transition-colors ${
                    form.kind==='income' 
                      ? 'bg-green-100 text-green-700 border-2 border-green-300' 
                      : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                  }`}
                  onClick={()=>setForm(f=>({...f, kind:'income'}))}
                >Дохід</button>
              </div>

              <div>
                <input 
                  type="text" 
                  inputMode="decimal"
                  className={`border rounded-xl px-3 py-2 w-full ${errors.amount ? 'border-rose-500 focus:ring-2 focus:ring-rose-500' : 'focus:ring-2 focus:ring-indigo-500'}`}
                  placeholder="Сума (наприклад: 12-15 або 100*0.2)" 
                  value={form.amount}
                  onChange={e => {
                    setForm({...form, amount: e.target.value})
                    if (errors.amount) {
                      setErrors({...errors, amount: ''})
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const result = calculateExpression(form.amount)
                      if (result !== null) {
                        setForm({...form, amount: String(result)})
                        toast.success(`Обчислено: ${result}`, { duration: 1500 })
                      }
                    }
                  }}
                />
                {errors.amount && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-1.5 text-sm text-rose-600 flex items-center gap-1"
                  >
                    <span className="text-rose-500">⚠</span>
                    {errors.amount}
                  </motion.div>
                )}
              </div>

              <div className="relative" ref={categoryInputRef}>
                <input 
                  className={`border rounded-xl px-3 py-2 w-full ${errors.category ? 'border-rose-500 focus:ring-2 focus:ring-rose-500' : 'focus:ring-2 focus:ring-indigo-500'}`}
                  placeholder="Категорія"
                  value={form.category}
                  onChange={e => {
                    setForm({...form, category: e.target.value})
                    if (errors.category) {
                      setErrors({...errors, category: ''})
                    }
                  }}
                  onFocus={()=>setShowCategoryDropdown(true)} 
                />
                {errors.category && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-1.5 text-sm text-rose-600 flex items-center gap-1"
                  >
                    <span className="text-rose-500">⚠</span>
                    {errors.category}
                  </motion.div>
                )}
                
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

              <div>
                <select 
                  className={`border rounded-xl px-3 py-2 w-full ${errors.cardId ? 'border-rose-500 focus:ring-2 focus:ring-rose-500' : 'focus:ring-2 focus:ring-indigo-500'}`}
                  value={form.cardId}
                  onChange={e => {
                    setForm({...form, cardId: e.target.value})
                    if (errors.cardId) {
                      setErrors({...errors, cardId: ''})
                    }
                  }}
                >
                  <option value="">— Оберіть карту —</option>
                  {cards.map(c=>(
                    <option key={c.id} value={c.id}>{c.bank} — {c.name}</option>
                  ))}
                </select>
                {errors.cardId && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-1.5 text-sm text-rose-600 flex items-center gap-1"
                  >
                    <span className="text-rose-500">⚠</span>
                    {errors.cardId}
                  </motion.div>
                )}
              </div>

              <textarea className="border rounded-xl px-3 py-2 min-h-[90px]"
                placeholder="Нотатки"
                value={form.note}
                onChange={e=>setForm({...form, note: e.target.value})} />

              {/* Додавання чека */}
              <div className="mt-1">
                {!showReceiptActions ? (
                  <button type="button" className="w-full rounded-xl border px-3 py-2 hover:bg-gray-50"
                          onClick={()=>setShowReceiptActions(true)}>
                    Додати чек
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className="rounded-xl border px-3 py-2 hover:bg-gray-50"
                            onClick={onPickFile} disabled={parsing}>
                      Додати фото
                    </button>
                    <button type="button" className="rounded-xl border px-3 py-2 hover:bg-gray-50"
                            onClick={startCamera} disabled={parsing}>
                      Сфотографувати
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFileChange}/>
                    {parsing && <div className="col-span-2 text-xs text-gray-500">Обробка чека…</div>}
                  </div>
                )}
              </div>

              <div className="mt-2 flex gap-2">
                <button 
                  className="btn btn-primary flex-1"
                  type="submit" 
                  disabled={saving || parsing}
                >
                  {saving ? 'Збереження…' : 'Зберегти'}
                </button>
                <button type="button" className="btn btn-soft" onClick={onClose}>Скасувати</button>
              </div>
            </form>

      <AnimatePresence>
        {cameraOpen && (
          <motion.div
            className="fixed inset-0 z-[120] bg-black/70 grid place-items-center p-4"
            style={{ zIndex: 120 }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onMouseDown={stopCamera}
          >
            <div className="w-full max-w-lg bg-white rounded-2xl overflow-hidden" onMouseDown={e=>e.stopPropagation()}>
              <div className="relative bg-black">
                <video ref={videoRef} autoPlay playsInline className="w-full max-h-[70vh] object-contain" />
                <canvas ref={canvasRef} className="hidden" />
              </div>
              <div className="p-3 flex gap-2 justify-end">
                <button className="btn btn-soft" onClick={stopCamera}>Скасувати</button>
                <button className="btn btn-primary" onClick={capturePhoto}>Зробити фото</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </BaseModal>
  )
}
