import { useMemo, useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { fmtDate, fmtAmount } from '../../utils/format'
import { Trash2, RotateCcw, Link2Off, Check, Plus } from 'lucide-react'

import { useSettingsStore } from '../../store/useSettingsStore'
import { getCategoryVisual } from '../../utils/categoryIcon'
import { useCardLabeler } from '../../store/useCardsStore'

/** Not settled at the bank yet (TrueLayer banks) — same pill as the iPhone app */
function PendingBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/[0.08] text-white/60 whitespace-nowrap">
      <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
      В обробці
    </span>
  )
}

/** The category came from the user's rules, not from the user (same as the iPhone app) */
function AutoBadge() {
  return (
    <span
      className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FFB25C]/[0.12] text-[#FFB25C] whitespace-nowrap"
      title="Поставлено автоматично за вашими звичками"
    >
      авто
    </span>
  )
}

const isSyncCategory = category => /\bsync$/i.test(String(category || '').trim())

/** A waiting bank import the rules have a category for: click ✓ to take it */
function SuggestionPill({ tx, onAccept }) {
  return (
    <button
      onClick={e => {
        e.stopPropagation()
        onAccept(tx)
      }}
      className="inline-flex items-center gap-1 max-w-[160px] px-2 py-1 rounded-full text-[11.5px] font-bold bg-[#FFB25C]/[0.14] text-[#FFB25C] border border-[#FFB25C]/40 hover:bg-[#FFB25C]/25 transition"
      title={`Підтвердити категорію «${tx.suggested_category}»`}
    >
      <Check size={12} strokeWidth={3.2} className="shrink-0" />
      <span className="truncate">{tx.suggested_category}</span>
    </button>
  )
}

/** iOS-Settings-style icon: a white glyph on a colored rounded square */
function CategoryIcon({ tx, compact }) {
  const { Icon, color } = getCategoryVisual(tx.category, Number(tx.amount || 0), tx.is_transfer)
  return (
    <div
      className={`${compact ? 'h-8 w-8 rounded-[9px]' : 'h-10 w-10 rounded-[11px]'} shrink-0 grid place-items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ${tx.status === 'pending' ? 'grayscale opacity-50' : ''}`}
      style={{ background: `linear-gradient(180deg, ${color}, ${color}d9)` }}
    >
      <Icon size={compact ? 16 : 20} strokeWidth={2.2} className="text-white" />
    </div>
  )
}

