import { supabase } from '../lib/supabase'
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { listCards, createCard, updateCard, deleteCard } from '../api/cards'
import { sumTransactionsByCard } from '../api/transactions'
import { CreditCard, Plus, X, Pencil, Trash2, Filter, Copy } from 'lucide-react'
import { txBus } from '../utils/txBus'
import toast from 'react-hot-toast'
import BaseModal from './BaseModal'
import { updatePreferencesSection } from '../api/preferences'
import { usePreferences } from '../context/PreferencesContext'

const GRADS = [
  'from-indigo-500 via-fuchsia-500 to-amber-400',
  'from-sky-500 via-purple-500 to-pink-500',
  'from-rose-500 via-orange-500 to-yellow-400',
  'from-emerald-500 via-teal-500 to-cyan-400',
]

const formatCardNumber = (num, bank, name) => {
  // For Binance Spot, show without spaces
  if (bank === 'Binance' && name === 'Spot') {
    return num || '****************'
  }
  
  if (!num) return '**** **** **** ****'
  const clean = String(num).replace(/\D/g, '')
  const groups = clean.match(/.{1,4}/g) || []
  const g = [groups[0] || '****', groups[1] || '****', groups[2] || '****', groups[3] || '****']
  return `${g[0]} ${g[1]} ${g[2]} ${g[3]}`
}

function CardTile({ c, onEdit, onDelete }) {
  const g = GRADS[Math.abs((c.id || '').charCodeAt(0) || 0) % GRADS.length]
  const cardNumber = formatCardNumber(c.card_number, c.bank, c.name)
  
  const copyCardNumber = async () => {
    try {
      await navigator.clipboard.writeText(c.card_number || cardNumber)
      toast.success('Номер картки скопійовано', {
        duration: 2000,
        position: 'bottom-center'
      })
    } catch (err) {
      console.error('Failed to copy:', err)
      toast.error('Не вдалося скопіювати')
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl text-white shadow-glass"
      style={{
        aspectRatio: '1.586 / 1',
        backgroundImage: c?.bg_url
          ? `linear-gradient(135deg, rgba(17,17,17,.2), rgba(17,17,17,.8)), url(${c.bg_url})`
          : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backdropFilter: 'blur(10px)',
      }}
    >
      {!c?.bg_url && <div className={`absolute inset-0 bg-gradient-to-tr ${g}`} />}

      <div className="relative h-full p-4 sm:p-5 flex flex-col">
        <div className="flex justify-between items-start">
          <div>
            {!c?.bg_url && <div className="text-white/80 text-[10px] sm:text-xs">{c.bank}</div>}
            {c?.bg_url && <div className="text-transparent text-[10px] sm:text-xs select-none">.</div>}
            <div className="text-base sm:text-lg font-extrabold mt-0.5">{c.name}</div>
          </div>
        </div>

        <div className="mt-2 sm:mt-3">
          <div className="text-white/80 text-[10px] sm:text-xs">Balance</div>
          <div className="text-lg sm:text-xl font-extrabold leading-tight">
            {(() => {
              const currency = c.currency || 'EUR'
              const valid = ['USD','EUR','UAH','PLN','GBP','CHF','CZK','HUF'].includes(currency)
              const v = Number(c._balance ?? 0)
              if (valid) return new Intl.NumberFormat('uk-UA', { style: 'currency', currency }).format(v)
              return `${v.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ${currency}`
            })()}
          </div>
        </div>

        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <div className="font-mono tracking-wider text-xs sm:text-sm">
              {cardNumber}
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation()
                copyCardNumber()
              }}
              className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition-colors"
              title="Копіювати номер картки"
            >
              <Copy size={12} />
            </button>
          </div>
        </div>

        <div className="absolute bottom-2 sm:bottom-3 right-2 sm:right-3 flex gap-1.5 sm:gap-2">
          <button className="px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-[10px] sm:text-xs inline-flex items-center gap-1" onClick={() => onEdit(c)}>
            <Pencil size={12} /> <span className="hidden sm:inline">Edit</span>
          </button>
          <button className="px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-[10px] sm:text-xs inline-flex items-center gap-1" onClick={() => onDelete(c)}>
            <Trash2 size={12} /> <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function EmptyCard({ onCreate }) {
  return (
    <motion.button onClick={onCreate} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl p-6 text-white shadow-glass w-full"
      style={{ aspectRatio: '1.586 / 1' }}>
      <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500 via-fuchsia-500 to-amber-400" />
      <div className="relative h-full w-full flex flex-col items-center justify-center">
        <div className="h-12 w-12 rounded-2xl bg-white/20 grid place-items-center mb-2"><Plus size={26} /></div>
        <div className="font-semibold">Додати картку</div>
        <div className="text-white/75 text-xs">Натисніть, щоб створити</div>
      </div>
    </motion.button>
  )
}

function CardModal({ open, initial, onClose, onSubmit }) {
  const [form, setForm] = useState(initial || { bank: '', name: '', card_number: '', currency: 'EUR', initial_balance: 0 })
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  useEffect(() => {
    setForm(initial ? {
      bank: initial.bank || '',
      name: initial.name || '',
      card_number: initial.card_number || '',
      currency: initial.currency || 'EUR',
      initial_balance: Number(initial.initial_balance) || 0
    } : { bank:'', name:'', card_number:'', currency:'EUR', initial_balance:0 })
    setFile(null)
    // Show existing image if editing
    setPreviewUrl(initial?.bg_url || null)
  }, [initial, open])

  // Handle file selection and preview
  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0] || null
    setFile(selectedFile)
    
    if (selectedFile) {
      const reader = new FileReader()
      reader.onload = (ev) => setPreviewUrl(ev.target.result)
      reader.readAsDataURL(selectedFile)
    }
  }

  const removeImage = () => {
    setFile(null)
    setPreviewUrl(null)
  }

  const submit = async (e) => {
    e?.preventDefault?.()
    // If no preview and editing, user removed image - pass special flag
    const fileToSubmit = previewUrl === null && initial ? 'REMOVE' : file
    await onSubmit(form, fileToSubmit)
  }

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={initial ? 'Редагувати картку' : 'Нова картка'}
      zIndex={100}
      maxWidth="md"
    >
      <form onSubmit={submit} className="grid gap-3">
              <input className="border rounded-xl px-3 py-2" placeholder="Банк" value={form.bank}
                     onChange={(e)=>setForm({...form, bank:e.target.value})}/>
              <input className="border rounded-xl px-3 py-2" placeholder="Назва картки" value={form.name}
                     onChange={(e)=>setForm({...form, name:e.target.value})}/>
              <input className="border rounded-xl px-3 py-2" placeholder="Номер (опц., можна ****1234)" value={form.card_number}
                     onChange={(e)=>setForm({...form, card_number:e.target.value})}/>
              <div className="grid grid-cols-2 gap-3">
                <select className="border rounded-xl px-3 py-2" value={form.currency} onChange={(e)=>setForm({...form, currency:e.target.value})}>
                  <option>UAH</option><option>EUR</option><option>USD</option><option>GBP</option><option>PLN</option>
                </select>
                <input className="border rounded-xl px-3 py-2" type="number" step="0.01" placeholder="Початковий баланс"
                       value={form.initial_balance} onChange={(e)=>setForm({...form, initial_balance: Number(e.target.value)})}/>
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Фонова картинка (опц.)</label>
                <input type="file" accept="image/*" onChange={handleFileChange} className="text-sm"/>
                
                {previewUrl && (
                  <div className="mt-2 relative">
                    <img 
                      src={previewUrl} 
                      alt="Preview" 
                      className="w-full h-32 object-cover rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600"
                      title="Видалити зображення"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-2 flex gap-2">
                <button className="btn btn-primary flex-1" type="submit">{initial ? 'Зберегти' : 'Додати'}</button>
                <button type="button" className="btn btn-soft" onClick={onClose}>Скасувати</button>
              </div>
            </form>
    </BaseModal>
  )
}

