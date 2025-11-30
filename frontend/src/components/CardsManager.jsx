import { supabase } from '../lib/supabase'
import { useEffect, useMemo, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { listCards, createCard, updateCard, deleteCard } from '../api/cards'
import { listBanks, createBank, updateBank, deleteBank } from '../api/banks'
import { sumTransactionsByCard } from '../api/transactions'
import { CreditCard, Plus, X, Pencil, Trash2, Filter, Copy, Building2, Star, Eye } from 'lucide-react'
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

function SortableCardTile({ c, onEdit, onDelete, showActions = true, isFavorite = false, onToggleFavorite, onViewBank }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: c.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners}
      className={isDragging ? 'cursor-grabbing' : 'cursor-grab'}
    >
      <CardTile 
        c={c} 
        onEdit={onEdit} 
        onDelete={onDelete} 
        showActions={showActions}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        isDragging={isDragging}
        onViewBank={onViewBank}
      />
    </div>
  )
}

function CardTile({ c, onEdit, onDelete, showActions = true, isFavorite = false, onToggleFavorite, isDragging = false, isGrouped = false, onViewBank }) {
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
      animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl text-white shadow-glass ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{
        aspectRatio: isGrouped ? '1.586 / 1.08' : '1.586 / 1',
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
          {/* Зірочка вгорі справа */}
          {onToggleFavorite && (
            <button 
              className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                isFavorite 
                  ? 'bg-yellow-500/90 hover:bg-yellow-500 shadow-lg' 
                  : 'bg-black/40 hover:bg-black/50 backdrop-blur-sm'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                onToggleFavorite(c.id)
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title={isFavorite ? 'Прибрати з вибраних' : 'Додати до вибраних'}
            >
              <Star 
                size={14} 
                className={isFavorite ? 'fill-white text-white' : 'text-white'} 
              />
            </button>
          )}
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
                e.preventDefault()
                copyCardNumber()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition-colors"
              title="Копіювати номер картки"
            >
              <Copy size={12} />
            </button>
          </div>
        </div>

        {/* Кнопки внизу справа */}
        <div className="absolute bottom-2 sm:bottom-3 right-2 sm:right-3 flex gap-1.5 sm:gap-2">
          {onViewBank && c.bank_id && (
            <button 
              className="px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-[10px] sm:text-xs inline-flex items-center gap-1" 
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                onViewBank(c.bank_id)
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="Переглянути банк"
            >
              <Eye size={12} /> <span className="hidden sm:inline">View Bank</span>
            </button>
          )}
          {showActions && (
            <>
              <button 
                className="px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-[10px] sm:text-xs inline-flex items-center gap-1" 
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onEdit(c)
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Pencil size={12} /> <span className="hidden sm:inline">Edit</span>
              </button>
              <button 
                className="px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-[10px] sm:text-xs inline-flex items-center gap-1" 
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onDelete(c)
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Trash2 size={12} /> <span className="hidden sm:inline">Delete</span>
              </button>
            </>
          )}
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

function BankModal({ open, initial, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: '', iban: '', bic: '', beneficiary: '' })

  useEffect(() => {
    setForm(initial ? {
      name: initial.name || '',
      iban: initial.iban || '',
      bic: initial.bic || '',
      beneficiary: initial.beneficiary || ''
    } : { name: '', iban: '', bic: '', beneficiary: '' })
  }, [initial, open])

  const submit = async (e) => {
    e?.preventDefault?.()
    if (!form.name.trim()) {
      toast.error('Введіть назву банку')
      return
    }
    await onSubmit(form)
  }

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={initial ? 'Редагувати банк' : 'Новий банк'}
      zIndex={100}
      maxWidth="md"
    >
      <form onSubmit={submit} className="grid gap-3">
        <input 
          className="border rounded-xl px-3 py-2" 
          placeholder="Назва банку *" 
          value={form.name}
          onChange={(e)=>setForm({...form, name:e.target.value})}
          required
        />
        <input 
          className="border rounded-xl px-3 py-2" 
          placeholder="IBAN (опц.)" 
          value={form.iban}
          onChange={(e)=>setForm({...form, iban:e.target.value})}
        />
        <div className="grid grid-cols-2 gap-3">
          <input 
            className="border rounded-xl px-3 py-2" 
            placeholder="BIC/SWIFT/ЄДРПОУ (опц.)" 
            value={form.bic}
            onChange={(e)=>setForm({...form, bic:e.target.value.toUpperCase()})}
            maxLength={11}
          />
          <input 
            className="border rounded-xl px-3 py-2" 
            placeholder="Бенефіціар (опц.)" 
            value={form.beneficiary}
            onChange={(e)=>setForm({...form, beneficiary:e.target.value})}
          />
        </div>
        <div className="mt-2 flex gap-2">
          <button className="btn btn-primary flex-1" type="submit">{initial ? 'Зберегти' : 'Додати'}</button>
          <button type="button" className="btn btn-soft" onClick={onClose}>Скасувати</button>
        </div>
      </form>
    </BaseModal>
  )
}

