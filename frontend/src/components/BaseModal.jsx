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
          className="fixed inset-0 bg-black/40 backdrop-blur-sm"
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
          className="fixed inset-0 m-auto flex items-center justify-center pointer-events-none"
          style={{ zIndex: zIndex + 1, padding: '1rem' }}
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.96 }}
          transition={springTransition}
        >
          <div
            className="rounded-2xl bg-white pointer-events-auto w-full"
            style={{
              maxWidth: maxWidthValue,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25), 0 0 15px rgba(99,102,241,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between px-5 pt-5 pb-0">
                {title && (
                  typeof title === 'string' ? (
                    <div className="font-semibold">{title}</div>
                  ) : (
                    title
                  )
                )}
                {showCloseButton && (
                  <button
                    className="p-2 rounded-lg hover:bg-gray-100 ml-auto"
                    onClick={onClose}
                  >
                    <X size={18} />
                  </button>
                )}
                {!title && showCloseButton && <div />}
              </div>
            )}
            <div className="p-5 pt-3">
              {children}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
