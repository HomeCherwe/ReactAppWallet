import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Search, X } from 'lucide-react'

// Long lists (cards, categories) get a filter field at the top
const FILTERABLE_FROM = 8
const MENU_MAX_HEIGHT = 380

/**
 * A filter chip with a glass dropdown (same look as the card menu and the iPhone app).
 * Shows its name, or the picked value with ✕ to clear it.
 * options: [{ value, label, hint? }]; `resetValue` is the "all" option's value.
 */
export default function FilterChip({ label, value, options, onChange, resetValue = '' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState(null)
  const chipRef = useRef(null)
  const menuRef = useRef(null)
  const active = value !== resetValue
  const current = options.find(o => o.value === value)
  const filterable = options.length > FILTERABLE_FROM

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter(o => o.value === resetValue || String(o.label).toLowerCase().includes(q)) : options
  }, [options, query, resetValue])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  // Under the chip, or above it when there's more room there
  useLayoutEffect(() => {
    if (!open || !chipRef.current) return
    const r = chipRef.current.getBoundingClientRect()
    const width = Math.max(r.width, 250)
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12))
    const below = window.innerHeight - r.bottom - 18
    const above = r.top - 18
    const up = below < 260 && above > below
    setPos({
      left,
      width,
      maxHeight: Math.min(MENU_MAX_HEIGHT, up ? above : below),
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const inside = e => menuRef.current?.contains(e.target) || chipRef.current?.contains(e.target)
    const onDown = e => !inside(e) && close()
    const onScroll = e => !menuRef.current?.contains(e.target) && close()
    const onKey = e => {
      if (e.key === 'Escape') {
        close()
        chipRef.current?.focus()
      }
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = v => {
    onChange(v)
    close()
    chipRef.current?.focus()
  }

  return (
    <>
      <div
        className={`inline-flex items-center h-8 rounded-full border text-xs font-semibold transition max-w-[240px] ${
          active
            ? 'bg-brand/15 border-brand/45 text-brand-light'
            : open
              ? 'bg-white/10 border-white/20 text-white'
              : 'bg-white/[0.06] border-white/10 text-white/80 hover:bg-white/10'
        }`}
      >
        <button
          ref={chipRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
          className={`h-full inline-flex items-center gap-1.5 min-w-0 pl-3 ${active ? 'pr-1.5' : 'pr-2.5'} rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
        >
          <span className="truncate">{active ? current?.label ?? label : label}</span>
          {!active && (
            <ChevronDown size={13} className={`shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
          )}
        </button>
        {active && (
          <button
            type="button"
            aria-label={`Скинути: ${label}`}
            onClick={() => onChange(resetValue)}
            className="h-full pr-2.5 pl-0.5 grid place-items-center text-brand-light/80 hover:text-brand-light rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X size={13} strokeWidth={2.6} />
          </button>
        )}
      </div>

      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={menuRef}
              role="listbox"
              aria-label={label}
              initial={{ opacity: 0, scale: 0.96, y: pos.top != null ? -4 : 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1 } }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight, transformOrigin: pos.top != null ? 'top left' : 'bottom left' }}
              className="fixed z-[90] flex flex-col rounded-2xl overflow-hidden bg-[rgba(32,32,38,0.94)] backdrop-blur-2xl border border-white/10 shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
            >
              <div className="shrink-0 px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-white/45">{label}</div>
              {filterable && (
                <div className="shrink-0 px-3 pb-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
                    <input
                      autoFocus
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => {
                        const first = shown.find(o => o.value !== resetValue)
                        if (e.key === 'Enter' && query.trim() && first) pick(first.value)
                      }}
                      placeholder="Знайти…"
                      className="w-full h-8 pl-8 pr-2 rounded-lg bg-white/[0.06] border border-white/10 text-[13px] text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-brand/60"
                    />
                  </div>
                </div>
              )}
              <div className="min-h-0 overflow-y-auto overscroll-contain pb-1.5">
                {shown.map(o => {
                  const selected = o.value === value
                  return (
                    <button
                      key={o.value || '__all'}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => pick(o.value)}
                      className={`w-full flex items-center gap-3 px-4 h-10 text-left text-sm transition-colors hover:bg-white/[0.07] focus:outline-none focus-visible:bg-white/[0.09] ${
                        selected ? 'text-brand-light font-semibold' : 'text-white'
                      } ${o.value === resetValue ? 'border-b border-white/[0.06] mb-1' : ''}`}
                    >
                      <span className="flex-1 truncate">{o.label}</span>
                      {o.hint && <span className="shrink-0 text-xs text-white/40">{o.hint}</span>}
                      <Check size={16} strokeWidth={2.6} className={`shrink-0 text-brand ${selected ? '' : 'invisible'}`} />
                    </button>
                  )
                })}
                {shown.length <= 1 && query.trim() && (
                  <div className="px-4 py-3 text-sm text-white/45">Нічого не знайдено</div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
