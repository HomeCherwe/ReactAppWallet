// Card look per bank, the same themes as the iPhone app's card carousel
// (mobile/components/CardCarousel.tsx → getCardTheme)

const ORANGE = '#FF6B00'

export function getCardTheme(bank, name) {
  const b = String(bank || '').toLowerCase()
  const n = String(name || '').toLowerCase()
  const full = `${b} ${n}`

  // Monobank White
  if (n.includes('white') || n.includes('вайт') || n.includes('біл')) {
    return {
      gradient: ['#FFFFFF', '#E9EDF2'],
      isLight: true,
      textColor: '#121417',
      subColor: '#6B7280',
      borderColor: 'rgba(0, 0, 0, 0.12)',
      accentColor: '#9CA3AF',
    }
  }
  // Monobank Black
  if (n.includes('black') || n.includes('блек') || n.includes('чорн')) {
    return {
      gradient: ['#1A1A1E', '#0D0D10'],
      textColor: '#FFFFFF',
      subColor: 'rgba(255, 255, 255, 0.65)',
      borderColor: 'rgba(255, 107, 0, 0.35)',
      accentColor: ORANGE,
    }
  }
  // Binance / crypto
  if (full.includes('binance') || full.includes('usdt') || full.includes('крипт')) {
    return {
      gradient: ['#2B2100', '#151000'],
      textColor: '#FFFFFF',
      subColor: 'rgba(255, 255, 255, 0.70)',
      borderColor: 'rgba(240, 185, 11, 0.35)',
      accentColor: '#F0B90B',
    }
  }
  // PrivatBank
  if (full.includes('приват') || full.includes('privat')) {
    return {
      gradient: ['#0C2B19', '#043A1E'],
      textColor: '#FFFFFF',
      subColor: 'rgba(255, 255, 255, 0.70)',
      borderColor: 'rgba(34, 197, 94, 0.35)',
      accentColor: '#22C55E',
    }
  }
  // Cash
  if (full.includes('гот') || full.includes('cash')) {
    return {
      gradient: ['#321E12', '#1A1009'],
      textColor: '#FFFFFF',
      subColor: 'rgba(255, 255, 255, 0.70)',
      borderColor: 'rgba(249, 115, 22, 0.35)',
      accentColor: '#F97316',
    }
  }
  // Any other Monobank card
  if (full.includes('mono')) {
    return {
      gradient: ['#222226', '#121215'],
      textColor: '#FFFFFF',
      subColor: 'rgba(255, 255, 255, 0.65)',
      borderColor: 'rgba(255, 107, 0, 0.35)',
      accentColor: ORANGE,
    }
  }
  // Default
  return {
    gradient: ['#1C1410', '#100C0A'],
    textColor: '#FFFFFF',
    subColor: 'rgba(255, 255, 255, 0.65)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    accentColor: 'rgba(255, 255, 255, 0.5)',
  }
}

/** CSS background for a card without its own image: themed gradient + a soft accent glow */
export function cardBackground(theme) {
  const [from, to] = theme.gradient
  return `radial-gradient(circle at 88% 0%, ${theme.accentColor}33, transparent 55%), linear-gradient(135deg, ${from}, ${to})`
}
