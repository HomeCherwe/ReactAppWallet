import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence } from 'framer-motion'
import { Building2, List, MoreHorizontal, Settings, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import BankConnections from '../components/BankConnections'
import AddBankChoiceModal from '../components/AddBankChoiceModal'
import OwnAccountModal from '../components/cards/OwnAccountModal'
import { BankModal, CardModal } from '../components/cards/CardModals'
import ConfirmModal from '../components/ConfirmModal'
import CardTransactionsDrawer from '../components/transactions/CardTransactionsDrawer'
import { listCards, updateCard, deleteCard } from '../api/cards'
import { listBanks, updateBank, deleteBank } from '../api/banks'
import { sumTransactionsByCard } from '../api/transactions'
import { invalidateCardsCache, invalidateSumByCardCache } from '../utils/dataCache'
import { txBus } from '../utils/txBus'
import { getBucket } from '../utils/cardTheme'
import { useSettingsStore } from '../store/useSettingsStore'

// Same groups, accents and icons as the iPhone cards screen
const GROUPS = [
  { id: 'cards', title: '💳 Картки', icon: '💳', accent: ['#FF8A2A', '#FF4D00'] },
  { id: 'savings', title: '🎯 Скарбнички', icon: '🎯', accent: ['#34D399', '#0E9F6E'] },
  { id: 'cash', title: '💵 Готівка', icon: '💵', accent: ['#FBBF24', '#D97706'] },
]

const fmtAmount = (v, currency) =>
  `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || ''}`.trim()

function accountsWord(n) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'активний рахунок'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'активні рахунки'
  return 'активних рахунків'
}

