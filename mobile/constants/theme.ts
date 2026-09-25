export const Colors = {
  // Core palette — black & orange
  bg: '#0A0A0A',
  bgCard: '#111111',
  bgDeep: '#050505',

  orange: '#FF6B00',
  orangeLight: '#FF8C3A',
  orangeGlow: '#FF6B0033',
  orangeMid: '#FF7A1A',

  glass: 'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(255,255,255,0.10)',
  glassStrong: 'rgba(255,255,255,0.12)',

  white: '#FFFFFF',
  white80: 'rgba(255,255,255,0.80)',
  white60: 'rgba(255,255,255,0.60)',
  white40: 'rgba(255,255,255,0.40)',
  white20: 'rgba(255,255,255,0.20)',
  white10: 'rgba(255,255,255,0.10)',

  green: '#22C55E',
  red: '#EF4444',
  greenBg: 'rgba(34,197,94,0.15)',
  redBg: 'rgba(239,68,68,0.15)',

  text: '#FFFFFF',
  textSub: 'rgba(255,255,255,0.60)',
  textMuted: 'rgba(255,255,255,0.35)',
}

export const Gradients = {
  orangeMain: ['#FF6B00', '#FF3D00'] as const,
  orangeGlass: ['rgba(255,107,0,0.20)', 'rgba(255,61,0,0.05)'] as const,
  card1: ['#1C1006', '#FF6B0020'] as const,
  card2: ['#0D0D0D', '#1A1A1A'] as const,
  bg: ['#0A0A0A', '#130800'] as const,
  glassBtn: ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.04)'] as const,
}

export const Radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  pill: 100,
}

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
}

export const Typography = {
  hero: { fontSize: 42, fontWeight: '700' as const, letterSpacing: -1 },
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '600' as const },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  small: { fontSize: 11, fontWeight: '400' as const },
  label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.5 },
}
