import { useMemo, useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { fmtDate, fmtAmount } from '../../utils/format'
import { Trash2, RotateCcw, Link2Off } from 'lucide-react'

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
}) {
  const isExp = Number(tx.amount) < 0
  const pad = compact ? 'p-2' : 'p-3'
  const round = compact ? 'rounded-lg' : 'rounded-xl'
  const titleText = compact ? 'text-[13px]' : 'text-sm'
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

  const bg = isExp ? 'bg-rose-500/10' : 'bg-emerald-500/10'
  const hover = isExp ? 'hover:bg-rose-500/20' : 'hover:bg-emerald-500/20'

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
    <div className="bg-white relative z-10">
      <div 
        className={`flex items-center justify-between ${pad} ${round} transition ${bg} ${hover} ${onDetails ? 'cursor-pointer' : ''}`}
        style={{
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)'
        }}
        onClick={onDetails ? onRowClick : undefined}
      >
      <div className="flex items-center gap-3">
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
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
          />
        )}
        <div>
          <div className={`font-semibold ${titleText} flex items-center gap-2`}>
            {tx.category || 'Без категорії'}
          </div>
          <div className={`${metaText} text-gray-500`}>
            {[tx.card].filter(Boolean).join(' · ') || '—'} · {fmtDate(tx.created_at)}
            {noteSnippet && (
              <span
                className="ml-2 text-indigo-600 inline-block align-bottom max-w-[220px] truncate"
                title={noteSnippet}
              >
                · {noteSnippet}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {amountOverride ? (
          <div className="flex flex-col items-end leading-tight">
            <div className={`font-semibold ${titleText} ${Number(amountOverride.primaryAmount) < 0 ? '' : 'text-emerald-600'}`}>
              {Number(amountOverride.primaryAmount) > 0 ? '+' : ''}{fmtAmount(amountOverride.primaryAmount, amountOverride.currency || currency)}
            </div>
            {amountOverride.secondaryAmount != null && (
              <div className={`${metaText} text-gray-500`}>
                {Number(amountOverride.secondaryAmount) > 0 ? '+' : ''}{fmtAmount(amountOverride.secondaryAmount, amountOverride.currency || currency)}
              </div>
            )}
          </div>
        ) : (
          <div className={`font-semibold ${titleText} ${isExp ? '' : 'text-emerald-600'}`}>
            {!isExp ? '+' : ''}{fmtAmount(tx.amount, currency)}
          </div>
        )}

        {/* Nested refunds keep unlink button as-is */}
        {onCancelRefund && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onCancelRefund(tx)
            }}
            className={`${btn} rounded-full bg-gray-200/70 hover:bg-gray-300 grid place-items-center text-gray-700`}
            title="Скасувати повернення"
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
            className={`${btn} rounded-full bg-amber-500/10 hover:bg-amber-500/20 grid place-items-center text-amber-600`}
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
            className={`${btn} rounded-full bg-indigo-500/10 hover:bg-indigo-500/20 grid place-items-center text-indigo-600`}
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
            className={`${btn} rounded-full bg-rose-500/10 hover:bg-rose-500/20 grid place-items-center text-rose-600`}
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
      style={{
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)'
      }}
      onClick={onDetails ? onRowClick : undefined}
    >
      <div className="flex items-center gap-3">
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
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
          />
        )}
        <div>
          <div className={`font-semibold ${titleText} flex items-center gap-2`}>
            {tx.category || 'Без категорії'}
          </div>
          <div className={`${metaText} text-gray-500`}>
            {[tx.card].filter(Boolean).join(' · ') || '—'} · {fmtDate(tx.created_at)}
            {noteSnippet && (
              <span
                className="ml-2 text-indigo-600 inline-block align-bottom max-w-[220px] truncate"
                title={noteSnippet}
              >
                · {noteSnippet}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {amountOverride ? (
          <div className="flex flex-col items-end leading-tight">
            <div className={`font-semibold ${titleText} ${Number(amountOverride.primaryAmount) < 0 ? '' : 'text-emerald-600'}`}>
              {Number(amountOverride.primaryAmount) > 0 ? '+' : ''}{fmtAmount(amountOverride.primaryAmount, amountOverride.currency || currency)}
            </div>
            {amountOverride.secondaryAmount != null && (
              <div className={`${metaText} text-gray-500`}>
                {Number(amountOverride.secondaryAmount) > 0 ? '+' : ''}{fmtAmount(amountOverride.secondaryAmount, amountOverride.currency || currency)}
              </div>
            )}
          </div>
        ) : (
          <div className={`font-semibold ${titleText} ${isExp ? '' : 'text-emerald-600'}`}>
            {!isExp ? '+' : ''}{fmtAmount(tx.amount, currency)}
          </div>
        )}

        {/* Nested refunds keep unlink button as-is */}
        {onCancelRefund && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onCancelRefund(tx)
            }}
            className={`${btn} rounded-full bg-gray-200/70 hover:bg-gray-300 grid place-items-center text-gray-700`}
            title="Скасувати повернення"
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
            className={`${btn} rounded-full bg-amber-500/10 hover:bg-amber-500/20 grid place-items-center text-amber-600`}
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
            className={`${btn} rounded-full bg-indigo-500/10 hover:bg-indigo-500/20 grid place-items-center text-indigo-600`}
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
            className={`${btn} rounded-full bg-rose-500/10 hover:bg-rose-500/20 grid place-items-center text-rose-600`}
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
      <div className={`${round} ${selected ? 'ring-2 ring-indigo-500' : ''} ${className}`}>
        {inner}
      </div>
    )
  }

  return (
    <div ref={rowRef} className={`relative ${round} overflow-hidden ${selected ? 'ring-2 ring-indigo-500' : ''} ${className}`}>
      <div className="absolute inset-y-0 right-0 flex items-stretch z-0">
        {onRefund && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setSwipeOpen(false)
              onRefund(tx)
            }}
            className="h-full grid place-items-center text-indigo-600 bg-indigo-500/10 hover:bg-indigo-500/20"
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
            className="h-full grid place-items-center text-rose-600 bg-rose-500/10 hover:bg-rose-500/20"
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
