import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ArrowLeftRight, ScanLine } from 'lucide-react'
import CreateTxModal from './transactions/CreateTxModal'
import TransferModal from './transactions/TransferModal'
import ScanReceiptModal from './transactions/ScanReceiptModal'
import { txBus } from '../utils/txBus'

// Hold this long (or right-click) to open the actions menu, like the iPhone + button
const HOLD_MS = 420

/**
 * The one "+" of the app: click → new transaction; hold or right-click → menu with transfer and
 * receipt scan.
 * - variant="fab": floating bottom-right (phone & tablet, like the iPhone FAB)
 * - variant="inline": compact round button (desktop sidebar header); the menu drops down
 */
export default function QuickAddFab({ variant = 'fab' }) {
  const inline = variant === 'inline'
  const [menuOpen, setMenuOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const holdTimer = useRef(null)
  const heldRef = useRef(false)
  const rootRef = useRef(null)

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
  }

  // Close the menu on an outside click or Escape
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setMenuOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => clearHold, [])

  const pick = (open) => {
    setMenuOpen(false)
    open(true)
  }

  const actions = [
    { label: 'Нова транзакція', icon: Plus, onClick: () => pick(setCreateOpen) },
    { label: 'Переказ між рахунками', icon: ArrowLeftRight, onClick: () => pick(setTransferOpen) },
    { label: 'Сканувати чек', icon: ScanLine, onClick: () => pick(setScanOpen) },
  ]

  return (
    <>
      <div
        ref={rootRef}
        className={
          inline
            ? 'relative'
            : 'fixed right-4 z-50 bottom-[calc(92px+env(safe-area-inset-bottom,0px))]'
        }
      >
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              key="fab-menu"
              initial={{ opacity: 0, scale: 0.85, y: inline ? -8 : 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: inline ? -6 : 6 }}
              transition={{ type: 'spring', stiffness: 460, damping: 32 }}
              style={{ transformOrigin: inline ? 'top left' : 'bottom right' }}
              className={`absolute z-50 w-64 overflow-hidden rounded-[20px] bg-[rgba(30,30,35,0.92)] backdrop-blur-2xl border border-white/10 shadow-[0_18px_50px_rgba(0,0,0,0.6)] ${
                inline ? 'top-[calc(100%+8px)] left-0' : 'bottom-[76px] right-0'
              }`}
            >
              {actions.map(({ label, icon: Icon, onClick }, i) => (
                <button
                  key={label}
                  onClick={onClick}
                  className={`w-full h-12 px-4 flex items-center justify-between text-[15px] text-white hover:bg-white/[0.08] transition-colors ${
                    i > 0 ? 'border-t border-white/[0.08]' : ''
                  }`}
                >
                  {label}
                  <Icon size={18} className="text-brand" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.9 }}
          onPointerDown={() => {
            heldRef.current = false
            clearHold()
            holdTimer.current = setTimeout(() => {
              heldRef.current = true
              setMenuOpen(true)
            }, HOLD_MS)
          }}
          onPointerUp={clearHold}
          onPointerLeave={clearHold}
          onContextMenu={(e) => {
            e.preventDefault()
            clearHold()
            heldRef.current = true
            setMenuOpen(true)
          }}
          onClick={() => {
            // A hold already opened the menu — don't also start a transaction
            if (heldRef.current) return
            if (menuOpen) setMenuOpen(false)
            else setCreateOpen(true)
          }}
          className={`relative overflow-hidden rounded-full grid place-items-center bg-gradient-to-br from-[#FF7A00] to-brand-deep text-white select-none ${
            inline
              ? 'h-9 w-9 shadow-[0_2px_6px_rgba(255,107,0,0.3)]'
              : 'h-16 w-16 shadow-[0_6px_18px_rgba(255,107,0,0.65)] border border-[rgba(255,200,140,0.6)]'
          }`}
          style={{ WebkitTouchCallout: 'none' }}
          title="Нова транзакція · утримуйте або правий клік — ще дії"
          aria-label="Нова транзакція"
        >
          <span className={`absolute top-0 left-[20%] right-[20%] rounded-full bg-[rgba(255,220,180,0.75)] ${inline ? 'h-px' : 'h-0.5'}`} />
          <motion.span animate={{ rotate: menuOpen ? 45 : 0 }} transition={{ type: 'spring', stiffness: 420, damping: 26 }}>
            <Plus size={inline ? 20 : 30} strokeWidth={inline ? 2.6 : 2.4} />
          </motion.span>
        </motion.button>
      </div>

      <CreateTxModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => setCreateOpen(false)} />
      <TransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onDone={() => {
          setTransferOpen(false)
          txBus.emit({ type: 'TRANSFER' }) // lists refresh themselves
        }}
      />
      <ScanReceiptModal open={scanOpen} onClose={() => setScanOpen(false)} onSaved={() => setScanOpen(false)} />
    </>
  )
}