export default function CardsManager() {
  const { preferences, loading: prefsLoading } = usePreferences()
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedBanks, setSelectedBanks] = useState([])
  const [prefsLoaded, setPrefsLoaded] = useState(false)

  // load persisted filter from PreferencesContext
  useEffect(() => {
    if (prefsLoading) return
    try {
      const banks = preferences?.cards?.selectedBanks
      if (Array.isArray(banks)) setSelectedBanks(banks)
    } catch (e) {
      console.error('Failed to load cards preferences:', e)
    } finally {
      setPrefsLoaded(true)
    }
  }, [prefsLoading, preferences])

  // persist filter changes to DB (з debounce)
  useEffect(() => {
    if (!prefsLoaded) return
    
    const timeoutId = setTimeout(() => {
      updatePreferencesSection('cards', {
        selectedBanks
      })
    }, 500) // Debounce 500ms
    
    return () => clearTimeout(timeoutId)
  }, [selectedBanks, prefsLoaded])

  const load = async () => {
    setLoading(true)
    try {
      const base = await listCards()
      // fetch transaction sums grouped by card and merge into card objects as _balance
      let sums = {}
      try {
        sums = await sumTransactionsByCard()
      } catch (e) {
        console.error('sumTransactionsByCard error', e)
      }

      const withBalances = (base || []).map(c => {
        const initial = Number(c.initial_balance || 0)
        const txSum = Number(sums[c.id] || 0)
        const balance = initial + txSum
        return { ...c, _balance: balance }
      })

      setCards(withBalances)
    } catch(e) {
      console.error('listCards error', e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    const off = txBus.subscribe(({ card_id, delta }) => {
      if (!card_id || !delta) return
      setCards(prev => prev.map(c => c.id === card_id ? { ...c, _balance: Number(c._balance || 0) + Number(delta || 0) } : c))
    })
    return off
  }, [])

  const uniqueBanks = useMemo(
    () => Array.from(new Set(cards.map(c => c.bank).filter(Boolean))).sort(),
    [cards]
  )

  const visibleCards = useMemo(() => {
    if (!selectedBanks.length) return cards
    const s = new Set(selectedBanks)
    return cards.filter(c => s.has(c.bank))
  }, [cards, selectedBanks])

  const openCreate = () => { setEditing(null); setModalOpen(true) }
  const openEdit   = (c) => { setEditing(c);   setModalOpen(true) }

  const handleSubmit = async (form, file) => {
    const payload = {
      bank: form.bank, name: form.name, card_number: form.card_number,
      currency: form.currency, initial_balance: Number(form.initial_balance) || 0
    }
    try {
      if (editing) { 
        await updateCard(editing.id, payload, file) 
      }
      else { 
        await createCard({ ...payload, file }) 
      }
      setModalOpen(false); setEditing(null); await load()
    } catch (e) {
      console.error('handleSubmit error', e); alert(e?.message || 'Помилка збереження')
    }
  }

  const handleDelete = async (c) => {
    if (!confirm(`Видалити картку «${c.bank} — ${c.name}»?`)) return
    try {
      await deleteCard(c.id)
      await load()
    } catch (e) {
      console.error('Delete card error:', e)
      alert(`Не вдалося видалити картку: ${e.message || e}`)
    }
  }

  const toggleBank = (bank) => setSelectedBanks(prev => prev.includes(bank) ? prev.filter(b => b !== bank) : [...prev, bank])
  const clearFilter = () => setSelectedBanks([])

return (
  <>
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-5 shadow-soft relative flex flex-col h-auto sm:h-[calc(100vh-2rem)]"
    >
      <div className="flex items-center justify-between mb-4 shrink-0"> {/* ← фіксуємо шапку */}
        <div className="font-semibold">Your cards</div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <motion.button
              className="btn btn-soft text-xs inline-flex items-center gap-1"
              onClick={() => setFilterOpen(v => !v)}
              title="Фільтр за банком"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              animate={{ 
                backgroundColor: selectedBanks.length > 0 ? '#f3f4f6' : undefined,
                borderColor: selectedBanks.length > 0 ? '#d1d5db' : undefined
              }}
              transition={{ duration: 0.2 }}
            >
              <motion.div
                animate={{ rotate: filterOpen ? 180 : 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <Filter size={16} />
              </motion.div>
              Фільтр
              </motion.button>
              <AnimatePresence>
                {filterOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-soft p-3 z-20"
                  >
                    <div className="text-xs font-semibold text-gray-600 mb-2">Банки</div>
                    <div className="max-h-56 overflow-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                      {uniqueBanks.length === 0 ? (
                        <div className="text-xs text-gray-500">Немає банків</div>
                      ) : uniqueBanks.map(b => (
                        <label key={b} className="flex items-center gap-2 py-1 text-sm">
                          <input
                            type="checkbox"
                            className="accent-black"
                            checked={selectedBanks.includes(b)}
                            onChange={() => toggleBank(b)}
                          />
                          <span>{b}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <button className="text-xs text-gray-600 hover:underline" onClick={clearFilter}>
                        Показати всі банки
                      </button>
                      <button className="btn btn-primary text-xs py-1 px-3" onClick={() => setFilterOpen(false)}>
                        Готово
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
          </div>

          <button onClick={openCreate} className="btn btn-soft text-xs inline-flex items-center gap-1" title="Додати картку">
            <Plus size={16} /> Додати
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : visibleCards.length === 0 ? (
        cards.length === 0 ? (
          <EmptyCard onCreate={openCreate} />
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600">
            За обраними банками нічого не знайдено.
            <button className="ml-2 underline" onClick={clearFilter}>Показати всі банки</button>
          </div>
        )
      ) : (
        // ← робимо скрольним ТІЛЬКИ список карточок
        <div className="flex-1 overflow-y-auto overflow-x-hidden -mx-5 -mb-5
                        [scrollbar-width:none] [-ms-overflow-style:none]
                        [&::-webkit-scrollbar]:hidden">
          <div className="space-y-4 px-5 pb-5"> {/* паддінг для карточок */}
            {visibleCards.map(c => (
              <CardTile key={c.id} c={c} onEdit={openEdit} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}
    </motion.div>

    <CardModal
      open={modalOpen}
      initial={editing}
      onClose={() => { setModalOpen(false); setEditing(null) }}
      onSubmit={handleSubmit}
    />
  </>
)

}
