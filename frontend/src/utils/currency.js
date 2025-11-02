
const SUPPORTED = new Set(['USD','EUR','UAH','PLN','GBP','CHF','CZK','HUF'])

export function fmtCurrency(amount, code, locale='uk-UA') {
  const n = Number(amount) || 0
  if (code && SUPPORTED.has(code)) {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(n)
    } catch {}
  }
  return `${n.toLocaleString(locale, { minimumFractionDigits: 2 })}${code ? ` ${code}` : ''}`
}
