import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { createTransaction } from '../../api/transactions'
import { txBus } from '../../utils/txBus'
import useMonoRates from '../../hooks/useMonoRates'
import BaseModal from '../BaseModal'
import { getApiUrl } from '../../utils.jsx'

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
    if (!open) return
    ;(async () => {
      const { data } = await supabase.from('cards').select('id, bank, name, currency').order('created_at', { ascending: false })
      setCards(data || [])
      
      // Fetch popular categories
      const { data: txData } = await supabase
        .from('transactions')
        .select('category')
        .not('category', 'is', null)
      
      // Count categories and sort by frequency
      const categoryCounts = {}
      txData?.forEach(tx => {
        if (tx.category) {
          categoryCounts[tx.category] = (categoryCounts[tx.category] || 0) + 1
        }
      })
      
      const sortedCategories = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([category]) => category)
      
      setCategories(sortedCategories)
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
      setForm({ kind: 'expense', amount: '', category: '', cardId: '', note: '' })
      setShowReceiptActions(false)
      setParsing(false)
      stopCamera()
    }
  }, [open])

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      setStream(s)
      setCameraOpen(true)
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s }, 50)
    } catch (e) {
      console.error(e)
      alert('Не вдалось відкрити камеру')
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

  function buildNoteFromItems(items, currency, rateToUAH) {
    const toUAH = (amt) => Number(rateToUAH || 1) * Number(amt || 0)
    const num = (n) => Number(n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return (items || []).map(it => {
      const qty = Number(it.qty || 1)
      const unit = Number(it.unit_price || 0)
      const totalLine = unit * qty
      return `${it.name || 'Товар'} - ${qty} - ${num(unit)} ${currency} (${num(toUAH(unit))} грн) - ${num(totalLine)} ${currency} (${num(toUAH(totalLine))} грн)`
    }).join('\n')
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
  const note = buildNoteFromItems(parsed.items || [], billCur, derivedRate)

      setForm(f => ({
        ...f,
        kind: 'expense',
        amount: String(total || ''),
        category: f.category || ((parsed.items || []).length ? 'Продукти' : ''),
        note
      }))

      setShowReceiptActions(false)
      alert('Чек розпізнано, поля заповнено ✅')
    } catch (e) {
      console.error(e)
      alert(e?.message || 'Помилка обробки чека')
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
        created_at: new Date().toISOString(),
        archives: false,
      }
      const data = await createTransaction(payload)
      onSaved?.(data)
      onClose()
      // інформуємо інші віджети
      txBus.emit({ card_id: data.card_id || null, delta: Number(data.amount || 0) })
    } catch (e) {
      console.error('Create tx error:', e)
      alert(e?.message || 'Не вдалося зберегти транзакцію')
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
                  placeholder="Категорія (напр. Продукти)"
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
                <button className="btn btn-primary flex-1" type="submit" disabled={saving || parsing}>
                  {saving ? 'Збереження…' : parsing ? 'Обробка чека…' : 'Зберегти'}
                </button>
                <button type="button" className="btn btn-soft" onClick={onClose}>Скасувати</button>
              </div>
            </form>
      </BaseModal>

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
    </>
  )
}
