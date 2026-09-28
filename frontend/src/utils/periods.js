// Period filter of the transactions search (same presets as the iPhone app)

// 'all' | 'month' | 'prev-month' | '3m' | 'year'
export const PERIODS = [
  { id: 'all', label: 'Весь час' },
  { id: 'month', label: 'Цей місяць' },
  { id: 'prev-month', label: 'Минулий місяць' },
  { id: '3m', label: '3 місяці' },
  { id: 'year', label: 'Цей рік' },
]

/** [from, to) of a period in local time, as ISO strings; nulls for "all time" */
export function periodRange(id, now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth()
  const iso = d => d.toISOString()
  switch (id) {
    case 'month':
      return { from: iso(new Date(y, m, 1)), to: null }
    case 'prev-month':
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 1)) }
    case '3m':
      return { from: iso(new Date(y, m - 2, 1)), to: null }
    case 'year':
      return { from: iso(new Date(y, 0, 1)), to: null }
    default:
      return { from: null, to: null }
  }
}
