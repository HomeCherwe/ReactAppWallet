import React, { useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Dimensions,
  ActivityIndicator,
  ImageBackground,
  TouchableOpacity,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Colors, Radius, Typography } from '../constants/theme'
import { Card } from '../api/cards'
import { formatMoney, convertCurrency, RatesMap } from '../utils/currency'
import { CardSkeleton } from './Skeleton'

const { width } = Dimensions.get('window')
// The carousel bleeds to the screen edges; SIDE must match HomeScreen's horizontal padding
const SIDE = 20
const GAP = 12
// How much of the next card peeks in from the right
const PEEK = 24
const CARD_WIDTH = width - SIDE - GAP - PEEK
const SNAP = CARD_WIDTH + GAP

interface CardTheme {
  gradient: [string, string]
  isLight: boolean
  textColor: string
  subColor: string
  badgeBg: string
  badgeText: string
  borderColor: string
  chipBg: string
  chipBorder: string
  accentColor?: string
}

function getCardTheme(bank: string | null, name: string | null): CardTheme {
  const b = (bank || '').toLowerCase()
  const n = (name || '').toLowerCase()
  const full = `${b} ${n}`

  // 1. Monobank White
  if (
    n.includes('white') ||
    n.includes('вайт') ||
    n.includes('біл') ||
    (b.includes('mono') && (n.includes('white') || n.includes('вайт')))
  ) {
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
      accentColor: '#9CA3AF',
    }
  }

  // 2. Monobank Black
  if (
    n.includes('black') ||
    n.includes('блек') ||
    n.includes('чорн') ||
    (b.includes('mono') && (n.includes('black') || n.includes('блек')))
  ) {
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
      accentColor: Colors.orange,
    }
  }

  // 3. Binance / Crypto
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
      accentColor: '#F0B90B',
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
      accentColor: '#22C55E',
    }
  }

  // 5. Cash / Готівка
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
      accentColor: '#F97316',
    }
  }

  // 6. General Monobank
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
      accentColor: Colors.orange,
    }
  }

  // 7. Default Card
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

function formatMaskedNumber(num: string | null, bank: string | null, name: string | null): string {
  if (bank?.toLowerCase().includes('binance') || name?.toLowerCase().includes('spot')) {
    return 'BINANCE SPOT WALLET'
  }
  if (!num) return '•••• •••• •••• ••••'
  const clean = String(num).replace(/\D/g, '')
  if (clean.length >= 4) {
    return `•••• •••• •••• ${clean.slice(-4)}`
  }
  return `•••• •••• •••• ${String(num).slice(-4)}`
}

interface CardCarouselProps {
  cards: Card[]
  balances: Record<string, number>
  loading?: boolean
  rates?: RatesMap | null
  primaryCurrency?: string
  onPressCard?: (card: Card) => void
  excludedCardIds?: string[]
}

export default React.memo(CardCarousel)

