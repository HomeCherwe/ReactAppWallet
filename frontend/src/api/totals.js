import { supabase } from '../lib/supabase'

function emptyOut() { return { cash: {}, cards: {}, savings: {} } }

export async function fetchTotalsByBucket() {
  const { data, error } = await supabase.rpc('totals_by_bucket')
  if (error) throw error

  try {
    const d = data
    if (!d) return emptyOut()

    // If RPC returned a single object (common case)
    if (!Array.isArray(d) && typeof d === 'object') {
      return d
    }

    // If RPC returned an array with one object that contains buckets
    if (Array.isArray(d) && d.length === 1 && typeof d[0] === 'object') {
      const candidate = d[0]
      if (candidate.cash || candidate.cards || candidate.savings) return candidate
    }

    // If RPC returned rows, try to normalize several possible shapes.
    // Possibility A: rows like [{ bucket: 'cash', totals: { UAH: 123 } }, ...]
    // Possibility B: rows like [{ bucket: 'cash', currency: 'UAH', total: 123 }, ...]
    const out = emptyOut()

    // Detect per-row currency totals
    const looksLikeCurrencyRows = d.every(r => r && (r.currency || r.total || r.amount))
    if (looksLikeCurrencyRows) {
      for (const row of d) {
        const bucket = (row.bucket || row.type || 'cards').toString()
        const cur = (row.currency || row.curr || row.code || 'UAH').toString().toUpperCase()
        const val = Number(row.total ?? row.amount ?? row.sum ?? row.value ?? 0)
        if (!out[bucket]) out[bucket] = {}
        out[bucket][cur] = (out[bucket][cur] || 0) + val
      }
      return out
    }

    // Otherwise, try rows with a totals field (object or JSON string)
    for (const row of d) {
      const bucket = (row.bucket || row.type || row.name || 'cards').toString()
      let totals = row.totals ?? row.data ?? row.value ?? null
      if (!totals && typeof row === 'object' && Object.keys(row).length > 1) {
        // maybe the row itself is the totals object
        totals = { ...row }
        delete totals.bucket
      }

      if (typeof totals === 'string') {
        try { totals = JSON.parse(totals) } catch { /* ignore parse error */ }
      }

      if (!totals || typeof totals !== 'object') continue
      if (!out[bucket]) out[bucket] = {}
      for (const [k,v] of Object.entries(totals)) out[bucket][k.toUpperCase()] = Number(v || 0)
    }

    return out
  } catch (e) {
    // On any parsing error, return empty structure to avoid crashes
    console.error('fetchTotalsByBucket parse error', e)
    return emptyOut()
  }
}