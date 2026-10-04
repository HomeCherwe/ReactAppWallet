// "Вже є": scanned transactions that are already on the card (same as the iPhone app's scanner)

// Existing: { id, amount, created_at, note?, merchant_name? }
// Candidate: { key, amount (signed: negative = expense), date: Date }

// A screenshot shows the day of the purchase; the card may have it a day earlier or later
export const MATCH_DAYS = 1

const dayIndex = d => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5)

/**
 * Pairs scanned transactions with ones already on the card: same amount (to the cent, same sign),
 * date within MATCH_DAYS (calendar days, local time), the closest date first. Each existing
 * transaction pairs once, so two equal purchases on a screenshot need two on the card.
 */
export function matchExisting(candidates, existing) {
  const free = [...existing]
  const out = new Map()
  const pairs = []
  for (const c of candidates) {
    for (const e of free) {
      if (Math.abs(Number(e.amount) - c.amount) > 0.005) continue
      const diff = Math.abs(dayIndex(new Date(e.created_at)) - dayIndex(c.date))
      if (diff <= MATCH_DAYS) pairs.push({ key: c.key, e, diff })
    }
  }
  // Same-day pairs first, so a purchase from the next day can't take another one's twin
  pairs.sort((a, b) => a.diff - b.diff)
  const used = new Set()
  for (const p of pairs) {
    if (out.has(p.key) || used.has(p.e)) continue
    out.set(p.key, p.e)
    used.add(p.e)
  }
  return out
}

/** The window of dates to load from the card for these candidates */
export function matchWindow(candidates) {
  if (candidates.length === 0) return null
  const times = candidates.map(c => c.date.getTime())
  const pad = (MATCH_DAYS + 1) * 864e5
  return { from: new Date(Math.min(...times) - pad), to: new Date(Math.max(...times) + pad) }
}