export default function Row({
  tx,
  currency,
  onDetails,
  onAskDelete,
  onEdit,
  onRefund,
  onCancelRefund,
  selected,
  onSelect,
  amountOverride,
  compact = false,
  className = '',
  swipeActions = false,
  showEditButton = true,
  onAcceptSuggestion,
  // A transfer leg: the other leg's account, shown as «⇄ на / з …»
  transferWith,
  // A nested transfer leg: unlink / undo the transfer (like a nested refund's button)
  onUnlinkTransfer,
  // Refund picking (like the iPhone app): 'pickable' incomes jiggle with «Обрати», the expense is
  // the 'target' («Повертаємо»), everything else is 'dimmed'
  mode = 'normal',
  // Alternate jiggle direction per row so the list doesn't sway as one block
  wiggleDir = 1,
}) {
  const hideAllBalances = useSettingsStore(state => state.settings.hideAllBalances ?? false)
  const labelOf = useCardLabeler()
  const isExp = Number(tx.amount) < 0
  const pending = tx.status === 'pending'
  const autoCategory = tx.category_source === 'auto'
  const suggestion = !!onAcceptSuggestion && !!tx.suggested_category && isSyncCategory(tx.category)
  // A transfer between the user's own accounts: neither spending nor income
  const isTransfer = !!tx.is_transfer
  const title = isTransfer && (!tx.category || tx.category === 'ТРАНСФЕР') ? 'Переказ' : tx.category || 'Без категорії'
  const outgoing = tx.transfer_role ? tx.transfer_role === 'from' : isExp
  const transferMeta = isTransfer ? `⇄ ${outgoing ? 'на' : 'з'} ${transferWith ? `«${transferWith}»` : 'інший рахунок'}` : null
  const amountColor = pending ? 'text-white/45' : isTransfer ? 'text-white/80' : isExp ? '' : 'text-green-400'
  const pad = compact ? 'p-2' : 'p-3'
  const round = compact ? 'rounded-xl' : 'rounded-2xl'
  const titleText = compact ? 'text-[13px]' : 'text-[15px]'
  const metaText = compact ? 'text-[11px]' : 'text-xs'
  const btn = compact ? 'h-8 w-8 sm:h-6 sm:w-6' : 'h-9 w-9 sm:h-7 sm:w-7'
  const icon = compact ? 12 : 14

  const noteSnippet = useMemo(() => {
    const note = String(tx?.note || '').trim()
    if (!note) return ''
    const beforePipe = note.includes('|') ? note.split('|')[0].trim() : ''
    if (beforePipe) return beforePipe
    const firstLine = note.split('\n').map(s => s.trim()).filter(Boolean)[0] || ''
    return firstLine
  }, [tx?.note])

  const actionsCount = (onRefund ? 1 : 0) + (onAskDelete ? 1 : 0)
  const actionW = compact ? 56 : 72
  const actionsW = actionsCount * actionW
  const swipeEnabled = !!swipeActions && !compact && actionsW > 0
  const [swipeOpen, setSwipeOpen] = useState(false)
  const [wasDragged, setWasDragged] = useState(false)
  const rowRef = useRef(null)

  // Swiping turned off (e.g. refund picking started): an open row closes
  useEffect(() => {
    if (!swipeEnabled) setSwipeOpen(false)
  }, [swipeEnabled])

  // Close swipe when clicking outside
  useEffect(() => {
    if (!swipeEnabled || !swipeOpen) return

    const handleClickOutside = (event) => {
      if (rowRef.current && !rowRef.current.contains(event.target)) {
        setSwipeOpen(false)
      }
    }

    // Add listener with a small delay to avoid immediate closure
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [swipeEnabled, swipeOpen])

  const bg =
    mode === 'pickable'
      ? 'bg-[#15201A]'
      : mode === 'target'
        ? 'bg-[#2A1709] border-l-[3px] border-brand'
        : 'bg-white/[0.035]'
  const hover = mode === 'pickable' ? 'hover:bg-[#1B2C22]' : mode === 'target' ? '' : 'hover:bg-white/[0.07]'
  // Refund picking: the outer box jiggles (pickable) or fades (dimmed)
  const pickBox = `${mode === 'pickable' ? (wiggleDir === 1 ? 'tx-wiggle' : 'tx-wiggle-rev') : ''} transition-opacity duration-200`
  const pickStyle = mode === 'dimmed' ? { opacity: 0.28 } : undefined
  const pickPill =
    mode === 'pickable' ? (
      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-[#22C55E] text-[#0B2E17] text-[11px] font-extrabold whitespace-nowrap">
        <Plus size={11} strokeWidth={3.2} />
        Обрати
      </span>
    ) : mode === 'target' ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand text-white text-[11px] font-extrabold whitespace-nowrap">
        <RotateCcw size={11} strokeWidth={2.8} />
        Повертаємо
      </span>
    ) : null

  const onRowClick = () => {
    if (wasDragged) {
      setWasDragged(false)
      return
    }
    if (swipeEnabled && swipeOpen) {
      setSwipeOpen(false)
      return
    }
    onDetails?.(tx, currency)
  }

  const inner = swipeEnabled ? (
    <div className="bg-[#141416] relative z-10">
      <div 
        className={`flex items-center justify-between ${pad} ${round} transition ${bg} ${hover} ${onDetails ? 'cursor-pointer' : ''}`}
        onClick={onDetails ? onRowClick : undefined}
      >
      <div className="flex items-center gap-3 min-w-0">
        {onSelect && (
          <input
            type="checkbox"
            checked={selected || false}
            onChange={() => {}}
            onClick={(e) => {
              e.stopPropagation()
              const shiftKey = e.shiftKey || (e.nativeEvent && e.nativeEvent.shiftKey) || false
              const newChecked = !selected
              const syntheticEvent = { shiftKey }
              onSelect(tx.id, newChecked, syntheticEvent)
            }}
            className="w-4 h-4 rounded border-white/[0.14] text-brand focus:ring-brand cursor-pointer"
          />
        )}
        <CategoryIcon tx={tx} compact={compact} />
        <div className="min-w-0">
          <div className={`font-semibold ${titleText} flex items-center gap-2 ${pending ? 'text-white/60' : ''}`}>
            {title}
            {autoCategory && <AutoBadge />}
            {pending && <PendingBadge />}
          </div>
          <div className={`${metaText} text-white/55`}>
            {labelOf(tx) || '—'} · {fmtDate(tx.created_at)}
            {transferMeta && <span className="ml-1.5 text-[#8AB4FF] font-semibold">{transferMeta}</span>}
            {noteSnippet && (
              <span
                className="ml-2 text-brand inline-block align-bottom max-w-[220px] truncate"
                title={noteSnippet}
              >
                · {noteSnippet}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {suggestion && <SuggestionPill tx={tx} onAccept={onAcceptSuggestion} />}
        {amountOverride ? (
          <div className="flex flex-col items-end leading-tight">
            <div className={`font-semibold ${titleText} ${Number(amountOverride.primaryAmount) < 0 ? '' : 'text-green-400'}`}>
              {hideAllBalances ? '***' : `${Number(amountOverride.primaryAmount) > 0 ? '+' : ''}${fmtAmount(amountOverride.primaryAmount, amountOverride.currency || currency)}`}
            </div>
            {amountOverride.secondaryAmount != null && (
              <div className={`${metaText} text-white/55`}>
                {hideAllBalances ? '***' : `${Number(amountOverride.secondaryAmount) > 0 ? '+' : ''}${fmtAmount(amountOverride.secondaryAmount, amountOverride.currency || currency)}`}
              </div>
            )}
            {pickPill && <div className="mt-1">{pickPill}</div>}
          </div>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <div className={`font-semibold ${titleText} ${amountColor}`}>
              {hideAllBalances ? '***' : `${!isExp ? '+' : ''}${fmtAmount(tx.amount, currency)}`}
            </div>
            {pickPill}
          </div>
        )}

        {/* Nested refunds keep unlink button as-is */}
        {onCancelRefund && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onCancelRefund(tx)
            }}
            className={`${btn} rounded-full bg-white/[0.07] hover:bg-white/15 grid place-items-center text-white/85`}
            title="Скасувати повернення"
          >
            <Link2Off size={icon} />
          </button>
        )}

        {onUnlinkTransfer && isTransfer && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onUnlinkTransfer(tx)
            }}
            className={`${btn} rounded-full bg-white/[0.07] hover:bg-white/15 grid place-items-center text-white/85`}
            title="Скасувати переказ"
          >
            <Link2Off size={icon} />
          </button>
        )}

        {/* Edit button (used outside dashboard, e.g. stats modals) */}
        {!swipeEnabled && showEditButton && onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit(tx)
            }}
            className={`${btn} rounded-full bg-amber-500/10 hover:bg-amber-500/20 grid place-items-center text-amber-400`}
            title="Редагувати"
          >
            ✏️
          </button>
        )}

        {/* Non-swipe fallback (e.g. other pages) */}
        {!swipeEnabled && onRefund && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRefund(tx)
            }}
            className={`${btn} rounded-full bg-brand/10 hover:bg-brand/20 grid place-items-center text-brand`}
            title="Повернення"
          >
            <RotateCcw size={icon} />
          </button>
        )}

        {!swipeEnabled && onAskDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAskDelete(tx)
            }}
            className={`${btn} rounded-full bg-rose-500/10 hover:bg-rose-500/20 grid place-items-center text-rose-400`}
            title="Видалити"
          >
            <Trash2 size={icon} />
          </button>
        )}
      </div>
      </div>
    </div>
  ) : (
    <div 
      className={`flex items-center justify-between ${pad} ${round} transition ${bg} ${hover} ${onDetails ? 'cursor-pointer' : ''}`}
      onClick={onDetails ? onRowClick : undefined}
    >
      <div className="flex items-center gap-3 min-w-0">
        {onSelect && (
          <input
            type="checkbox"
            checked={selected || false}
            onChange={() => {}}
            onClick={(e) => {
              e.stopPropagation()
              const shiftKey = e.shiftKey || (e.nativeEvent && e.nativeEvent.shiftKey) || false
              const newChecked = !selected
              const syntheticEvent = { shiftKey }
              onSelect(tx.id, newChecked, syntheticEvent)
            }}
            className="w-4 h-4 rounded border-white/[0.14] text-brand focus:ring-brand cursor-pointer"
          />
        )}
        <CategoryIcon tx={tx} compact={compact} />
        <div className="min-w-0">
          <div className={`font-semibold ${titleText} flex items-center gap-2 ${pending ? 'text-white/60' : ''}`}>
            {title}
            {autoCategory && <AutoBadge />}
            {pending && <PendingBadge />}
          </div>
          <div className={`${metaText} text-white/55`}>
            {labelOf(tx) || '—'} · {fmtDate(tx.created_at)}
            {transferMeta && <span className="ml-1.5 text-[#8AB4FF] font-semibold">{transferMeta}</span>}
            {noteSnippet && (
              <span
                className="ml-2 text-brand inline-block align-bottom max-w-[220px] truncate"
                title={noteSnippet}
              >
                · {noteSnippet}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {suggestion && <SuggestionPill tx={tx} onAccept={onAcceptSuggestion} />}
        {amountOverride ? (
          <div className="flex flex-col items-end leading-tight">
            <div className={`font-semibold ${titleText} ${Number(amountOverride.primaryAmount) < 0 ? '' : 'text-green-400'}`}>
              {hideAllBalances ? '***' : `${Number(amountOverride.primaryAmount) > 0 ? '+' : ''}${fmtAmount(amountOverride.primaryAmount, amountOverride.currency || currency)}`}
            </div>
            {amountOverride.secondaryAmount != null && (
              <div className={`${metaText} text-white/55`}>
                {hideAllBalances ? '***' : `${Number(amountOverride.secondaryAmount) > 0 ? '+' : ''}${fmtAmount(amountOverride.secondaryAmount, amountOverride.currency || currency)}`}
              </div>
            )}
            {pickPill && <div className="mt-1">{pickPill}</div>}
          </div>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <div className={`font-semibold ${titleText} ${amountColor}`}>
              {hideAllBalances ? '***' : `${!isExp ? '+' : ''}${fmtAmount(tx.amount, currency)}`}
            </div>
            {pickPill}
          </div>
        )}

        {/* Nested refunds keep unlink button as-is */}
        {onCancelRefund && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onCancelRefund(tx)
            }}
            className={`${btn} rounded-full bg-white/[0.07] hover:bg-white/15 grid place-items-center text-white/85`}
            title="Скасувати повернення"
          >
            <Link2Off size={icon} />
          </button>
        )}

        {onUnlinkTransfer && isTransfer && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onUnlinkTransfer(tx)
            }}
            className={`${btn} rounded-full bg-white/[0.07] hover:bg-white/15 grid place-items-center text-white/85`}
            title="Скасувати переказ"
          >
            <Link2Off size={icon} />
          </button>
        )}

        {/* Edit button (used outside dashboard, e.g. stats modals) */}
        {!swipeEnabled && showEditButton && onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit(tx)
            }}
            className={`${btn} rounded-full bg-amber-500/10 hover:bg-amber-500/20 grid place-items-center text-amber-400`}
            title="Редагувати"
          >
            ✏️
          </button>
        )}

        {/* Non-swipe fallback (e.g. other pages) */}
        {!swipeEnabled && onRefund && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRefund(tx)
            }}
            className={`${btn} rounded-full bg-brand/10 hover:bg-brand/20 grid place-items-center text-brand`}
            title="Повернення"
          >
            <RotateCcw size={icon} />
          </button>
        )}

        {!swipeEnabled && onAskDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAskDelete(tx)
            }}
            className={`${btn} rounded-full bg-rose-500/10 hover:bg-rose-500/20 grid place-items-center text-rose-400`}
            title="Видалити"
          >
            <Trash2 size={icon} />
          </button>
        )}
      </div>
    </div>
  )

  if (!swipeEnabled) {
    return (
      <div className={`${round} ${selected ? 'ring-2 ring-brand' : ''} ${pickBox} ${className}`} style={pickStyle}>
        {inner}
      </div>
    )
  }

  return (
    <div ref={rowRef} className={`relative ${round} overflow-hidden ${selected ? 'ring-2 ring-brand' : ''} ${pickBox} ${className}`} style={pickStyle}>
      <div className="absolute inset-y-0 right-0 flex items-stretch z-0">
        {onRefund && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setSwipeOpen(false)
              onRefund(tx)
            }}
            className="h-full grid place-items-center text-brand bg-brand/10 hover:bg-brand/20"
            style={{ width: actionW }}
            title="Повернення"
          >
            <RotateCcw size={16} />
          </button>
        )}
        {onAskDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setSwipeOpen(false)
              onAskDelete(tx)
            }}
            className="h-full grid place-items-center text-rose-400 bg-rose-500/10 hover:bg-rose-500/20"
            style={{ width: actionW }}
            title="Видалити"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <motion.div
        className="touch-pan-y relative z-10"
        drag="x"
        dragConstraints={{ left: -actionsW, right: 0 }}
        dragElastic={0.12}
        animate={{ x: swipeOpen ? -actionsW : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        onDragStart={() => {
          setWasDragged(false)
        }}
        onDrag={(_, info) => {
          if (Math.abs(info.offset.x) > 5) {
            setWasDragged(true)
          }
        }}
        onDragEnd={(_, info) => {
          const left = info.offset.x
          const v = info.velocity.x
          const shouldOpen = left < -Math.min(70, actionsW / 2) || v < -600
          const shouldClose = left > -15 || v > 600
          if (shouldOpen) setSwipeOpen(true)
          else if (shouldClose) setSwipeOpen(false)
          else setSwipeOpen(swipeOpen)
          // Reset wasDragged after a short delay to allow click to be blocked
          setTimeout(() => setWasDragged(false), 100)
        }}
      >
        {inner}
      </motion.div>
    </div>
  )
}
