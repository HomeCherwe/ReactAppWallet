import { useEffect, useRef, useState } from 'react'

// Each digit column holds 0-9 three times; resting position is the middle copy,
// so a digit can roll up (increase) or down (decrease) past 9↔0 without jumping back.
const STRIP = Array.from({ length: 30 }, (_, i) => i % 10)
const ROW_EM = 1.2

function Digit({ digit, direction, delay }) {
  const [row, setRow] = useState(digit + 10)
  const [rolling, setRolling] = useState(false)
  const current = useRef(digit)

  useEffect(() => {
    const from = current.current
    current.current = digit
    if (from === digit) return

    let target = digit + 10
    if (direction > 0 && digit < from) target = digit + 20 // roll up past 9 → 0
    if (direction < 0 && digit > from) target = digit // roll down past 0 → 9
    setRolling(true)
    setRow(target)
  }, [digit])

  return (
    <span aria-hidden="true" className="inline-block overflow-hidden align-bottom" style={{ height: `${ROW_EM}em` }}>
      <span
        className="block motion-reduce:!transition-none"
        style={{
          transform: `translateY(${-row * ROW_EM}em)`,
          transition: rolling ? `transform 650ms cubic-bezier(0.33, 1, 0.68, 1) ${delay}ms` : 'none',
        }}
        onTransitionEnd={() => {
          setRolling(false)
          setRow(current.current + 10)
        }}
      >
        {STRIP.map((d, i) => (
          <span key={i} className="block" style={{ height: `${ROW_EM}em`, lineHeight: `${ROW_EM}em` }}>
            {d}
          </span>
        ))}
      </span>
    </span>
  )
}

/**
 * Odometer-style number, same as the iPhone Home: when `value` changes, each digit rolls
 * up (value grew) or down (value shrank) to its new position.
 */
export default function RollingNumber({ value, format }) {
  const prev = useRef(value)
  const direction = Math.sign(value - prev.current)
  useEffect(() => {
    prev.current = value
  }, [value])

  const text = format(value)
  const chars = text.split('')
  const digitCount = chars.filter(c => c >= '0' && c <= '9').length
  let digitIndex = 0

  return (
    <span aria-label={text} className="inline-flex whitespace-pre align-bottom">
      {chars.map((ch, i) => {
        // Key from the right so existing digits keep their column when the number grows
        const key = chars.length - i
        if (ch >= '0' && ch <= '9') {
          const fromRight = digitCount - digitIndex++
          return <Digit key={key} digit={Number(ch)} direction={direction} delay={Math.max(0, 6 - fromRight) * 25} />
        }
        return (
          <span key={key} aria-hidden="true" style={{ height: `${ROW_EM}em`, lineHeight: `${ROW_EM}em` }}>
            {ch}
          </span>
        )
      })}
    </span>
  )
}
