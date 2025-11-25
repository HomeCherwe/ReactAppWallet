import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { createTransaction, getTransactionCategories } from '../../api/transactions'
import { txBus } from '../../utils/txBus'
import useMonoRates from '../../hooks/useMonoRates'
import BaseModal from '../BaseModal'
import { getApiUrl } from '../../utils.jsx'
import { listCards } from '../../api/cards'
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

export default function CreateTxModal({ open, onClose, onSaved }) {
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
    merchantName: null,
    merchantAddress: null,
  })

  const [errors, setErrors] = useState({
    amount: '',
    category: '',
    cardId: '',
  })

  const [showReceiptActions, setShowReceiptActions] = useState(false)
  const [parsing, setParsing] = useState(false)
  const fileInputRef = useRef(null)
  const rates = useMonoRates()

  const [cameraOpen, setCameraOpen] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [stream, setStream] = useState(null)

  useEffect(() => {
    if (!open) {
      // Очистити помилки при закритті модалки
      setErrors({ amount: '', category: '', cardId: '' })
      return
    }
    ;(async () => {
      const cards = await listCards()
      setCards(cards || [])
      
      // Fetch popular categories
      const categories = await getTransactionCategories()
      setCategories(categories || [])
    })()
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

  useEffect(() => {
    if (!open) {
      setForm({ kind: 'expense', amount: '', category: '', cardId: '', note: '', merchantName: null, merchantAddress: null })
      setShowReceiptActions(false)
      setParsing(false)
      stopCamera()
    }
  }, [open])

  const startCamera = async () => {
    try {
      // Перевірка підтримки getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error('Ваш браузер не підтримує камеру')
        return
      }

      // Перевірка протоколу (на мобільних потрібен HTTPS або localhost)
      const isSecure = window.location.protocol === 'https:' || 
                       window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1'
      
      if (!isSecure && /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        toast.error('Для доступу до камери потрібен HTTPS. Використайте https:// або localhost', { duration: 5000 })
        return
      }

      // Спробувати відкрити камеру
      const constraints = {
        video: {
          facingMode: 'environment', // Задня камера
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      }

      const s = await navigator.mediaDevices.getUserMedia(constraints)
      setStream(s)
      setCameraOpen(true)
      setTimeout(() => { 
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(err => {
            console.error('Video play error:', err)
            toast.error('Не вдалося запустити відео')
          })
        }
      }, 50)
    } catch (e) {
      console.error('Camera error:', e)
      let errorMessage = 'Не вдалося відкрити камеру'
      
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        errorMessage = 'Дозвіл на камеру відхилено. Перевірте налаштування браузера'
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        errorMessage = 'Камера не знайдена'
      } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
        errorMessage = 'Камера зайнята іншим додатком'
      } else if (e.name === 'OverconstrainedError' || e.name === 'ConstraintNotSatisfiedError') {
        // Спробувати з простішими налаштуваннями
        try {
          const simpleConstraints = { video: { facingMode: 'environment' }, audio: false }
          const s = await navigator.mediaDevices.getUserMedia(simpleConstraints)
          setStream(s)
          setCameraOpen(true)
          setTimeout(() => { 
            if (videoRef.current) {
              videoRef.current.srcObject = s
              videoRef.current.play().catch(() => {})
            }
          }, 50)
          return
        } catch (retryError) {
          errorMessage = 'Не вдалося відкрити камеру. Перевірте дозволи'
        }
      }
      
      toast.error(errorMessage, { duration: 4000 })
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

  async function parseReceiptViaApi(blob, cardCurrency) {
    const fd = new FormData()
    fd.append('image', blob, 'receipt.jpg')
    fd.append('cardCurrency', cardCurrency || '')
    // Use full URL for production, relative for dev (via Vite proxy)
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
      // Якщо кількість = 1, не показуємо загальну ціну
      if (qty === 1) {
        return baseLine
      }
      return `${baseLine} - ${num(totalLine)} ${currency} (${num(toUAH(totalLine))} грн)`
    }).join('\n')
    
    // Додаємо назву мерчанту з адресою на початок, якщо вона є
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

  async function handleReceiptBlob(blob) {
    setParsing(true)
    try {
  const selected = cards.find(c => c.id === form.cardId)
  const cardCur = (selected?.currency || 'UAH').toUpperCase()
  const parsed = await parseReceiptViaApi(blob, cardCur)
  const billCur = (parsed.currency || cardCur || 'UAH').toUpperCase()
  // derive rateToUAH from monobank rates when available. use numeric codes.
  const codeMap = { UAH: 980, USD: 840, EUR: 978, GBP: 826 }
  const billCode = codeMap[billCur]
  let derivedRate = 1
  if (billCur === 'UAH') derivedRate = 1
  else if (billCode && rates[`${billCode}->980`]) derivedRate = rates[`${billCode}->980`]
      const total = Math.abs(Number(parsed.totalAmount || 0))
  
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
  
  const note = buildNoteFromItems(parsed.items || [], billCur, derivedRate, parsed.merchant)

      setForm(f => ({
        ...f,
        kind: 'expense',
        amount: String(total || ''),
        category: f.category || ((parsed.items || []).length ? 'Продукти' : ''),
        note,
        merchantName, // Зберігаємо для передачі в payload
        merchantAddress // Зберігаємо для передачі в payload
      }))

      setShowReceiptActions(false)
      toast.success('Чек розпізнано, поля заповнено')
    } catch (e) {
      console.error(e)
      toast.error(e?.message || 'Помилка обробки чека')
    } finally {
      setParsing(false)
    }
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
        created_at: new Date().toISOString(),
        archives: false,
        merchant_name: form.merchantName || null,
        merchant_address: form.merchantAddress || null,
      }
      const data = await createTransaction(payload)
      onSaved?.(data)
      onClose()
      // інформуємо інші віджети
      txBus.emit({ card_id: data.card_id || null, delta: Number(data.amount || 0) })
    } catch (e) {
      console.error('Create tx error:', e)
      toast.error(e?.message || 'Не вдалося зберегти транзакцію')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <BaseModal
        open={open}
        onClose={onClose}
        title="Нова транзакція"
        zIndex={100}
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
                  placeholder="Категорія (напр. Продукти)"
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

              {/* rate input removed - using Monobank rates via useMonoRates */}

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
                  {saving ? 'Збереження…' : parsing ? 'Обробка чека…' : 'Зберегти'}
                </button>
                <button type="button" className="btn btn-soft" onClick={onClose}>Скасувати</button>
              </div>
            </form>
      </BaseModal>

      <AnimatePresence>
            {cameraOpen && (
              <motion.div
                className="fixed inset-0 z-[120] bg-black sm:bg-black/70 flex flex-col sm:grid sm:place-items-center sm:p-4 p-0"
                style={{ zIndex: 120 }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onMouseDown={stopCamera}
              >
                <div className="w-full h-full sm:w-full sm:max-w-lg sm:h-auto sm:bg-white sm:rounded-2xl overflow-hidden flex flex-col" onMouseDown={e=>e.stopPropagation()}>
                  <div className="relative bg-black flex-1 flex items-center justify-center min-h-0">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      className="w-full h-full sm:max-h-[70vh] object-cover sm:object-contain" 
                    />
                    <canvas ref={canvasRef} className="hidden" />
                  </div>
                  {/* Кнопки для мобільних - завжди видимі внизу */}
                  <div className="pb-4 sm:pb-0 p-4 sm:p-3 bg-black/90 sm:bg-white flex items-center justify-between gap-3 sm:justify-end flex-shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                    {/* Кнопка скасувати зліва */}
                    <button 
                      className="px-4 py-2 text-white bg-transparent hover:bg-white/10 rounded-lg font-medium transition-colors sm:text-gray-700 sm:bg-gray-100 sm:hover:bg-gray-200" 
                      onClick={stopCamera}
                    >
                      СКАСУВАТИ
                    </button>
                    {/* Кругла кнопка для фотографування (як на iPhone) - по центру */}
                    <button 
                      className="w-16 h-16 sm:w-14 sm:h-14 rounded-full bg-white border-4 border-white shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform flex-shrink-0"
                      onClick={capturePhoto}
                      title="Зробити фото"
                      style={{
                        boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)'
                      }}
                    >
                      <div className="w-12 h-12 sm:w-10 sm:h-10 rounded-full bg-white"></div>
                    </button>
                    {/* Заглушка для вирівнювання */}
                    <div className="w-16 sm:w-0"></div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
    </>
  )
}
