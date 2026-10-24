import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { RotateCcw, X } from 'lucide-react'
import { fmtAmount } from '../../utils/format'

/**
 * Floating bar while picking a refund (same as the iPhone app): always visible, since the list can
 * be scrolled far away from the expense; says what to do and for which expense, and cancels.
 */
export default function RefundPickBar({ expense, currency, hidden, onCancel }) {
  // Keep showing it while it slides away
  const last = useRef(null)
  if (expense) last.current = expense
  const tx = last.current

  const title = tx?.category || tx?.merchant_name || 'витрата'
  const amount = hidden ? '••••' : `−${fmtAmount(Math.abs(Number(tx?.amount || 0)), currency)}`

  return createPortal(
    <AnimatePresence>
      {expense && tx && (
        <div className="fixed left-0 right-0 z-[60] flex justify-center px-4 pointer-events-none bottom-[calc(160px+env(safe-area-inset-bottom,0px))] lg:bottom-8">
          <motion.div
            initial={{ y: 140, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 140, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="pointer-events-auto w-full max-w-[560px] flex items-center gap-3 p-3 rounded-3xl bg-[rgba(30,16,6,0.86)] backdrop-blur-2xl border border-brand/55 shadow-[0_8px_28px_rgba(255,107,0,0.35)]"
          >
            <div className="relative h-[42px] w-[42px] shrink-0 grid place-items-center">
              <span className="absolute inset-0 rounded-full bg-brand animate-[refund-ring_1.4s_ease-in-out_infinite]" />
              <span className="relative h-[42px] w-[42px] rounded-full bg-brand grid place-items-center">
                <RotateCcw size={20} strokeWidth={2.6} className="text-white" />
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-extrabold text-white">Торкніться доходу-повернення</div>
              <div className="text-[13px] text-white/70 truncate">
                для «{title}» · {amount}
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="h-9 w-9 shrink-0 rounded-full bg-white/15 hover:bg-white/25 grid place-items-center text-white transition"
              title="Скасувати (Esc)"
              aria-label="Скасувати вибір повернення"
            >
              <X size={16} strokeWidth={2.6} />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
