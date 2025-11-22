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
  // Track mousedown position to detect if user dragged
  // Must be called before any conditional returns
  const mouseDownRef = useRef({ x: 0, y: 0 })
  
  useScrollLock(open)

  // Handle Escape key to close modal
  useEffect(() => {
    if (!open) return
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  // Convert maxWidth to CSS value
  const maxWidthMap = {
    'sm': '28rem',   // 448px
    'md': '28rem',   // 448px
    'lg': '32rem',   // 512px
    'xl': '36rem',   // 576px
    '2xl': '42rem'   // 672px
  }
  const maxWidthValue = typeof maxWidth === 'string' && maxWidthMap[maxWidth]
    ? maxWidthMap[maxWidth]
    : (typeof maxWidth === 'string' && maxWidth.includes('rem') || maxWidth.includes('px') || maxWidth.includes('%'))
      ? maxWidth
      : '28rem' // default to md

  if (!open) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center"
          style={{ 
            zIndex,
            top: '-20px',
            left: '-20px',
            right: '-20px',
            bottom: '-20px',
            padding: '1rem'
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            // Only close if clicking on backdrop (not on modal content)
            if (e.target === e.currentTarget) {
              mouseDownRef.current = { x: e.clientX, y: e.clientY }
            }
          }}
          onMouseUp={(e) => {
            // Only close if mouse didn't move (no drag) and clicked on backdrop
            if (e.target === e.currentTarget) {
              const moved = Math.abs(e.clientX - mouseDownRef.current.x) > 5 || 
                           Math.abs(e.clientY - mouseDownRef.current.y) > 5
              if (!moved) {
                onClose()
              }
            }
          }}
        >
          <motion.div
            className="rounded-2xl bg-white p-5"
            style={{
              width: '94vw',
              maxWidth: maxWidthValue,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 15px rgba(99, 102, 241, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              willChange: 'transform, opacity',
              transform: 'translate3d(0,0,0)',
              backfaceVisibility: 'hidden'
            }}
            initial={{ y: 20, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between mb-3">
                {title && (
                  typeof title === 'string' ? (
                    <div className="font-semibold">{title}</div>
                  ) : (
                    title
                  )
                )}
                {showCloseButton && (
                  <button
                    className="p-2 rounded-lg hover:bg-gray-100"
                    onClick={onClose}
                  >
                    <X size={18} />
                  </button>
                )}
                {!title && showCloseButton && <div />}
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