function CardModal({ open, initial, onClose, onSubmit, banks = [] }) {
  const [form, setForm] = useState({ bank_id: '', name: '', card_number: '', currency: 'EUR', initial_balance: 0, expiry_date: '', cvv: '' })
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  useEffect(() => {
    setForm(initial ? {
      bank_id: initial.bank_id || '',
      name: initial.name || '',
      card_number: initial.card_number || '',
      currency: initial.currency || 'EUR',
      initial_balance: Number(initial.initial_balance) || 0,
      expiry_date: initial.expiry_date || '',
      cvv: initial.cvv || ''
    } : { bank_id: '', name: '', card_number: '', currency: 'EUR', initial_balance: 0, expiry_date: '', cvv: '' })
    setFile(null)
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
        {banks.length > 0 && (
          <select 
            className="border rounded-xl px-3 py-2" 
            value={form.bank_id} 
            onChange={(e)=>setForm({...form, bank_id:e.target.value})}
          >
            <option value="">Виберіть банк (опц.)</option>
            {banks.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        <input 
          className="border rounded-xl px-3 py-2" 
          placeholder="Назва картки *" 
          value={form.name}
          onChange={(e)=>setForm({...form, name:e.target.value})}
          required
        />
        <input 
          className="border rounded-xl px-3 py-2" 
          placeholder="Номер картки (опц., можна ****1234)" 
          value={form.card_number}
          onChange={(e)=>setForm({...form, card_number:e.target.value})}
        />
        <div className="grid grid-cols-2 gap-3">
          <select 
            className="border rounded-xl px-3 py-2" 
            value={form.currency} 
            onChange={(e)=>setForm({...form, currency:e.target.value})}
          >
            <option>UAH</option><option>EUR</option><option>USD</option><option>GBP</option><option>PLN</option>
          </select>
          <input 
            className="border rounded-xl px-3 py-2" 
            type="number" 
            step="0.01" 
            placeholder="Початковий баланс"
            value={form.initial_balance} 
            onChange={(e)=>setForm({...form, initial_balance: Number(e.target.value)})}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input 
            className="border rounded-xl px-3 py-2" 
            placeholder="Термін дії (MM/YYYY)" 
            value={form.expiry_date}
            onChange={(e)=>setForm({...form, expiry_date:e.target.value})}
            maxLength={7}
          />
          <input 
            className="border rounded-xl px-3 py-2" 
            type="password"
            placeholder="CVV (опц.)" 
            value={form.cvv}
            onChange={(e)=>setForm({...form, cvv:e.target.value.replace(/\D/g, '').slice(0, 4)})}
            maxLength={4}
          />
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

export default function CardsManager({ groupByBank = false, showActions = true }) {
  const { preferences, loading: prefsLoading } = usePreferences()
  const [cards, setCards] = useState([])
  const [banks, setBanks] = useState([])
  const [loading, setLoading] = useState(true)
  const [cardModalOpen, setCardModalOpen] = useState(false)
  const [bankModalOpen, setBankModalOpen] = useState(false)
  const [editingCard, setEditingCard] = useState(null)
  const [editingBank, setEditingBank] = useState(null)

  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedBanks, setSelectedBanks] = useState([])
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [favoriteCardIds, setFavoriteCardIds] = useState([])
  const [cardOrder, setCardOrder] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [bankViewModalOpen, setBankViewModalOpen] = useState(false)
  const [viewingBank, setViewingBank] = useState(null)
  
  // Зберігаємо останні збережені значення для порівняння
  const lastSavedCardsPrefsRef = useRef(null)
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // load persisted filter from PreferencesContext
  useEffect(() => {
    if (prefsLoading) return
    try {
      const banks = preferences?.cards?.selectedBanks
      if (Array.isArray(banks)) setSelectedBanks(banks)
      
      const favorites = preferences?.cards?.favoriteCardIds
      if (Array.isArray(favorites)) setFavoriteCardIds(favorites)
      
      const order = preferences?.cards?.cardOrder
      if (Array.isArray(order)) setCardOrder(order)
      
      const showFavorites = preferences?.cards?.showFavoritesOnly
      if (typeof showFavorites === 'boolean') setShowFavoritesOnly(showFavorites)
      
      // Зберігаємо початкові значення для порівняння
      lastSavedCardsPrefsRef.current = {
        selectedBanks: Array.isArray(banks) ? banks : [],
        favoriteCardIds: Array.isArray(favorites) ? favorites : [],
        cardOrder: Array.isArray(order) ? order : [],
        showFavoritesOnly: typeof showFavorites === 'boolean' ? showFavorites : false
      }
    } catch (e) {
      console.error('Failed to load cards preferences:', e)
    } finally {
      setPrefsLoaded(true)
    }
  }, [prefsLoading, preferences])

  // persist filter changes to DB (з debounce) - тільки якщо значення дійсно змінилося
  useEffect(() => {
    if (!prefsLoaded || !lastSavedCardsPrefsRef.current) return
    
    // Перевіряємо, чи значення дійсно змінилося від збереженого
    const currentPrefs = {
      selectedBanks,
      favoriteCardIds,
      cardOrder,
      showFavoritesOnly
    }
    
    const lastSaved = lastSavedCardsPrefsRef.current
    
    // Порівнюємо масиви та булеві значення
    const arraysEqual = (a, b) => {
      if (a.length !== b.length) return false
      return a.every((val, idx) => val === b[idx])
    }
    
    if (
      arraysEqual(currentPrefs.selectedBanks, lastSaved.selectedBanks) &&
      arraysEqual(currentPrefs.favoriteCardIds, lastSaved.favoriteCardIds) &&
      arraysEqual(currentPrefs.cardOrder, lastSaved.cardOrder) &&
      currentPrefs.showFavoritesOnly === lastSaved.showFavoritesOnly
    ) {
      return // Нічого не змінилося, не записуємо
    }
    
    // Оновлюємо збережені значення
    lastSavedCardsPrefsRef.current = {
      selectedBanks: [...currentPrefs.selectedBanks],
      favoriteCardIds: [...currentPrefs.favoriteCardIds],
      cardOrder: [...currentPrefs.cardOrder],
      showFavoritesOnly: currentPrefs.showFavoritesOnly
    }
    
    // Зберігаємо тільки якщо це дійсно зміна користувача
    const timeoutId = setTimeout(() => {
      updatePreferencesSection('cards', currentPrefs)
    }, 500) // Debounce 500ms
    
    return () => clearTimeout(timeoutId)
  }, [selectedBanks, favoriteCardIds, cardOrder, showFavoritesOnly, prefsLoaded])

  const load = async () => {
    setLoading(true)
    try {
      const [baseCards, baseBanks] = await Promise.all([
        listCards(),
        listBanks() // Завжди завантажуємо банки, щоб можна було показувати інформацію на дашборді
      ])
      
      setBanks(baseBanks || [])
      
      // fetch transaction sums grouped by card and merge into card objects as _balance
      let sums = {}
      try {
        sums = await sumTransactionsByCard()
      } catch (e) {
        console.error('sumTransactionsByCard error', e)
      }

      const withBalances = (baseCards || []).map(c => {
        const initial = Number(c.initial_balance || 0)
        const txSum = Number(sums[c.id] || 0)
        const balance = initial + txSum
        return { ...c, _balance: balance }
      })

      setCards(withBalances)
    } catch(e) {
      console.error('load error', e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [groupByBank])

  useEffect(() => {
    const off = txBus.subscribe(({ card_id, delta }) => {
      if (!card_id || !delta) return
      setCards(prev => prev.map(c => c.id === card_id ? { ...c, _balance: Number(c._balance || 0) + Number(delta || 0) } : c))
    })
    return off
  }, [])

  // Для дашборду - унікальні банки з карток
  const uniqueBanks = useMemo(
    () => Array.from(new Set(cards.map(c => c.bank).filter(Boolean))).sort(),
    [cards]
  )
  
  // Для сторінки з картами - банки з таблиці banks
  const banksForCards = useMemo(() => {
    if (!groupByBank) return []
    return banks
  }, [banks, groupByBank])

  const visibleCards = useMemo(() => {
    let filtered = cards
    
    // Фільтр по банках
    if (selectedBanks.length > 0) {
      const s = new Set(selectedBanks)
      filtered = filtered.filter(c => s.has(c.bank))
    }
    
    // Фільтр "Вибрані"
    if (showFavoritesOnly) {
      const favoritesSet = new Set(favoriteCardIds)
      filtered = filtered.filter(c => favoritesSet.has(c.id))
    }
    
    // Сортування за збереженим порядком
    if (cardOrder.length > 0 && !showActions) {
      const orderMap = new Map(cardOrder.map((id, index) => [id, index]))
      filtered.sort((a, b) => {
        const aIndex = orderMap.get(a.id) ?? Infinity
        const bIndex = orderMap.get(b.id) ?? Infinity
        return aIndex - bIndex
      })
    }
    
    return filtered
  }, [cards, selectedBanks, showFavoritesOnly, favoriteCardIds, cardOrder, showActions])

  // Групуємо карти по банках (тільки для режиму groupByBank)
  const cardsByBank = useMemo(() => {
    if (!groupByBank) return []
    
    // Групуємо карти по bank_id
    const grouped = {}
    const cardsToShow = selectedBanks.length 
      ? cards.filter(c => {
          const bankName = banks.find(b => b.id === c.bank_id)?.name || c.bank
          return selectedBanks.includes(bankName)
        })
      : cards
    
    // Спочатку додаємо всі банки з таблиці banks
    banks.forEach(bank => {
      grouped[bank.id] = {
        bankId: bank.id,
        bank: bank.name,
        cards: [],
        iban: bank.iban,
        bic: bank.bic,
        beneficiary: bank.beneficiary,
        expiryDates: [],
        cvvs: []
      }
    })
    
    // Потім додаємо карти до відповідних банків
    cardsToShow.forEach(card => {
      const bankId = card.bank_id
      if (bankId && grouped[bankId]) {
        grouped[bankId].cards.push(card)
        if (card.expiry_date) grouped[bankId].expiryDates.push(card.expiry_date)
        if (card.cvv) grouped[bankId].cvvs.push(card.cvv)
      } else {
        // Карти без bank_id
        const bankName = card.bank || 'Інші'
        if (!grouped[bankName]) {
          grouped[bankName] = {
            bankId: null,
            bank: bankName,
            cards: [],
            iban: null,
            bic: null,
            beneficiary: null,
            expiryDates: [],
            cvvs: []
          }
        }
        grouped[bankName].cards.push(card)
        if (card.expiry_date) grouped[bankName].expiryDates.push(card.expiry_date)
        if (card.cvv) grouped[bankName].cvvs.push(card.cvv)
      }
    })
    
    const result = Object.values(grouped)
      .filter(g => g.cards.length > 0 || groupByBank) // Показуємо банки навіть без карток на сторінці з картами
    
    // Сортуємо: спочатку банки з картками (по алфавіту), потім без карток (по алфавіту)
    return result.sort((a, b) => {
      const aHasCards = a.cards.length > 0
      const bHasCards = b.cards.length > 0
      
      if (aHasCards && !bHasCards) return -1
      if (!aHasCards && bHasCards) return 1
      
      // Якщо обидва з картками або обидва без - сортуємо по алфавіту
      return a.bank.localeCompare(b.bank)
    })
  }, [cards, banks, selectedBanks, groupByBank])

  const openCreateCard = (bankId = null) => { 
    setEditingCard({ bank_id: bankId }); 
    setCardModalOpen(true) 
  }
  const openEditCard = (c) => { 
    setEditingCard(c); 
    setCardModalOpen(true) 
  }
  const openCreateBank = () => { 
    setEditingBank(null); 
    setBankModalOpen(true) 
  }
  const openEditBank = (b) => { 
    setEditingBank(b); 
    setBankModalOpen(true) 
  }

  const handleCardSubmit = async (form, file) => {
    const payload = {
      bank_id: form.bank_id || null,
      name: form.name, 
      card_number: form.card_number || null,
      currency: form.currency, 
      initial_balance: Number(form.initial_balance) || 0,
      expiry_date: form.expiry_date || null, 
      cvv: form.cvv || null
    }
    try {
      if (editingCard?.id) { 
        await updateCard(editingCard.id, payload, file) 
      }
      else { 
        await createCard({ ...payload, file }) 
      }
      setCardModalOpen(false); setEditingCard(null); await load()
      toast.success(editingCard?.id ? 'Картку оновлено' : 'Картку створено')
    } catch (e) {
      console.error('handleCardSubmit error', e)
      toast.error(e?.message || 'Помилка збереження картки')
    }
  }

  const handleBankSubmit = async (form) => {
    const payload = {
      name: form.name,
      iban: form.iban || null,
      bic: form.bic || null,
      beneficiary: form.beneficiary || null
    }
    try {
      if (editingBank?.id) { 
        await updateBank(editingBank.id, payload) 
      }
      else { 
        await createBank(payload) 
      }
      setBankModalOpen(false); setEditingBank(null); await load()
      toast.success(editingBank?.id ? 'Банк оновлено' : 'Банк створено')
    } catch (e) {
      console.error('handleBankSubmit error', e)
      toast.error(e?.message || 'Помилка збереження банку')
    }
  }

  const handleDeleteCard = async (c) => {
    if (!confirm(`Видалити картку «${c.name}»?`)) return
    try {
      await deleteCard(c.id)
      await load()
      toast.success('Картку видалено')
    } catch (e) {
      console.error('Delete card error:', e)
      toast.error(`Не вдалося видалити картку: ${e.message || e}`)
    }
  }

  const handleDeleteBank = async (b) => {
    if (!confirm(`Видалити банк «${b.name}»?`)) return
    try {
      await deleteBank(b.id)
      await load()
      toast.success('Банк видалено')
    } catch (e) {
      console.error('Delete bank error:', e)
      toast.error(e?.message || 'Не вдалося видалити банк')
    }
  }

  const toggleBank = (bank) => setSelectedBanks(prev => prev.includes(bank) ? prev.filter(b => b !== bank) : [...prev, bank])
  const clearFilter = () => {
    setSelectedBanks([])
    setShowFavoritesOnly(false)
  }
  
  const toggleFavorite = (cardId) => {
    setFavoriteCardIds(prev => {
      const newFavorites = prev.includes(cardId) 
        ? prev.filter(id => id !== cardId)
        : [...prev, cardId]
      return newFavorites
    })
  }
  
  const handleViewBank = (bankId) => {
    const bank = banks.find(b => b.id === bankId)
    if (bank) {
      setViewingBank(bank)
      setBankViewModalOpen(true)
    }
  }
  
  const handleDragStart = (event) => {
    setActiveId(event.active.id)
  }
  
  const handleDragEnd = (event) => {
    const { active, over } = event
    
    if (over && active.id !== over.id) {
      const oldIndex = visibleCards.findIndex(c => c.id === active.id)
      const newIndex = visibleCards.findIndex(c => c.id === over.id)
      
      const reorderedCards = arrayMove(visibleCards, oldIndex, newIndex)
      const newOrder = reorderedCards.map(c => c.id)
      setCardOrder(newOrder)
    }
    
    setActiveId(null)
  }
  
  const handleDragCancel = () => {
    setActiveId(null)
  }

return (
  <>
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-3 sm:p-5 shadow-soft relative flex flex-col h-auto sm:h-[calc(100vh-2rem)]"
    >
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="font-semibold">Your cards</div>
        <div className="flex items-center gap-2">
          {/* Фільтри для дашборду (showActions=false) */}
          {!showActions && (
            <>
              <div className="relative">
                <motion.button
                  className={`btn btn-soft text-xs inline-flex items-center gap-1 ${showFavoritesOnly ? 'bg-gray-100 border-gray-300' : ''}`}
                  onClick={() => setShowFavoritesOnly(v => !v)}
                  title="Показати тільки вибрані"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Star size={14} className={showFavoritesOnly ? 'fill-yellow-400 text-yellow-400' : ''} />
                  Вибрані
                </motion.button>
              </div>
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
                          Показати всі
                        </button>
                        <button className="btn btn-primary text-xs py-1 px-3" onClick={() => setFilterOpen(false)}>
                          Готово
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
          
          {/* Кнопки для сторінки з картами (showActions=true) */}
          {showActions && (
            <>
              {groupByBank && (
                <button 
                  onClick={openCreateBank} 
                  className="btn btn-primary text-xs inline-flex items-center gap-1.5 px-3 py-1.5" 
                  title="Додати банк"
                >
                  <Building2 size={16} /> Додати банк
                </button>
              )}
              {!groupByBank && (
                <button onClick={() => openCreateCard()} className="btn btn-soft text-xs inline-flex items-center gap-1" title="Додати картку">
                  <Plus size={16} /> Додати
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : groupByBank ? (
        // Режим з групуванням по банках (для сторінки з картами)
        !cardsByBank || cardsByBank.length === 0 ? (
          cards.length === 0 && banks.length === 0 ? (
            <EmptyCard onCreate={() => openCreateBank()} />
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
            <div className="space-y-6 px-5 pb-5"> {/* паддінг для карточок */}
              {cardsByBank.map(({ bankId, bank, cards: bankCards, iban, bic, beneficiary, expiryDates, cvvs }) => (
                <div key={bankId || bank} className="bg-white rounded-2xl border-2 border-gray-200 shadow-md overflow-hidden">
                  <div className="space-y-4 p-5">
                  {/* Заголовок банку з реквізитами */}
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 sm:p-5 border border-gray-200">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-3 sm:mb-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                          <Building2 size={18} className="sm:w-5 sm:h-5 text-gray-700" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-lg sm:text-xl text-gray-900 truncate">{bank}</div>
                          {bankCards.length > 0 && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              {bankCards.length} {bankCards.length === 1 ? 'картка' : bankCards.length < 5 ? 'картки' : 'карток'}
                            </div>
                          )}
                        </div>
                      </div>
                      {showActions && bankId && (
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <button
                            onClick={() => openEditBank(banks.find(b => b.id === bankId))}
                            className="p-1.5 sm:p-2 rounded-xl hover:bg-white/80 transition-colors border border-gray-200"
                            title="Редагувати банк"
                          >
                            <Pencil size={14} className="sm:w-4 sm:h-4 text-gray-600" />
                          </button>
                          <button
                            onClick={() => handleDeleteBank(banks.find(b => b.id === bankId))}
                            className="p-1.5 sm:p-2 rounded-xl hover:bg-red-50 transition-colors border border-red-200"
                            title="Видалити банк"
                          >
                            <Trash2 size={14} className="sm:w-4 sm:h-4 text-red-600" />
                          </button>
                          <button
                            onClick={() => openCreateCard(bankId)}
                            className="btn btn-primary text-xs inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 shadow-sm"
                            title="Додати картку"
                          >
                            <Plus size={14} className="sm:w-4 sm:h-4" />
                            <span className="hidden sm:inline">Додати картку</span>
                            <span className="sm:hidden">Додати</span>
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* Реквізити */}
                    {(iban || bic || beneficiary || expiryDates.length > 0 || cvvs.length > 0) && (
                      <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-300 space-y-2 sm:space-y-2.5 text-xs sm:text-sm">
                        {iban && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600 font-medium">IBAN:</span>
                            <span className="font-mono">{iban}</span>
                            <button
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(iban)
                                  toast.success('IBAN скопійовано')
                                } catch (e) {
                                  toast.error('Не вдалося скопіювати')
                                }
                              }}
                              className="p-1 rounded hover:bg-gray-200 transition-colors"
                              title="Копіювати IBAN"
                            >
                              <Copy size={14} className="text-gray-600" />
                            </button>
                          </div>
                        )}
                        
                        {bic && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600 font-medium">BIC/SWIFT/ЄДРПОУ:</span>
                            <span className="font-mono">{bic}</span>
                            <button
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(bic)
                                  toast.success('BIC скопійовано')
                                } catch (e) {
                                  toast.error('Не вдалося скопіювати')
                                }
                              }}
                              className="p-1 rounded hover:bg-gray-200 transition-colors"
                              title="Копіювати BIC"
                            >
                              <Copy size={14} className="text-gray-600" />
                            </button>
                          </div>
                        )}
                        
                        {beneficiary && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600 font-medium">Бенефіціар:</span>
                            <span>{beneficiary}</span>
                            <button
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(beneficiary)
                                  toast.success('Бенефіціар скопійовано')
                                } catch (e) {
                                  toast.error('Не вдалося скопіювати')
                                }
                              }}
                              className="p-1 rounded hover:bg-gray-200 transition-colors"
                              title="Копіювати бенефіціар"
                            >
                              <Copy size={14} className="text-gray-600" />
                            </button>
                          </div>
                        )}
                        
                        {expiryDates.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-gray-600 font-medium">Терміни дії:</span>
                            {expiryDates.map((exp, idx) => (
                              <span key={idx} className="font-mono bg-white px-2 py-1 rounded border">{exp}</span>
                            ))}
                          </div>
                        )}
                        
                        {cvvs.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-gray-600 font-medium">CVV:</span>
                            {cvvs.map((cvv, idx) => (
                              <span key={idx} className="font-mono bg-white px-2 py-1 rounded border">***</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                    
                    {/* Картки банку */}
                    {bankCards.length > 0 ? (
                      <div className="mt-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 sm:mb-3 px-1">
                          Картки
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                          {bankCards.map(c => (
                            <CardTile 
                              key={c.id} 
                              c={c} 
                              onEdit={openEditCard} 
                              onDelete={handleDeleteCard} 
                              showActions={showActions}
                              isFavorite={favoriteCardIds.includes(c.id)}
                              onToggleFavorite={undefined}
                              isGrouped={true}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      showActions && (
                        <div className="mt-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 p-6 text-center">
                          <div className="text-sm text-gray-500 mb-2">
                            Немає карток у цьому банку
                          </div>
                          <button 
                            onClick={() => openCreateCard(bankId)} 
                            className="btn btn-soft text-xs inline-flex items-center gap-1.5 px-3 py-1.5"
                          >
                            <Plus size={14} /> Додати картку
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        // Стандартний режим (для дашборду) - без групування
        <div className="flex-1 overflow-y-auto overflow-x-hidden -mx-5 -mb-5
                        [scrollbar-width:none] [-ms-overflow-style:none]
                        [&::-webkit-scrollbar]:hidden">
          {!showActions ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext
                items={visibleCards.map(c => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4 px-5 pb-5">
                  {visibleCards.length === 0 ? (
                    <div className="text-center text-sm text-gray-500 py-8">
                      {showFavoritesOnly ? 'Немає вибраних карток' : 'Немає карток'}
                    </div>
                  ) : (
                    visibleCards.map(c => (
                      <SortableCardTile
                        key={c.id}
                        c={c}
                        onEdit={openEditCard}
                        onDelete={handleDeleteCard}
                        showActions={showActions}
                        isFavorite={favoriteCardIds.includes(c.id)}
                        onToggleFavorite={toggleFavorite}
                        onViewBank={handleViewBank}
                      />
                    ))
                  )}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeId ? (() => {
                  const activeCard = visibleCards.find(c => c.id === activeId)
                  if (!activeCard) return null
                  return (
                    <div className="opacity-90 scale-105">
                      <CardTile
                        c={activeCard}
                        onEdit={openEditCard}
                        onDelete={handleDeleteCard}
                        showActions={showActions}
                        isFavorite={favoriteCardIds.includes(activeId)}
                        onToggleFavorite={toggleFavorite}
                        isDragging={true}
                        onViewBank={handleViewBank}
                      />
                    </div>
                  )
                })() : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <div className="space-y-4 px-5 pb-5">
              {visibleCards.length === 0 ? (
                <div className="text-center text-sm text-gray-500 py-8">
                  {showFavoritesOnly ? 'Немає вибраних карток' : 'Немає карток'}
                </div>
              ) : (
                  visibleCards.map(c => (
                    <CardTile
                      key={c.id}
                      c={c}
                      onEdit={openEditCard}
                      onDelete={handleDeleteCard}
                      showActions={showActions}
                      isFavorite={favoriteCardIds.includes(c.id)}
                      onToggleFavorite={undefined}
                      onViewBank={handleViewBank}
                    />
                  ))
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>

    <CardModal
      open={cardModalOpen}
      initial={editingCard}
      banks={banksForCards}
      onClose={() => { setCardModalOpen(false); setEditingCard(null) }}
      onSubmit={handleCardSubmit}
    />
    
    {groupByBank && (
      <BankModal
        open={bankModalOpen}
        initial={editingBank}
        onClose={() => { setBankModalOpen(false); setEditingBank(null) }}
        onSubmit={handleBankSubmit}
      />
    )}
    
    {/* Модалка для перегляду банку */}
    <BaseModal
      open={bankViewModalOpen}
      onClose={() => { setBankViewModalOpen(false); setViewingBank(null) }}
      title={
        <div className="flex items-center gap-2">
          <Building2 size={20} />
          <span>Інформація про банк</span>
        </div>
      }
      maxWidth="md"
    >
      {viewingBank && (
        <div className="space-y-4">
          <div className="pb-3 border-b border-gray-200">
            <h3 className="text-xl font-bold text-gray-900">{viewingBank.name}</h3>
          </div>
          
          {(viewingBank.iban || viewingBank.bic || viewingBank.beneficiary) ? (
            <div className="space-y-4">
              {viewingBank.iban && (
                <div>
                  <div className="text-sm text-gray-600 font-medium mb-1.5">IBAN</div>
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="font-mono text-sm break-all flex-1">{viewingBank.iban}</span>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(viewingBank.iban)
                          toast.success('IBAN скопійовано')
                        } catch (e) {
                          toast.error('Не вдалося скопіювати')
                        }
                      }}
                      className="p-2 rounded-lg hover:bg-gray-200 transition-colors flex-shrink-0"
                      title="Копіювати IBAN"
                    >
                      <Copy size={16} className="text-gray-600" />
                    </button>
                  </div>
                </div>
              )}
              
              {viewingBank.bic && (
                <div>
                  <div className="text-sm text-gray-600 font-medium mb-1.5">BIC/SWIFT/ЄДРПОУ</div>
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="font-mono text-sm break-all flex-1">{viewingBank.bic}</span>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(viewingBank.bic)
                          toast.success('BIC скопійовано')
                        } catch (e) {
                          toast.error('Не вдалося скопіювати')
                        }
                      }}
                      className="p-2 rounded-lg hover:bg-gray-200 transition-colors flex-shrink-0"
                      title="Копіювати BIC"
                    >
                      <Copy size={16} className="text-gray-600" />
                    </button>
                  </div>
                </div>
              )}
              
              {viewingBank.beneficiary && (
                <div>
                  <div className="text-sm text-gray-600 font-medium mb-1.5">Бенефіціар</div>
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="text-sm break-all flex-1">{viewingBank.beneficiary}</span>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(viewingBank.beneficiary)
                          toast.success('Бенефіціар скопійовано')
                        } catch (e) {
                          toast.error('Не вдалося скопіювати')
                        }
                      }}
                      className="p-2 rounded-lg hover:bg-gray-200 transition-colors flex-shrink-0"
                      title="Копіювати бенефіціар"
                    >
                      <Copy size={16} className="text-gray-600" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500 text-center py-8">
              Реквізити не додано
            </div>
          )}
        </div>
      )}
    </BaseModal>
  </>
)

}
