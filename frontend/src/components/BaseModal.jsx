import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useScrollLock } from '../hooks/useScrollLock'

/**
 * Base modal component with consistent styling and animations
 * @param {Object} props
 * @param {boolean} props.open - Whether the modal is open
 * @param {Function} props.onClose - Callback when modal should close (backdrop click, Escape key, or close button)
 * @param {string} [props.title] - Optional title text
 * @param {boolean} [props.showCloseButton=true] - Whether to show close button
 * @param {number|string} [props.zIndex=100] - Z-index for the modal
 * @param {'sm'|'md'|'lg'|'xl'|'2xl'|string} [props.maxWidth='md'] - Max width class or custom value
 * @param {React.ReactNode} props.children - Modal content
 */
export default function BaseModal({
  open,
  onClose,
  title,
  showCloseButton = true,
  zIndex = 100,
  maxWidth = 'md',
  children
}) {
  const mouseDownRef = useRef({ x: 0, y: 0 })

  useScrollLock(open, 400)

  // Handle Escape key to close modal
  useEffect(() => {
    if (!open) return
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  // Convert maxWidth to CSS value
  const maxWidthMap = {
    'sm': '28rem',
    'md': '28rem',
    'lg': '32rem',
    'xl': '36rem',
    '2xl': '42rem'
  }
  const maxWidthValue = typeof maxWidth === 'string' && maxWidthMap[maxWidth]
    ? maxWidthMap[maxWidth]
    : (typeof maxWidth === 'string' && (maxWidth.includes('rem') || maxWidth.includes('px') || maxWidth.includes('%')))
      ? maxWidth
      : '28rem'

  const springTransition = { type: 'spring', stiffness: 380, damping: 34 }

  return createPortal(
    <AnimatePresence>
      {/* Overlay — direct child of AnimatePresence with key */}
      {open && (
        <motion.div
          key="base-modal-overlay"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          style={{ zIndex }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              mouseDownRef.current = { x: e.clientX, y: e.clientY }
            }
          }}
          onMouseUp={(e) => {
            if (e.target === e.currentTarget) {
              const moved = Math.abs(e.clientX - mouseDownRef.current.x) > 5 ||
                            Math.abs(e.clientY - mouseDownRef.current.y) > 5
              if (!moved) onClose()
            }
          }}
        />
      )}

      {/* Modal card — direct child of AnimatePresence with key */}
      {open && (
        <motion.div
          key="base-modal-card"
          // Phone: a sheet from the bottom like the iPhone app; wider screens: centered card
          className="fixed inset-0 m-auto flex items-end sm:items-center justify-center pointer-events-none sm:p-4"
          style={{ zIndex: zIndex + 1 }}
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 60 }}
          transition={springTransition}
        >
          <div
            // Never taller than the screen: the header stays, the content scrolls
            className="relative flex flex-col max-h-[calc(100dvh-12px)] sm:max-h-[calc(100dvh-32px)] rounded-t-[28px] sm:rounded-[28px] bg-surface-raised/95 backdrop-blur-2xl border border-white/10 border-b-0 sm:border-b pointer-events-auto w-full shadow-[0_-10px_40px_rgba(0,0,0,0.5)] sm:shadow-[0_25px_60px_rgba(0,0,0,0.6)]"
            style={{
              maxWidth: maxWidthValue,
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Sheet grabber (phone) */}
            <div className="sm:hidden mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/25" />
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-0 shrink-0">
                {title && (
                  typeof title === 'string' ? (
                    <div className="text-lg font-bold tracking-tight">{title}</div>
                  ) : (
                    title
                  )
                )}
                {showCloseButton && (
                  <button
                    className="h-8 w-8 grid place-items-center rounded-full bg-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.14] ml-auto transition-colors"
                    onClick={onClose}
                  >
                    <X size={16} />
                  </button>
                )}
                {!title && showCloseButton && <div />}
              </div>
            )}
            <div className="p-5 pt-3 min-h-0 overflow-y-auto overscroll-contain">
              {children}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