function CardCarousel({
  cards,
  balances,
  loading,
  rates,
  primaryCurrency = 'UAH',
  onPressCard,
  excludedCardIds = [],
}: CardCarouselProps) {
  const scrollX = useRef(new Animated.Value(0)).current

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingRow}>
          <CardSkeleton width={CARD_WIDTH} />
          <CardSkeleton width={CARD_WIDTH} />
        </View>
        <View style={styles.dots}>
          <View style={[styles.dot, styles.dotSkeleton, { width: 20 }]} />
          <View style={[styles.dot, styles.dotSkeleton, { width: 6 }]} />
          <View style={[styles.dot, styles.dotSkeleton, { width: 6 }]} />
        </View>
      </View>
    )
  }

  if (!cards.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>Немає карток</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        snapToInterval={SNAP}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {cards.map((card, index) => {

          const theme = getCardTheme(card.bank, card.name)
          const balance = balances[card.id] ?? card.initial_balance ?? 0
          const maskedNumber = formatMaskedNumber((card.card_number ?? null), card.bank, card.name)

          const cur = (card.currency || 'UAH').toUpperCase()
          const isDifferent = cur !== primaryCurrency.toUpperCase()
          const balanceInPrimary = isDifferent ? convertCurrency(balance, cur, primaryCurrency, rates) : balance

          const CardBody = (
            <View style={styles.innerCard}>
              <View
                style={[
                  styles.circle1,
                  { backgroundColor: theme.isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.06)' },
                ]}
              />
              <View
                style={[
                  styles.circle2,
                  { backgroundColor: theme.isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.04)' },
                ]}
              />

              {/* Top Header */}
              <View style={styles.cardTop}>
                <View style={styles.cardTitleCol}>
                  <Text style={[styles.bankTag, { color: theme.subColor }]}>
                    {(card.bank || 'КАРТКА').toUpperCase()}
                  </Text>
                  <Text style={[styles.cardTitle, { color: theme.textColor }]} numberOfLines={1}>
                    {card.name}
                  </Text>
                </View>

                <View style={styles.cardHeaderRight}>
                  {excludedCardIds.includes(card.id) && (
                    <View style={styles.excludedBadge}>
                      <Text style={styles.excludedBadgeText}>Поза статистикою</Text>
                    </View>
                  )}
                  <View style={[styles.curBadge, { backgroundColor: theme.badgeBg }]}>
                    <Text style={[styles.curBadgeText, { color: theme.badgeText }]}>
                      {card.currency}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Middle Balance */}
              <View style={styles.balanceSection}>
                <Text style={[styles.balanceLabel, { color: theme.subColor }]}>
                  Баланс
                </Text>
                <Text style={[styles.balanceAmount, { color: theme.textColor }]}>
                  {formatMoney(balance, card.currency)}
                </Text>
                {isDifferent && Math.abs(balance) > 0 && (
                  <Text style={[styles.convertedSub, { color: theme.subColor }]}>
                    ≈ {formatMoney(balanceInPrimary, primaryCurrency, { hideCents: true })}
                  </Text>
                )}
              </View>

              {/* Bottom Card Number & Chip */}
              <View style={styles.cardBottom}>
                <Text style={[styles.cardNumber, { color: theme.subColor }]}>
                  {maskedNumber}
                </Text>

                <View style={[styles.chip, { backgroundColor: theme.chipBg }]}>
                  <View style={[styles.chipInner, { borderColor: theme.chipBorder }]} />
                </View>
              </View>
            </View>
          )

          return (
            <Animated.View
              key={card.id}
              style={[styles.cardWrapper, index === cards.length - 1 && { marginRight: 0 }]}
            >
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => onPressCard && onPressCard(card)}
              >
                {(card.bg_url ?? undefined) ? (
                  <ImageBackground
                    source={{ uri: (card.bg_url ?? undefined) }}
                    // Theme colour underneath, so the card isn't empty while the image loads
                    style={[styles.card, { borderColor: theme.borderColor, backgroundColor: theme.gradient[0] }]}
                    imageStyle={styles.cardBgImg}
                  >
                    <View style={styles.bgOverlay}>{CardBody}</View>
                  </ImageBackground>
                ) : (
                  <LinearGradient
                    colors={theme.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.card, { borderColor: theme.borderColor }]}
                  >
                    {CardBody}
                  </LinearGradient>
                )}
              </TouchableOpacity>
            </Animated.View>
          )
        })}
      </ScrollView>

      {/* Dots row always keeps its height (matches the skeleton), even with one card */}
      <View style={styles.dots}>
        {cards.length > 1 &&
          cards.map((_, i) => {
            const width_ = scrollX.interpolate({
              inputRange: [
                (i - 1) * (SNAP),
                i * (SNAP),
                (i + 1) * (SNAP),
              ],
              outputRange: [6, 20, 6],
              extrapolate: 'clamp',
            })
            const opacity = scrollX.interpolate({
              inputRange: [
                (i - 1) * (SNAP),
                i * (SNAP),
                (i + 1) * (SNAP),
              ],
              outputRange: [0.35, 1, 0.35],
              extrapolate: 'clamp',
            })
            return (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  { width: width_, opacity, backgroundColor: Colors.orange },
                ]}
              />
            )
          })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    // Bleed past HomeScreen's side padding so cards scroll edge to edge
    marginHorizontal: -SIDE,
  },
  scroll: {
    paddingLeft: SIDE,
    // Lets the last card snap to the same left edge as the others
    paddingRight: width - SIDE - CARD_WIDTH,
    paddingVertical: 4,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    marginRight: GAP,
  },
  card: {
    height: 195,
    borderRadius: Radius.xxl,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cardBgImg: {
    borderRadius: Radius.xxl,
  },
  bgOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  innerCard: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
  },
  circle1: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    top: -60,
    right: -60,
  },
  circle2: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    bottom: -40,
    left: -40,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleCol: {
    flex: 1,
    marginRight: 12,
  },
  bankTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  cardHeaderRight: {
    alignItems: 'flex-end',
  },
  curBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  curBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  balanceSection: {
    marginVertical: 4,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  balanceAmount: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  convertedSub: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardNumber: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  chip: {
    width: 32,
    height: 24,
    borderRadius: 5,
    padding: 3,
  },
  chipInner: {
    flex: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },
  excludedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    marginBottom: 6,
  },
  excludedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  loadingRow: {
    flexDirection: 'row',
    gap: GAP,
    paddingLeft: SIDE,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  dotSkeleton: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  emptyWrap: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: Radius.xl,
  },
  emptyText: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
})