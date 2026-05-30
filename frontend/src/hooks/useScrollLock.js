import { useEffect } from 'react'

/**
 * Locks body scroll while isLocked is true.
 * @param {boolean} isLocked
 * @param {number} exitDelay - ms to wait before unlocking (to cover exit animations)
 */
export function useScrollLock(isLocked, exitDelay = 0) {
  useEffect(() => {
    if (!isLocked) return

    // Get scrollbar width before hiding it
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    // Store original values
    const originalOverflow = document.body.style.overflow
    const originalPaddingRight = document.body.style.paddingRight

    // Lock scroll and compensate for scrollbar width
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    // Cleanup: restore after exit animation finishes
    return () => {
      if (exitDelay > 0) {
        const t = setTimeout(() => {
          document.body.style.overflow = originalOverflow
          document.body.style.paddingRight = originalPaddingRight
        }, exitDelay)
        return () => clearTimeout(t)
      } else {
        document.body.style.overflow = originalOverflow
        document.body.style.paddingRight = originalPaddingRight
      }
    }
  }, [isLocked]) // eslint-disable-line react-hooks/exhaustive-deps
}
