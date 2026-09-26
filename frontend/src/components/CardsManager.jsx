import { useEffect, useMemo, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Filter, Star } from 'lucide-react'
import { listCards } from '../api/cards'
import { sumTransactionsByCard } from '../api/transactions'
import { invalidateSumByCardCache } from '../utils/dataCache'
import { txBus } from '../utils/txBus'
import { useSettingsStore } from '../store/useSettingsStore'
import useMonoRates from '../hooks/useMonoRates'
import { usePrimaryCurrency } from '../utils/primaryCurrency'
import CardTransactionsDrawer from './transactions/CardTransactionsDrawer'
import WalletCard from './cards/WalletCard'

function SortableWalletCard({ id, ...props }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
      {...listeners}
      className={isDragging ? 'cursor-grabbing' : ''}
    >
      <WalletCard {...props} />
    </div>
  )
}

/**
 * Home, right column: "Ваші картки" — the cards drawn like on the iPhone Home carousel.
 * Favorites, a bank filter and the drag-to-reorder order are kept in the settings (settings.cards).
 */
export default function CardsManager() {
  const settings = useSettingsStore((state) => state.settings)
  const updateNestedSetting = useSettingsStore((state) => state.updateNestedSetting)
  const initialized = useSettingsStore((state) => state.initialized)
  const hidden = useSettingsStore((state) => state.settings?.hideAllBalances ?? false)
  const primary = usePrimaryCurrency()
  const rates = useMonoRates()

  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedBanks, setSelectedBanks] = useState([])
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [favoriteCardIds, setFavoriteCardIds] = useState([])
  const [cardOrder, setCardOrder] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [selectedCard, setSelectedCard] = useState(null) // for CardTransactionsDrawer

  // Last saved values, so unchanged prefs aren't written again
  const lastSavedCardsPrefsRef = useRef(null)
  const [prefsLoaded, setPrefsLoaded] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Load the saved filter, favorites and order
  useEffect(() => {
    if (!initialized || !settings) return
    try {
      const banks = settings?.cards?.selectedBanks
      if (Array.isArray(banks)) setSelectedBanks(banks)
      const favorites = settings?.cards?.favoriteCardIds
      if (Array.isArray(favorites)) setFavoriteCardIds(favorites)
      const order = settings?.cards?.cardOrder
      if (Array.isArray(order)) setCardOrder(order)
      const showFavorites = settings?.cards?.showFavoritesOnly
      if (typeof showFavorites === 'boolean') setShowFavoritesOnly(showFavorites)

      lastSavedCardsPrefsRef.current = {
        selectedBanks: Array.isArray(banks) ? banks : [],
        favoriteCardIds: Array.isArray(favorites) ? favorites : [],
        cardOrder: Array.isArray(order) ? order : [],
        showFavoritesOnly: typeof showFavorites === 'boolean' ? showFavorites : false,
      }
    } catch (e) {
      console.error('Failed to load cards preferences:', e)
    } finally {
      setPrefsLoaded(true)
    }
  }, [initialized, settings])

  // Save them when they really change (the store debounces the write)
  useEffect(() => {
    if (!prefsLoaded || !lastSavedCardsPrefsRef.current) return
    const current = { selectedBanks, favoriteCardIds, cardOrder, showFavoritesOnly }
    const last = lastSavedCardsPrefsRef.current
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
    if (
      same(current.selectedBanks, last.selectedBanks) &&
      same(current.favoriteCardIds, last.favoriteCardIds) &&
      same(current.cardOrder, last.cardOrder) &&
      current.showFavoritesOnly === last.showFavoritesOnly
    ) return
    lastSavedCardsPrefsRef.current = {
      selectedBanks: [...selectedBanks],
      favoriteCardIds: [...favoriteCardIds],
      cardOrder: [...cardOrder],
      showFavoritesOnly,
    }
    updateNestedSetting('cards', current)
  }, [selectedBanks, favoriteCardIds, cardOrder, showFavoritesOnly, prefsLoaded, updateNestedSetting])

  const withBalances = (list, sums) =>
    (list || []).map(c => ({ ...c, _balance: Number(c.initial_balance || 0) + Number(sums[c.id] || 0) }))

  useEffect(() => {
    const load = async () => {
      try {
        const list = await listCards()
        let sums = {}
        try {
          sums = await sumTransactionsByCard()
        } catch (e) {
          console.error('sumTransactionsByCard error', e)
        }
        setCards(withBalances(list, sums))
      } catch (e) {
        console.error('load error', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Balances follow transaction changes: a quick delta first, then the server's numbers
  useEffect(() => {
    const off = txBus.subscribe(({ card_id, delta, type }) => {
      if (card_id && delta) {
        setCards(prev => prev.map(c => (c.id === card_id ? { ...c, _balance: Number(c._balance || 0) + Number(delta || 0) } : c)))
      }
      if (type === 'CREATE' || type === 'UPDATE' || type === 'DELETE' || type === 'SYNC') {
        setTimeout(async () => {
          try {
            invalidateSumByCardCache()
            const sums = await sumTransactionsByCard()
            setCards(prev => withBalances(prev, sums))
          } catch (e) {
            console.error('Failed to reload balances after transaction change:', e)
          }
        }, 500)
      }
    })
    return off
  }, [])

  const uniqueBanks = useMemo(() => Array.from(new Set(cards.map(c => c.bank).filter(Boolean))).sort(), [cards])

  const visibleCards = useMemo(() => {
    let filtered = cards
    if (selectedBanks.length > 0) {
      const s = new Set(selectedBanks)
      filtered = filtered.filter(c => s.has(c.bank))
    }
    if (showFavoritesOnly) {
      const favorites = new Set(favoriteCardIds)
      filtered = filtered.filter(c => favorites.has(c.id))
    }
    if (cardOrder.length > 0) {
      const orderMap = new Map(cardOrder.map((id, index) => [id, index]))
      filtered = [...filtered].sort((a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity))
    }
    return filtered
  }, [cards, selectedBanks, showFavoritesOnly, favoriteCardIds, cardOrder])

  const toggleBank = (bank) => setSelectedBanks(prev => (prev.includes(bank) ? prev.filter(b => b !== bank) : [...prev, bank]))
  const clearFilter = () => {
    setSelectedBanks([])
    setShowFavoritesOnly(false)
  }
  const toggleFavorite = (cardId) =>
    setFavoriteCardIds(prev => (prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]))

  const handleDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) {
      const oldIndex = visibleCards.findIndex(c => c.id === active.id)
      const newIndex = visibleCards.findIndex(c => c.id === over.id)
      setCardOrder(arrayMove(visibleCards, oldIndex, newIndex).map(c => c.id))
    }
    setActiveId(null)
  }

  const cardProps = (c) => ({
    card: c,
    balance: Number(c._balance || 0),
    primaryCurrency: primary,
    rates,
    hidden,
    excluded: !!(c.exclude_from_stats || c.bank_exclude_from_stats),
    isFavorite: favoriteCardIds.includes(c.id),
    onToggleFavorite: toggleFavorite,
  })
  const activeCard = activeId ? visibleCards.find(c => c.id === activeId) : null

  return (
    <>
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-b from-white/[0.075] to-white/[0.025] backdrop-blur-xl rounded-3xl p-3 sm:p-5 shadow-glass relative flex flex-col h-auto sm:h-[calc(100vh-2rem)] border border-white/10"
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="text-lg font-bold tracking-tight">Ваші картки</div>
          <div className="flex items-center gap-2">
            <button
              className={`btn btn-soft text-xs inline-flex items-center gap-1 ${showFavoritesOnly ? 'bg-white/[0.06] border-white/[0.14]' : ''}`}
              onClick={() => setShowFavoritesOnly(v => !v)}
              title="Показати тільки вибрані"
            >
              <Star size={14} className={showFavoritesOnly ? 'fill-yellow-400 text-yellow-400' : ''} />
              Вибрані
            </button>
            <div className="relative">
              <button
                className={`btn btn-soft text-xs inline-flex items-center gap-1 ${selectedBanks.length > 0 ? 'bg-brand/15 border-brand/40' : ''}`}
                onClick={() => setFilterOpen(v => !v)}
                title="Фільтр за банком"
              >
                <Filter size={16} />
                Фільтр
              </button>
              <AnimatePresence>
                {filterOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="absolute right-0 mt-2 w-56 bg-surface/90 border border-white/10 rounded-xl shadow-soft p-3 z-20 backdrop-blur-xl"
                  >
                    <div className="text-xs font-semibold text-white/70 mb-2">Банки</div>
                    <div className="max-h-56 overflow-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {uniqueBanks.length === 0 ? (
                        <div className="text-xs text-white/55">Немає банків</div>
                      ) : uniqueBanks.map(b => (
                        <label key={b} className="flex items-center gap-2 py-1 text-sm">
                          <input type="checkbox" className="accent-brand" checked={selectedBanks.includes(b)} onChange={() => toggleBank(b)} />
                          <span>{b}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <button className="text-xs text-white/70 hover:underline" onClick={clearFilter}>Показати всі</button>
                      <button className="btn btn-primary text-xs py-1 px-3" onClick={() => setFilterOpen(false)}>Готово</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden -mx-5 -mb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {loading ? (
            <div className="text-sm text-white/55 px-5">Завантаження…</div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={({ active }) => setActiveId(active.id)}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveId(null)}
            >
              <SortableContext items={visibleCards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3 px-5 pb-5">
                  {visibleCards.length === 0 ? (
                    <div className="text-center text-sm text-white/55 py-8">
                      {showFavoritesOnly ? 'Немає вибраних карток' : 'Немає карток'}
                    </div>
                  ) : (
                    visibleCards.map(c => (
                      <SortableWalletCard key={c.id} id={c.id} {...cardProps(c)} onClick={setSelectedCard} />
                    ))
                  )}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeCard ? <WalletCard {...cardProps(activeCard)} className="scale-[1.02] shadow-[0_20px_50px_rgba(0,0,0,0.6)]" /> : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedCard && (
          <CardTransactionsDrawer
            key={selectedCard.id}
            card={cards.find(c => c.id === selectedCard.id) || selectedCard}
            onClose={() => setSelectedCard(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
