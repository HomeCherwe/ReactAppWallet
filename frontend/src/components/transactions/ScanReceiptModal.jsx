import { useEffect, useRef, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { scanTransactions, createTransaction, getTransactionCategories } from '../../api/transactions'
import { listCards } from '../../api/cards'
import { txBus } from '../../utils/txBus'
import BaseModal from '../BaseModal'
import toast from 'react-hot-toast'
import { Camera, Upload, X, Check, Trash2, Edit3, ChevronDown, ChevronUp, Loader2, ScanLine, ImagePlus } from 'lucide-react'

const CATEGORY_OPTIONS = [
  'Продукти', 'Транспорт', 'Шопінг', "Здоров'я", 'Розваги',
  'Комунальні', 'Кафе', 'Підписки', 'Борг', 'Інше'
]

function parseDateDDMMYYYY(str) {
  if (!str) return new Date()
  const parts = str.split('/')
  if (parts.length !== 3) return new Date()
  const [dd, mm, yyyy] = parts
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd))
}

function toDatetimeLocal(date) {
  const d = new Date(date)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function ScanReceiptModal({ open, onClose, onSaved }) {
  const [step, setStep] = useState('upload') // 'upload' | 'scanning' | 'review'
  const [files, setFiles] = useState([])
  const [previews, setPreviews] = useState([])
  const [transactions, setTransactions] = useState([])
  const [cards, setCards] = useState([])
  const [categories, setCategories] = useState(CATEGORY_OPTIONS)
  const [saving, setSaving] = useState(false)
  const [selectedAll, setSelectedAll] = useState(true)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [expandedId, setExpandedId] = useState(null)
  const [allExpanded, setAllExpanded] = useState(false)
  const [globalCardId, setGlobalCardId] = useState('')
  const [globalCategory, setGlobalCategory] = useState('')
  const [showGlobalCatDropdown, setShowGlobalCatDropdown] = useState(false)
  const [openCategoryTxId, setOpenCategoryTxId] = useState(null)
  const globalCatInputRef = useRef(null)
  const globalCatDropdownRef = useRef(null)
  const fileInputRef = useRef(null)
  const dropRef = useRef(null)
  const [dragActive, setDragActive] = useState(false)

  // Camera state
  const [cameraOpen, setCameraOpen] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [stream, setStream] = useState(null)

  useEffect(() => {
    if (!open) {
      setStep('upload')
      setFiles([])
      setPreviews([])
      setTransactions([])
      setSelectedAll(true)
      setSelectedIds(new Set())
      setExpandedId(null)
      setAllExpanded(false)
      setGlobalCardId('')
      setGlobalCategory('')
      setShowGlobalCatDropdown(false)
      setOpenCategoryTxId(null)
      stopCamera()
      return
    }
    ;(async () => {
      const [c, cats] = await Promise.all([listCards(), getTransactionCategories()])
      setCards(c || [])
      const merged = [...new Set([...CATEGORY_OPTIONS, ...(cats || [])])]
      setCategories(merged)
    })()
  }, [open])

  // Close category dropdowns on outside click
  useEffect(() => {
    if (!showGlobalCatDropdown && !openCategoryTxId) return
    const handler = (e) => {
      if (showGlobalCatDropdown) {
        if (globalCatInputRef.current && !globalCatInputRef.current.contains(e.target) &&
            globalCatDropdownRef.current && !globalCatDropdownRef.current.contains(e.target)) {
          setShowGlobalCatDropdown(false)
        }
      }
      if (openCategoryTxId) {
        if (!e.target.closest(`.cat-dropdown-${openCategoryTxId}`)) {
          setOpenCategoryTxId(null)
        }
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showGlobalCatDropdown, openCategoryTxId])

  // Create previews when files change
  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [files])

  const handleFiles = useCallback((newFiles) => {
    const images = Array.from(newFiles).filter(f => f.type.startsWith('image/'))
    if (images.length === 0) {
      toast.error('Оберіть зображення')
      return
    }
    setFiles(prev => [...prev, ...images])
  }, [])

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  // Drag & Drop
  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true) }
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false) }
  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false)
    handleFiles(e.dataTransfer.files)
  }

  // Camera
  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error('Ваш браузер не підтримує камеру')
        return
      }
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      })
      setStream(s)
      setCameraOpen(true)
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => {})
        }
      }, 50)
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
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      stopCamera()
      if (blob) {
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
        setFiles(prev => [...prev, file])
      }
    }, 'image/jpeg', 0.9)
  }

  // Scan
  const startScan = async () => {
    if (files.length === 0) {
      toast.error('Додайте хоча б одне зображення')
      return
    }
    setStep('scanning')
    try {
      const result = await scanTransactions(files)
      if (!result || result.length === 0) {
        toast.error('Транзакції не знайдено на зображеннях')
        setStep('upload')
        return
      }
      // Assign temporary ids and default card; merge merchant into note
      const withIds = result.map((tx, i) => {
        const merchantPart = tx.merchant || ''
        const notePart = tx.note || ''
        const combinedNote = merchantPart && notePart ? `${merchantPart}\n${notePart}` : merchantPart || notePart
        return {
          ...tx,
          _id: `scan_${Date.now()}_${i}`,
          _selected: true,
          cardId: cards[0]?.id || '',
          dateLocal: toDatetimeLocal(parseDateDDMMYYYY(tx.date)),
          note: combinedNote,
        }
      })
      setTransactions(withIds)
      setSelectedIds(new Set(withIds.map(t => t._id)))
      setStep('review')
      toast.success(`Знайдено ${withIds.length} транзакцій`)
    } catch (e) {
      console.error('Scan error:', e)
      toast.error(e?.message || 'Помилка сканування')
      setStep('upload')
    }
  }

  // Toggle selection
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(transactions.map(t => t._id)))
    }
  }

  // Edit transaction field
  const updateTx = (id, field, value) => {
    setTransactions(prev => prev.map(tx => tx._id === id ? { ...tx, [field]: value } : tx))
  }

  // Remove transaction
  const removeTx = (id) => {
    setTransactions(prev => prev.filter(tx => tx._id !== id))
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  // Save selected transactions
  const saveAll = async () => {
    const toSave = transactions.filter(tx => selectedIds.has(tx._id))
    if (toSave.length === 0) {
      toast.error('Оберіть хоча б одну транзакцію')
      return
    }

    // Validate all have card selected
    const noCard = toSave.find(tx => !tx.cardId)
    if (noCard) {
      toast.error('Оберіть карту для всіх транзакцій')
      setExpandedId(noCard._id)
      return
    }

    setSaving(true)
    let savedCount = 0

    try {
      for (const tx of toSave) {
        const card = cards.find(c => c.id === tx.cardId)
        const cardLabel = card ? `${card.bank} ${card.name}` : null
        const raw = Math.abs(Number(tx.amount || 0))
        const signed = tx.type === 'income' ? raw : -raw

        const payload = {
          amount: signed,
          category: tx.category || 'Інше',
          note: tx.note || null,
          card: cardLabel,
          card_id: tx.cardId || null,
          created_at: tx.dateLocal ? new Date(tx.dateLocal).toISOString() : new Date().toISOString(),
          archives: false,
          is_debt: false,
          exclude_from_stats: false,
        }

        try {
          const data = await createTransaction(payload)
          savedCount++
          txBus.emit({
            type: 'CREATE',
            transaction: data,
            card_id: data.card_id || null,
            delta: Number(data.amount || 0),
          })
        } catch (e) {
          console.error(`Failed to save "${tx.merchant}":`, e)
        }
      }

      if (savedCount > 0) {
        toast.success(`Збережено ${savedCount} транзакцій`)
        onSaved?.()
        onClose()
      } else {
        toast.error('Не вдалося зберегти жодної транзакції')
      }
    } catch (e) {
      console.error('Save error:', e)
      toast.error('Помилка збереження')
    } finally {
      setSaving(false)
    }
  }

  const getCurrencySymbol = (cur) => {
    const map = { EUR: '€', USD: '$', UAH: '₴', GBP: '£', PLN: 'zł' }
    return map[cur] || cur
  }

  return (
    <>
      <BaseModal
        open={open}
        onClose={onClose}
        title={step === 'review' ? 'Перегляд транзакцій' : 'Сканування чеків'}
        zIndex={100}
        maxWidth="lg"
      >
        {/* STEP: Upload */}
        {step === 'upload' && (
          <div className="grid gap-4">
            {/* Drop Zone */}
            <div
              ref={dropRef}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer
                transition-all duration-200
                ${dragActive
                  ? 'border-indigo-400 bg-indigo-50 scale-[1.02]'
                  : 'border-gray-300 hover:border-indigo-300 hover:bg-gray-50'
                }
              `}
            >
              <div className="flex flex-col items-center gap-3">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${dragActive ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                  <ImagePlus size={28} className={dragActive ? 'text-indigo-500' : 'text-gray-400'} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Перетягніть зображення сюди
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    або натисніть для вибору файлів
                  </p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
              />
            </div>

            {/* Camera button */}
            <button
              type="button"
              onClick={startCamera}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
            >
              <Camera size={18} />
              Зробити фото
            </button>

            {/* Preview grid */}
            {previews.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {previews.map((url, idx) => (
                  <div key={idx} className="relative group rounded-xl overflow-hidden aspect-square bg-gray-100">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(idx) }}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={14} />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-1">
                      <span className="text-[10px] text-white/80 truncate block">{files[idx]?.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Scan button */}
            <button
              type="button"
              onClick={startScan}
              disabled={files.length === 0}
              className={`
                w-full py-3 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2
                ${files.length > 0
                  ? 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]'
                  : 'bg-gray-300 cursor-not-allowed'
                }
              `}
            >
              <ScanLine size={20} />
              Сканувати {files.length > 0 ? `(${files.length} фото)` : ''}
            </button>
          </div>
        )}

        {/* STEP: Scanning */}
        {step === 'scanning' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
                <Loader2 size={32} className="text-indigo-500 animate-spin" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">Аналіз зображень…</p>
              <p className="text-xs text-gray-500 mt-1">AI витягує транзакції з {files.length} фото</p>
            </div>
          </div>
        )}

        {/* STEP: Review */}
        {step === 'review' && (
          <div className="grid gap-3">
            {/* Summary bar */}
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-xl">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.size === transactions.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-medium">Обрати всі</span>
              </label>
              <span className="text-xs text-gray-500">
                {selectedIds.size} з {transactions.length} обрано
              </span>
              <button
                type="button"
                onClick={() => setAllExpanded(v => !v)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {allExpanded ? 'Згорнути всі' : 'Розгорнути всі'}
              </button>
            </div>

            {/* Global card & category selectors */}
            <div className="grid gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500 whitespace-nowrap">Карта:</span>
                <select
                  className="flex-1 border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 min-w-0"
                  value={globalCardId}
                  onChange={(e) => {
                    const cardId = e.target.value
                    setGlobalCardId(cardId)
                    if (!cardId) return
                    setTransactions(prev => prev.map(tx => ({ ...tx, cardId })))
                  }}
                >
                  <option value="">— Обрати карту для всіх —</option>
                  {cards.map(c => (
                    <option key={c.id} value={c.id}>{c.bank} — {c.name} ({c.currency})</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5 relative" ref={globalCatInputRef}>
                <span className="text-xs text-gray-500 whitespace-nowrap">Категорія:</span>
                <input
                  className="flex-1 border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 min-w-0"
                  placeholder="Категорія для всіх"
                  value={globalCategory}
                  onChange={(e) => setGlobalCategory(e.target.value)}
                  onFocus={() => setShowGlobalCatDropdown(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (globalCategory.trim()) {
                        setTransactions(prev => prev.map(tx => ({ ...tx, category: globalCategory.trim() })))
                        setShowGlobalCatDropdown(false)
                      }
                    }
                  }}
                />
                <AnimatePresence>
                  {showGlobalCatDropdown && (() => {
                    const q = globalCategory.trim().toLowerCase()
                    const filtered = q ? categories.filter(c => c.toLowerCase().includes(q)) : categories
                    return filtered.length > 0 && (
                      <motion.div
                        ref={globalCatDropdownRef}
                        className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border rounded-xl max-h-48 overflow-y-auto shadow-lg"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                      >
                        {filtered.map((cat, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl"
                            onClick={() => {
                              setGlobalCategory(cat)
                              setTransactions(prev => prev.map(tx => ({ ...tx, category: cat })))
                              setShowGlobalCatDropdown(false)
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
            </div>

            {/* Transaction list */}
            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
              <AnimatePresence initial={false}>
                {transactions.map((tx) => {
                  const isSelected = selectedIds.has(tx._id)
                  const isExpanded = allExpanded || expandedId === tx._id
                  return (
                    <motion.div
                      key={tx._id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className={`border rounded-xl overflow-hidden transition-colors ${
                        isSelected ? 'border-indigo-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'
                      }`}
                    >
                      {/* Row header */}
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(tx._id)}
                          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : tx._id)}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-800 truncate">{tx.note?.split('\n')[0] || 'Транзакція'}</span>
                            <span className={`text-sm font-semibold whitespace-nowrap ml-2 ${tx.type === 'income' ? 'text-emerald-600' : 'text-gray-900'}`}>
                              {tx.type === 'income' ? '+' : '-'}{Number(tx.amount || 0).toFixed(2)} {getCurrencySymbol(tx.currency)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-gray-500">{tx.date}</span>
                            <span className="text-[11px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{tx.category}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : tx._id)}
                            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeTx(tx._id)}
                            className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Expanded edit form */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t overflow-hidden"
                          >
                            <div className="grid gap-2 p-3 bg-gray-50/50">
                              <div className={`cat-dropdown-${tx._id} relative`}>
                                <label className="text-[11px] text-gray-500 mb-0.5 block">Категорія</label>
                                <input
                                  className="border rounded-lg px-2 py-1.5 w-full text-sm"
                                  placeholder="Пошук категорії"
                                  value={tx.category}
                                  onChange={e => updateTx(tx._id, 'category', e.target.value)}
                                  onFocus={() => setOpenCategoryTxId(tx._id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      if (tx.category.trim()) {
                                        updateTx(tx._id, 'category', tx.category.trim())
                                        setOpenCategoryTxId(null)
                                      }
                                    }
                                  }}
                                />
                                <AnimatePresence>
                                  {openCategoryTxId === tx._id && (() => {
                                    const q = (tx.category || '').trim().toLowerCase()
                                    const filtered = q ? categories.filter(c => c.toLowerCase().includes(q)) : categories
                                    return filtered.length > 0 && (
                                      <motion.div
                                        className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border rounded-xl max-h-48 overflow-y-auto shadow-lg"
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                      >
                                        {filtered.map((cat, idx) => (
                                          <button
                                            key={idx}
                                            type="button"
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl"
                                            onClick={() => {
                                              updateTx(tx._id, 'category', cat)
                                              setOpenCategoryTxId(null)
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
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[11px] text-gray-500 mb-0.5 block">Сума</label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    className="border rounded-lg px-2 py-1.5 w-full text-sm"
                                    value={tx.amount}
                                    onChange={e => updateTx(tx._id, 'amount', e.target.value.replace(',', '.'))}
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] text-gray-500 mb-0.5 block">Тип</label>
                                  <select
                                    className="border rounded-lg px-2 py-1.5 w-full text-sm"
                                    value={tx.type}
                                    onChange={e => updateTx(tx._id, 'type', e.target.value)}
                                  >
                                    <option value="expense">Витрата</option>
                                    <option value="income">Дохід</option>
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label className="text-[11px] text-gray-500 mb-0.5 block">Дата</label>
                                <input
                                  type="datetime-local"
                                  className="border rounded-lg px-2 py-1.5 w-full text-sm"
                                  value={tx.dateLocal}
                                  onChange={e => updateTx(tx._id, 'dateLocal', e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-gray-500 mb-0.5 block">Карта</label>
                                <select
                                  className="border rounded-lg px-2 py-1.5 w-full text-sm"
                                  value={tx.cardId}
                                  onChange={e => updateTx(tx._id, 'cardId', e.target.value)}
                                >
                                  <option value="">— Оберіть карту —</option>
                                  {cards.map(c => (
                                    <option key={c.id} value={c.id}>{c.bank} — {c.name} ({c.currency})</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-[11px] text-gray-500 mb-0.5 block">Нотатка</label>
                                <textarea
                                  className="border rounded-lg px-2 py-1.5 w-full text-sm min-h-[60px]"
                                  value={tx.note}
                                  onChange={e => updateTx(tx._id, 'note', e.target.value)}
                                  placeholder="Нотатка"
                                />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setStep('upload'); setTransactions([]) }}
                className="btn btn-soft flex-shrink-0"
              >
                ← Назад
              </button>
              <button
                type="button"
                onClick={saveAll}
                disabled={saving || selectedIds.size === 0}
                className={`
                  btn flex-1 font-semibold text-white rounded-xl py-2.5 transition-all flex items-center justify-center gap-2
                  ${selectedIds.size > 0 && !saving
                    ? 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]'
                    : 'bg-gray-300 cursor-not-allowed'
                  }
                `}
              >
                {saving ? (
                  <><Loader2 size={18} className="animate-spin" /> Збереження…</>
                ) : (
                  <><Check size={18} /> Зберегти {selectedIds.size} транзакцій</>
                )}
              </button>
            </div>
          </div>
        )}
      </BaseModal>

      {/* Camera overlay */}
      <AnimatePresence>
        {cameraOpen && (
          <motion.div
            className="fixed inset-0 z-[120] bg-black flex flex-col"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="flex-1 relative flex items-center justify-center">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <div
              className="p-4 flex items-center justify-between"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}
            >
              <button className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white" onClick={stopCamera}>
                <X size={20} />
              </button>
              <button
                className="w-16 h-16 rounded-full bg-white border-4 border-white shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                onClick={capturePhoto}
                style={{ boxShadow: '0 0 0 2px rgba(255,255,255,0.3), 0 4px 12px rgba(0,0,0,0.3)' }}
              >
                <div className="w-12 h-12 rounded-full bg-white"></div>
              </button>
              <div className="w-10"></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
