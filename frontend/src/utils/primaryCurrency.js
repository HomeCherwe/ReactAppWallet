import { useSettingsStore } from '../store/useSettingsStore'

// Same list as the iPhone app (mobile/utils/settings.ts); the choice is stored in
// user_preferences.preferences.primaryCurrency, so both apps share it.
export const SUPPORTED_CURRENCIES = [
  { code: 'UAH', symbol: '₴', name: 'Українська гривня', flag: '🇺🇦' },
  { code: 'EUR', symbol: '€', name: 'Євро', flag: '🇪🇺' },
  { code: 'USD', symbol: '$', name: 'Долар США', flag: '🇺🇸' },
  { code: 'PLN', symbol: 'zł', name: 'Польський злотий', flag: '🇵🇱' },
  { code: 'GBP', symbol: '£', name: 'Британський фунт', flag: '🇬🇧' },
]

const ISO_CODES = { UAH: 980, USD: 840, EUR: 978, GBP: 826, PLN: 985, USDT: 840 }

/** The user's main currency (everything on Home is shown in it) */
export function usePrimaryCurrency() {
  const code = useSettingsStore(state => state.settings?.primaryCurrency)
  return SUPPORTED_CURRENCIES.some(c => c.code === code) ? code : 'UAH'
}

export function setPrimaryCurrency(code) {
  useSettingsStore.getState().updateSetting('primaryCurrency', code)
}

export function currencySymbol(code) {
  return SUPPORTED_CURRENCIES.find(c => c.code === code)?.symbol || code
}

/**
 * Converts through UAH with Monobank rates (`rates['978->980']` etc.); USDT counts as USD.
 * Returns null when a needed rate isn't loaded yet.
 */
export function convertAmount(amount, from, to, rates) {
  const fromCode = ISO_CODES[String(from || 'UAH').toUpperCase()] || 980
  const toCode = ISO_CODES[String(to || 'UAH').toUpperCase()] || 980
  if (fromCode === toCode) return amount
  let inUAH = amount
  if (fromCode !== 980) {
    const rate = rates?.[`${fromCode}->980`]
    if (!rate) return null
    inUAH = amount * rate
  }
  if (toCode === 980) return inUAH
  const rate = rates?.[`${toCode}->980`]
  if (!rate) return null
  return inUAH / rate
}

/** { EUR: 7250, USD: 3800 } as one number in `to` (0 for a currency whose rate isn't loaded) */
export function sumIn(byCurrency, to, rates) {
  return Object.entries(byCurrency || {}).reduce(
    (sum, [cur, amount]) => sum + (convertAmount(Number(amount) || 0, cur, to, rates) ?? 0),
    0
  )
}

/** The other two of UAH / EUR / USD next to a total in the main currency, like the iPhone app */
export function equivalentCurrencies(primary) {
  if (primary === 'UAH') return ['EUR', 'USD']
  if (primary === 'EUR') return ['UAH', 'USD']
  if (primary === 'USD') return ['UAH', 'EUR']
  return ['UAH', 'EUR']
}
