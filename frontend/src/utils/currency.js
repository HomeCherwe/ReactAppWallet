
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

const ISO_CODES = { UAH: 980, USD: 840, EUR: 978, GBP: 826, PLN: 985, CHF: 756, CZK: 203, HUF: 348, USDT: 840 }

/**
 * `amount` from one currency to another through UAH, with the rates of useMonoRates()
 * ("840->980" …). null when a rate is missing (rates not loaded yet).
 */
export function convertWithRates(amount, from, to, rates) {
  const a = Number(amount) || 0
  const fromCode = ISO_CODES[String(from || '').toUpperCase()] || 980
  const toCode = ISO_CODES[String(to || '').toUpperCase()] || 980
  if (fromCode === toCode) return a
  let inUAH = a
  if (fromCode !== 980) {
    const r = rates?.[`${fromCode}->980`]
    if (!r) return null
    inUAH = a * r
  }
  if (toCode === 980) return inUAH
  const r = rates?.[`${toCode}->980`]
  if (!r) return null
  return inUAH / r
}
