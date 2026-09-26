// Card look: every card gets a colored gradient with white text (like Apple Wallet), picked by
// the bank — known banks get their brand color, any other bank a stable color from its name.

const WHITE_TEXT = {
  textColor: '#FFFFFF',
  subColor: 'rgba(255, 255, 255, 0.72)',
  borderColor: 'rgba(255, 255, 255, 0.14)',
}

// Monobank White / Black go by the card name
const CARD_NAMES = [
  [['white', 'вайт', 'біл'], ['#8A9099', '#4B5059']], // silver
  [['black', 'блек', 'чорн'], ['#3A3A40', '#141417']], // graphite
]

// [words, gradient]; first match wins, the bank name is checked before the card name
const BRANDS = [
  [['mono'], ['#3A3A40', '#141417']],
  [['binance', 'usdt', 'крипт'], ['#C99A06', '#5C4500']],
  [['revolut'], ['#4F6BFF', '#1E2A8C']],
  [['wise'], ['#4C9A2A', '#163300']],
  [['приват', 'privat'], ['#3DAE4A', '#11521E']],
  [['paypal'], ['#1F63D6', '#0B2C6E']],
  [['n26'], ['#2FB5A3', '#0E5049']],
  [['bnp', 'paribas'], ['#16A064', '#0A4A2E']],
  [['збер', 'savings', 'скарбн'], ['#1FA2C4', '#0B4A66']],
  [['гот', 'cash'], ['#34A86B', '#135838']],
]

// Deep iOS-colored gradients for everything else
const PALETTE = [
  ['#FF8A1F', '#A3430A'], // orange
  ['#5E5CE6', '#2A2880'], // indigo
  ['#BF5AF2', '#5B1F80'], // purple
  ['#FF375F', '#8A1430'], // pink
  ['#0A84FF', '#0A3D8F'], // blue
  ['#30B0C7', '#0F5260'], // teal
  ['#AC8E68', '#54402A'], // brown
]

function hashString(str) {
  let h = 0
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h)
}

export function getCardTheme(bank, name) {
  const b = String(bank || '').toLowerCase()
  const n = String(name || '').toLowerCase()
  const find = (rules, text) => rules.find(([words]) => words.some(w => text.includes(w)))?.[1]

  const gradient = find(CARD_NAMES, n) || find(BRANDS, b) || find(BRANDS, n) ||
    PALETTE[hashString(b || n) % PALETTE.length]
  return { gradient, ...WHITE_TEXT }
}

/** CSS background for a card without its own image: the gradient plus a soft light in the corner */
export function cardBackground(theme) {
  const [from, to] = theme.gradient
  return `radial-gradient(circle at 85% -10%, rgba(255,255,255,0.22), transparent 55%), linear-gradient(135deg, ${from}, ${to})`
}