/** Glass menu for a card (right click or "⋯"), like the iPhone long-press menu */
function CardMenu({ menu, onClose }) {
  useEffect(() => {
    if (!menu) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', onClose)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onClose)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, onClose])

  if (!menu) return null
  const width = 260
  const left = Math.max(12, Math.min(menu.x, window.innerWidth - width - 12))
  const top = Math.max(12, Math.min(menu.y, window.innerHeight - 70 - menu.actions.length * 48))
  return createPortal(
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed z-[90] rounded-2xl overflow-hidden bg-[rgba(32,32,38,0.92)] backdrop-blur-2xl border border-white/10 shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
      style={{ left, top, width }}
    >
      <div className="px-4 pt-3 pb-2.5 border-b border-white/10">
        <div className="text-sm font-bold text-white truncate">{menu.title}</div>
        <div className="text-xs text-white/50 truncate">{menu.subtitle}</div>
      </div>
      {menu.actions.map(a => (
        <button
          key={a.label}
          type="button"
          onClick={() => {
            onClose()
            a.onPress()
          }}
          className={`w-full flex items-center justify-between gap-3 px-4 h-12 text-[15px] hover:bg-white/[0.07] transition-colors ${
            a.destructive ? 'text-[#FF453A]' : 'text-white'
          } border-t border-white/[0.06] first:border-t-0`}
        >
          {a.label}
          <a.icon size={17} className={a.destructive ? '' : 'text-white/70'} />
        </button>
      ))}
    </div>,
    document.body
  )
}

/** "Рахунки та картки": the iPhone cards screen — connected banks on top, then cards, savings, cash */
export default function CardsPage() {
  const hidden = useSettingsStore(state => state.settings?.hideAllBalances ?? false)
  const [cards, setCards] = useState([])
  const [banks, setBanks] = useState([])
  const [loading, setLoading] = useState(true)
  const [banksReloadKey, setBanksReloadKey] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [ownOpen, setOwnOpen] = useState(false)
  const [selectedCard, setSelectedCard] = useState(null)
  const [editCard, setEditCard] = useState(null)
  const [editBank, setEditBank] = useState(null)
  const [cardToDelete, setCardToDelete] = useState(null)
  const [bankToDelete, setBankToDelete] = useState(null)
  const [menu, setMenu] = useState(null)

  const load = useCallback(async ({ fresh = false } = {}) => {
    if (fresh) {
      invalidateCardsCache()
      invalidateSumByCardCache()
    }
    try {
      const [list, bankList] = await Promise.all([listCards(), listBanks().catch(() => [])])
      let sums = {}
      try {
        sums = await sumTransactionsByCard()
      } catch (e) {
        console.error('sumTransactionsByCard error', e)
      }
      setCards((list || []).map(c => ({ ...c, _balance: Number(c.initial_balance || 0) + Number(sums[c.id] || 0) })))
      setBanks(bankList || [])
    } catch (e) {
      console.error('Failed to load cards:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Transactions changed anywhere: balances follow (a moment later, once the server has them)
  useEffect(() => {
    let timer = null
    const off = txBus.subscribe(() => {
      clearTimeout(timer)
      timer = setTimeout(() => load({ fresh: true }), 500)
    })
    return () => {
      clearTimeout(timer)
      off?.()
    }
  }, [load])

  const reloadAll = useCallback(() => {
    load({ fresh: true })
    setBanksReloadKey(k => k + 1)
  }, [load])

  const balances = useMemo(() => Object.fromEntries(cards.map(c => [c.id, c._balance])), [cards])
  const groups = useMemo(
    () => GROUPS.map(g => ({ ...g, cards: cards.filter(c => getBucket(c) === g.id) })).filter(g => g.cards.length > 0),
    [cards]
  )

  const openMenu = (card, x, y) => {
    const bank = banks.find(b => b.id === card.bank_id)
    setMenu({
      x,
      y,
      title: card.name,
      subtitle: `${card.bank || 'Рахунок'} · ${hidden ? '••••' : fmtAmount(card._balance, card.currency)}`,
      actions: [
        { label: 'Транзакції та статистика', icon: List, onPress: () => setSelectedCard(card) },
        { label: 'Налаштування картки', icon: Settings, onPress: () => setEditCard(card) },
        ...(bank ? [{ label: `Банк «${bank.name}»`, icon: Building2, onPress: () => setEditBank(bank) }] : []),
        { label: 'Видалити', icon: Trash2, destructive: true, onPress: () => setCardToDelete(card) },
      ],
    })
  }

  const saveCard = async (form, file) => {
    try {
      await updateCard(
        editCard.id,
        { bank_id: form.bank_id || null, name: form.name, currency: form.currency || 'EUR', exclude_from_stats: !!form.exclude_from_stats },
        file
      )
      setEditCard(null)
      toast.success('Картку оновлено')
      load({ fresh: true })
      txBus.emit({ type: 'SYNC' })
    } catch (e) {
      toast.error(e?.message || 'Помилка збереження картки')
      throw e
    }
  }

  const saveBank = async (form) => {
    try {
      await updateBank(editBank.id, { name: form.name, exclude_from_stats: !!form.exclude_from_stats })
      setEditBank(null)
      toast.success('Банк оновлено')
      load({ fresh: true })
      txBus.emit({ type: 'SYNC' })
    } catch (e) {
      toast.error(e?.message || 'Помилка збереження банку')
    }
  }

  const confirmDeleteCard = async () => {
    const c = cardToDelete
    setCardToDelete(null)
    try {
      await deleteCard(c.id)
      toast.success('Картку видалено')
      reloadAll()
      txBus.emit({ type: 'SYNC' })
    } catch (e) {
      toast.error(`Не вдалося видалити картку: ${e.message || e}`)
    }
  }

  const confirmDeleteBank = async () => {
    const b = bankToDelete
    setBankToDelete(null)
    setEditBank(null)
    try {
      await deleteBank(b.id)
      toast.success('Банк видалено')
      reloadAll()
      txBus.emit({ type: 'SYNC' })
    } catch (e) {
      toast.error(e?.message || 'Не вдалося видалити банк')
    }
  }

  const bankCardsCount = bankToDelete ? cards.filter(c => c.bank_id === bankToDelete.id).length : 0

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5 px-1">
        <div>
          <h1 className="text-[22px] font-semibold text-white">Рахунки та картки</h1>
          <div className="text-[13px] text-white/55 mt-0.5">
            {cards.length} {accountsWord(cards.length)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="px-3.5 py-2 rounded-full bg-brand/15 border border-brand/40 text-brand text-[13px] font-bold hover:bg-brand/20 transition-colors"
        >
          + Додати
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6 lg:items-start">
        <div className="lg:sticky lg:top-6">
          <BankConnections
            reloadKey={banksReloadKey}
            onChanged={() => load({ fresh: true })}
            cards={cards}
            balances={balances}
            onOpenCard={setSelectedCard}
          />
        </div>

        <div>
          {loading ? (
            <div className="py-16 grid place-items-center">
              <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-brand animate-spin" />
            </div>
          ) : cards.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-[44px] mb-3">💳</div>
              <div className="text-lg font-semibold text-white">Карток не додано</div>
              <div className="text-[13px] text-white/55 mt-1">Натисніть «+ Додати», щоб підключити банк або додати рахунок вручну</div>
            </div>
          ) : (
            groups.map(g => (
              <section key={g.id} className="mb-6">
                <h3 className="text-lg font-semibold text-brand mb-3 ml-1">{g.title}</h3>
                <div className="grid gap-2.5">
                  {g.cards.map(card => {
                    const excluded = !!(card.exclude_from_stats || card.bank_exclude_from_stats)
                    return (
                      <div
                        key={card.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedCard(card)}
                        onKeyDown={(e) => e.key === 'Enter' && setSelectedCard(card)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          openMenu(card, e.clientX, e.clientY)
                        }}
                        className="group relative flex items-center justify-between rounded-[22px] py-3.5 pl-[18px] pr-2.5 overflow-hidden bg-white/[0.04] border border-white/[0.14] backdrop-blur-xl cursor-pointer hover:bg-white/[0.065] transition-colors"
                      >
                        {/* Colored edge on the left */}
                        <span
                          className="absolute left-0 top-3.5 bottom-3.5 w-[3px] rounded-r-[3px]"
                          style={{ background: `linear-gradient(180deg, ${g.accent[0]}, ${g.accent[1]})` }}
                        />
                        <div className="flex items-center gap-3 flex-1 min-w-0 mr-2.5">
                          <span
                            className="h-[42px] w-[42px] shrink-0 rounded-[14px] grid place-items-center text-[19px]"
                            style={{ background: `linear-gradient(135deg, ${g.accent[0]}, ${g.accent[1]})` }}
                          >
                            {g.icon}
                          </span>
                          <div className="min-w-0">
                            <div className="text-base font-bold text-white truncate">{card.name}</div>
                            <div className="text-xs text-white/60 truncate mt-0.5">
                              {card.bank || 'Рахунок'}
                              {card.card_number ? ` · •• ${String(card.card_number).slice(-4)}` : ''}
                              {excluded ? ' · поза статистикою' : ''}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-base font-extrabold tabular-nums ${card._balance < 0 ? 'text-[#FF6B6B]' : 'text-white'}`}>
                            {hidden ? '••••' : fmtAmount(card._balance, card.currency)}
                          </div>
                          <div className="text-[11px] font-bold tracking-wide text-white/40 mt-0.5">{card.currency}</div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const r = e.currentTarget.getBoundingClientRect()
                            openMenu(card, r.right - 260, r.bottom + 6)
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="ml-1.5 h-8 w-8 shrink-0 grid place-items-center rounded-full text-white/45 hover:text-white hover:bg-white/10 transition-colors"
                          title="Дії"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      <CardMenu menu={menu} onClose={() => setMenu(null)} />

      <AddBankChoiceModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onManual={() => {
          setAddOpen(false)
          setOwnOpen(true)
        }}
      />
      <OwnAccountModal open={ownOpen} onClose={() => setOwnOpen(false)} onCreated={() => load({ fresh: true })} />

      <CardModal open={!!editCard} initial={editCard} banks={banks} onClose={() => setEditCard(null)} onSubmit={saveCard} />
      <BankModal
        open={!!editBank}
        initial={editBank}
        onClose={() => setEditBank(null)}
        onSubmit={saveBank}
        onDelete={setBankToDelete}
      />

      <ConfirmModal
        open={!!cardToDelete}
        title="Видалити картку?"
        message={cardToDelete ? `Ви впевнені, що хочете видалити «${cardToDelete.name}»?` : ''}
        confirmLabel="Видалити"
        danger
        onConfirm={confirmDeleteCard}
        onCancel={() => setCardToDelete(null)}
      />
      <ConfirmModal
        open={!!bankToDelete}
        title={bankToDelete ? `Видалити банк «${bankToDelete.name}»?` : ''}
        message={
          bankCardsCount > 0
            ? `Разом з ${bankCardsCount === 1 ? '1 карткою' : `${bankCardsCount} картками`} і всіма їхніми транзакціями. Якщо банк синхронізується, синхронізацію буде відключено. Це не можна скасувати.`
            : 'Це не можна скасувати.'
        }
        confirmLabel="Видалити"
        danger
        onConfirm={confirmDeleteBank}
        onCancel={() => setBankToDelete(null)}
      />

      <AnimatePresence>
        {selectedCard && (
          <CardTransactionsDrawer
            key={selectedCard.id}
            card={cards.find(c => c.id === selectedCard.id) || selectedCard}
            onClose={() => setSelectedCard(null)}
            onOpenSettings={(card) => {
              setSelectedCard(null)
              setEditCard(card)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
