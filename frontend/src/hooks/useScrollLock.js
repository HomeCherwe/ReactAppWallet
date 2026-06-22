import { useEffect, useRef } from 'react'

// Module-level state — shared across all modal instances.
let lockCount = 0
let unlockTimer = null
// The REAL original overflow before any modal was opened.
// Only captured once when transitioning from fully-unlocked state.
let originalOverflow = ''
let originalPaddingRight = ''

function applyLock() {
  // If a pending unlock timer exists, cancel it — we're locking again.
  const wasTimerActive = unlockTimer !== null
  if (wasTimerActive) {
    clearTimeout(unlockTimer)
    unlockTimer = null
  }

  if (lockCount === 0) {
    // Only save state when transitioning from a fully unlocked state (no active timer).
    if (!wasTimerActive) {
      originalOverflow = document.body.style.overflow
      originalPaddingRight = document.body.style.paddingRight
    }
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }
  }
  lockCount++
}

function releaseLock(exitDelay = 0) {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount > 0) return // Other modals still open

  if (exitDelay > 0) {
    unlockTimer = setTimeout(() => {
      unlockTimer = null
      document.body.style.overflow = originalOverflow
      document.body.style.paddingRight = originalPaddingRight
    }, exitDelay)
  } else {
    // Cancel any pending delayed unlock first
    if (unlockTimer !== null) {
      clearTimeout(unlockTimer)
      unlockTimer = null
    }
    document.body.style.overflow = originalOverflow
    document.body.style.paddingRight = originalPaddingRight
  }
}

/**
 * Locks body scroll while isLocked is true.
 * @param {boolean} isLocked
 * @param {number} exitDelay - ms to wait before unlocking (to cover exit animations)
 */
export function useScrollLock(isLocked, exitDelay = 0) {
  const lockedRef = useRef(false)

  useEffect(() => {
    if (isLocked && !lockedRef.current) {
      lockedRef.current = true
      applyLock()
    } else if (!isLocked && lockedRef.current) {
      lockedRef.current = false
      releaseLock(exitDelay)
    }
  }, [isLocked]) // eslint-disable-line react-hooks/exhaustive-deps

  // Safety net: release on unmount if still locked
  useEffect(() => {
    return () => {
      if (lockedRef.current) {
        lockedRef.current = false
        releaseLock(0)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

