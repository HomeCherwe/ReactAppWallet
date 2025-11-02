const SUPPORTED = new Set(['USD','EUR','UAH','PLN','GBP','CHF','CZK','HUF'])

export function fmtDate(iso) {
  return iso
    ? new Intl.DateTimeFormat('uk-UA', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso))
    : '—'
}

export function fmtAmount(value, currency) {
  const n = Number(value) || 0
  if (currency && SUPPORTED.has(currency)) {
    try {
      return new Intl.NumberFormat('uk-UA', { style: 'currency', currency }).format(n)
    } catch {}
  }
  return `${n.toLocaleString('uk-UA', { minimumFractionDigits: 2 })}${currency ? ` ${currency}` : ''}`
}
