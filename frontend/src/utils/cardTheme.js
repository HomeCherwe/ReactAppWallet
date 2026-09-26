// Card look per bank — the same themes, buckets and number mask as the iPhone app
// (mobile/components/CardCarousel.tsx, mobile/utils/currency.ts)

const ORANGE = '#FF6B00'

export function getCardTheme(bank, name) {
  const b = String(bank || '').toLowerCase()
  const n = String(name || '').toLowerCase()
  const full = `${b} ${n}`

  // 1. Monobank White
  if (n.includes('white') || n.includes('вайт') || n.includes('біл')) {
    return {
      gradient: ['#FFFFFF', '#E9EDF2'],
      isLight: true,
      textColor: '#121417',
      subColor: '#6B7280',
      badgeBg: 'rgba(0, 0, 0, 0.08)',
      badgeText: '#1F2937',
      borderColor: 'rgba(0, 0, 0, 0.12)',
      chipBg: '#D1D5DB',
      chipBorder: '#9CA3AF',
    }
  }
  // 2. Monobank Black
  if (n.includes('black') || n.includes('блек') || n.includes('чорн')) {
    return {
      gradient: ['#1A1A1E', '#0D0D10'],
      isLight: false,
      textColor: '#FFFFFF',
      subColor: 'rgba(255, 255, 255, 0.65)',
      badgeBg: 'rgba(255, 107, 0, 0.20)',
      badgeText: '#FF8C3A',
      borderColor: 'rgba(255, 107, 0, 0.35)',
      chipBg: 'rgba(255, 255, 255, 0.20)',
      chipBorder: 'rgba(255, 255, 255, 0.45)',
    }
  }
  // 3. Binance / crypto
  if (full.includes('binance') || full.includes('usdt') || full.includes('крипт')) {
    return {
      gradient: ['#2B2100', '#151000'],
      isLight: false,
      textColor: '#FFFFFF',
      subColor: 'rgba(255, 255, 255, 0.70)',
      badgeBg: 'rgba(240, 185, 11, 0.22)',
      badgeText: '#F0B90B',
      borderColor: 'rgba(240, 185, 11, 0.35)',
      chipBg: 'rgba(240, 185, 11, 0.25)',
      chipBorder: 'rgba(240, 185, 11, 0.55)',
    }
  }
  // 4. PrivatBank
  if (full.includes('приват') || full.includes('privat')) {
    return {
      gradient: ['#0C2B19', '#043A1E'],
      isLight: false,
      textColor: '#FFFFFF',
      subColor: 'rgba(255, 255, 255, 0.70)',
      badgeBg: 'rgba(34, 197, 94, 0.22)',
      badgeText: '#4ADE80',
      borderColor: 'rgba(34, 197, 94, 0.35)',
      chipBg: 'rgba(34, 197, 94, 0.25)',
      chipBorder: 'rgba(34, 197, 94, 0.55)',
    }
  }
  // 5. Cash
  if (full.includes('гот') || full.includes('cash')) {
    return {
      gradient: ['#321E12', '#1A1009'],
      isLight: false,
      textColor: '#FFFFFF',
      subColor: 'rgba(255, 255, 255, 0.70)',
      badgeBg: 'rgba(249, 115, 22, 0.22)',
      badgeText: '#FB923C',
      borderColor: 'rgba(249, 115, 22, 0.35)',
      chipBg: 'rgba(249, 115, 22, 0.25)',
      chipBorder: 'rgba(249, 115, 22, 0.55)',
    }
  }
  // 6. Any other Monobank card
  if (full.includes('mono')) {
    return {
      gradient: ['#222226', '#121215'],
      isLight: false,
      textColor: '#FFFFFF',
      subColor: 'rgba(255, 255, 255, 0.65)',
      badgeBg: 'rgba(255, 107, 0, 0.20)',
      badgeText: '#FF8C3A',
      borderColor: 'rgba(255, 107, 0, 0.35)',
      chipBg: 'rgba(255, 255, 255, 0.20)',
      chipBorder: 'rgba(255, 255, 255, 0.45)',
    }
  }
  // 7. Default
  return {
    gradient: ['#1C1410', '#100C0A'],
    isLight: false,
    textColor: '#FFFFFF',
    subColor: 'rgba(255, 255, 255, 0.65)',
    badgeBg: 'rgba(255, 255, 255, 0.10)',
    badgeText: 'rgba(255, 255, 255, 0.85)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    chipBg: 'rgba(255, 255, 255, 0.20)',
    chipBorder: 'rgba(255, 255, 255, 0.45)',
  }
}

/** CSS background for a card without its own image */
export function cardBackground(theme) {
  const [from, to] = theme.gradient
  return `linear-gradient(135deg, ${from}, ${to})`
}

/** Which group the card goes to on the cards page: cards, savings or cash */
export function getBucket(card) {
  const full = `${card?.bank || ''} ${card?.name || ''}`.toLowerCase()
  if (full.includes('збер') || full.includes('savings')) return 'savings'
  if (full.includes('гот') || full.includes('cash')) return 'cash'
  return 'cards'
}

export function formatMaskedNumber(num, bank, name) {
  if (String(bank || '').toLowerCase().includes('binance') || String(name || '').toLowerCase().includes('spot')) {
    return 'BINANCE SPOT WALLET'
  }
  if (!num) return '•••• •••• •••• ••••'
  const clean = String(num).replace(/\D/g, '')
  return `•••• •••• •••• ${(clean.length >= 4 ? clean : String(num)).slice(-4)}`
}

const SYMBOL_BEFORE = { UAH: '₴', USD: '$', EUR: '€', GBP: '£' }

/** Money like on the iPhone: ₴1 234,56 · $12,00 · 5,00 zł · 10,00 USDT */
export function formatMoney(amount, currency = 'UAH', { hideCents = false } = {}) {
  const cur = String(currency || 'UAH').toUpperCase()
  const digits = hideCents ? 0 : 2
  const num = Math.abs(Number(amount) || 0).toLocaleString('uk-UA', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  if (SYMBOL_BEFORE[cur]) return `${SYMBOL_BEFORE[cur]}${num}`
  if (cur === 'PLN') return `${num} zł`
  return `${num} ${cur}`
}
