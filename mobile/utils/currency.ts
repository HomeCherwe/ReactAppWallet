// Currency conversion and formatting utilities matching web application logic

export interface RatesMap {
  [key: string]: number
}

let cachedRates: RatesMap | null = null
let ratesCachePromise: Promise<RatesMap> | null = null
const RATES_CACHE_TTL = 3600000 // 1 hour

export async function fetchExchangeRates(): Promise<RatesMap> {
  if (cachedRates) return cachedRates
  if (ratesCachePromise) return ratesCachePromise

  ratesCachePromise = (async () => {
    try {
      const resUAH = await fetch('https://open.er-api.com/v6/latest/UAH')
      if (!resUAH.ok) throw new Error('Failed to fetch UAH exchange rates')
      const dataUAH = await resUAH.json()

      const uahRates = dataUAH.rates || {}
      const map: RatesMap = {
        '980->980': 1, // UAH -> UAH
      }

      const codeMap: Record<string, string> = {
        '840': 'USD',
        '978': 'EUR',
        '826': 'GBP',
        '985': 'PLN',
        '756': 'CHF',
        '203': 'CZK',
        '348': 'HUF',
      }

      for (const [code, symbol] of Object.entries(codeMap)) {
        if (uahRates[symbol]) {
          map[`${code}->980`] = 1 / uahRates[symbol]
        }
      }

      cachedRates = map
      ratesCachePromise = null
      return map
    } catch (err) {
      console.warn('Failed to fetch live rates, using fallback rates:', err)
      ratesCachePromise = null
      // Fallback realistic rates
      const fallback: RatesMap = {
        '980->980': 1,
        '840->980': 44.69,
        '978->980': 51.29,
        '985->980': 12.05,
        '826->980': 58.70,
      }
      cachedRates = fallback
      return fallback
    }
  })()

  return ratesCachePromise
}

export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates?: RatesMap | null
): number {
  if (!fromCurrency || fromCurrency === toCurrency) return amount
  const r = rates || cachedRates

  const codeMap: Record<string, number> = {
    UAH: 980,
    USD: 840,
    USDT: 840,
    EUR: 978,
    GBP: 826,
    PLN: 985,
    CHF: 756,
    CZK: 203,
    HUF: 348,
  }

  const fromCode = codeMap[fromCurrency.toUpperCase()] || 980
  const toCode = codeMap[toCurrency.toUpperCase()] || 980

  if (fromCode === toCode) return amount

  // Convert to UAH first
  let inUAH = amount
  if (fromCode !== 980) {
    const rateToUAH = r?.[`${fromCode}->980`] ?? (fromCode === 840 ? 44.7 : fromCode === 978 ? 51.3 : 1)
    inUAH = amount * rateToUAH
  }

  if (toCode === 980) return inUAH

  // Convert from UAH to target currency
  const rateFromUAH = r?.[`${toCode}->980`] ?? (toCode === 840 ? 44.7 : toCode === 978 ? 51.3 : 1)
  return inUAH / rateFromUAH
}

export function formatMoney(
  amount: number,
  currency: string = 'UAH',
  options?: { hideCents?: boolean; sign?: boolean }
): string {
  const cur = (currency || 'UAH').toUpperCase()
  const minDigits = options?.hideCents ? 0 : 2
  const maxDigits = options?.hideCents ? 0 : 2

  const formattedNum = Math.abs(amount).toLocaleString('uk-UA', {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  })

  const prefix = options?.sign ? (amount > 0 ? '+' : amount < 0 ? '-' : '') : ''

  switch (cur) {
    case 'UAH':
      return `${prefix}₴${formattedNum}`
    case 'USD':
      return `${prefix}$${formattedNum}`
    case 'EUR':
      return `${prefix}€${formattedNum}`
    case 'USDT':
      return `${prefix}${formattedNum} USDT`
    case 'GBP':
      return `${prefix}£${formattedNum}`
    case 'PLN':
      return `${prefix}${formattedNum} zł`
    default:
      return `${prefix}${formattedNum} ${cur}`
  }
}

export function getBucket(card: { bank?: string | null; name?: string | null }): 'cards' | 'cash' | 'savings' {
  const bank = (card.bank || '').toLowerCase()
  const name = (card.name || '').toLowerCase()
  const full = `${bank} ${name}`

  if (full.includes('збер') || full.includes('savings')) return 'savings'
  if (full.includes('гот') || full.includes('cash')) return 'cash'
  return 'cards'
}
