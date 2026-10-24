import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useTxMenuStore } from '../../store/useTxMenuStore'
import AddToSubscriptionModal from '../subscriptions/AddToSubscriptionModal'

const MARGIN = 8

/**
 * The right-click menu of a transaction (Row opens it) and the «Додати в підписку» window.
 * Mounted once in App, above every list, drawer and modal.
 */
export default function TxContextMenuHost() {
  const menu = useTxMenuStore(s => s.menu)
  const closeMenu = useTxMenuStore(s => s.closeMenu)
  const subscriptionTx = useTxMenuStore(s => s.subscriptionTx)
  const closeSubscriptionPicker = useTxMenuStore(s => s.closeSubscriptionPicker)
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  // Where it was clicked, kept inside the window
  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null)
    const { width, height } = ref.current.getBoundingClientRect()
    const x = menu.x + width + MARGIN > window.innerWidth ? Math.max(MARGIN, menu.x - width) : menu.x
    const y = menu.y + height + MARGIN > window.innerHeight ? Math.max(MARGIN, window.innerHeight - height - MARGIN) : menu.y
    setPos({ x, y })
  }, [menu])

  // A click elsewhere, Escape, scrolling or resizing closes it
  useEffect(() => {
    if (!menu) return
    const onDown = e => {
      if (!ref.current?.contains(e.target)) closeMenu()
    }
    const onKey = e => e.key === 'Escape' && closeMenu()
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', closeMenu, true)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('blur', closeMenu)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('blur', closeMenu)
    }
  }, [menu, closeMenu])

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {menu && (
            <motion.div
              ref={ref}
              key="tx-menu"
              role="menu"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              onContextMenu={e => e.preventDefault()}
              className="fixed min-w-[220px] p-1.5 rounded-2xl bg-[#1C1C21]/95 backdrop-blur-xl border border-white/10 shadow-[0_18px_40px_rgba(0,0,0,0.55)] origin-top-left"
              style={{ zIndex: 2000, left: pos?.x ?? menu.x, top: pos?.y ?? menu.y, visibility: pos ? 'visible' : 'hidden' }}
            >
              {menu.actions.map(a => (
                <button
                  key={a.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu()
                    a.onClick()
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-[13.5px] font-medium transition-colors hover:bg-white/[0.08] ${
                    a.danger ? 'text-rose-400' : 'text-white/90'
                  }`}
                >
                  <a.Icon size={16} className={a.danger ? 'text-rose-400' : a.ai ? 'text-[#C77DFF]' : 'text-brand'} />
                  {a.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
      <AddToSubscriptionModal tx={subscriptionTx} onClose={closeSubscriptionPicker} />
    </>
  )
}
