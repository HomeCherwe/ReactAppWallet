import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Easing, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { initialWindowMetrics } from 'react-native-safe-area-context'
import { Colors } from '../constants/theme'
import { listPeriodTransactions, Transaction } from '../api/transactions'
import { Card, listCards } from '../api/cards'
import { fetchExchangeRates, formatMoney, RatesMap } from '../utils/currency'
import { getStoredPrimaryCurrency } from '../utils/settings'
import { useExcludedCardIds } from '../utils/cardExclusion'
import { useExcludedCategories } from '../utils/statsCategories'
import { countedTransactions } from '../utils/statsCount'
import { computeWrapped, MONTHS_NOM, WEEKDAYS_ACC, WrappedData, wrappedText } from '../utils/wrapped'
import { triggerLightHaptic } from '../utils/haptics'

const TOP = initialWindowMetrics?.insets.top ?? 47
const BOTTOM = initialWindowMetrics?.insets.bottom ?? 34
// Each story stays this long unless tapped on
const SLIDE_MS = 6500

interface Slide {
  key: string
  colors: [string, string]
  emoji: string
  kicker: string
  big: string
  sub?: string
  list?: { emoji: string; text: string }[]
}

/** The year a Wrapped opens on: the last one in January–February, otherwise this one so far */
export function defaultWrappedYear(now = new Date()): number {
  return now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear()
}

function buildSlides(w: WrappedData): Slide[] {
  const money = (v: number) => formatMoney(v, w.currency, { hideCents: true })
  const slides: Slide[] = [
    {
      key: 'intro',
      colors: ['#FF6B00', '#7A1FA2'],
      emoji: '🎁',
      kicker: 'MyWallet Wrapped',
      big: `Твій ${w.year}`,
      sub: `${w.expenses} покупок за ${w.days} днів. Погнали дивитись, куди пішли гроші →`,
    },
    {
      key: 'total',
      colors: ['#0F2027', '#2C5364'],
      emoji: '💸',
      kicker: 'За рік витрачено',
      big: money(w.spent),
      sub: `і зароблено ${money(w.earned)} — ${w.earned >= w.spent ? `у плюсі на ${money(w.earned - w.spent)}` : `мінус ${money(w.spent - w.earned)}`}`,
    },
  ]
  if (w.topMerchant) {
    slides.push({
      key: 'merchant',
      colors: ['#11998E', '#0B3D2E'],
      emoji: '🏆',
      kicker: 'Улюблене місце',
      big: w.topMerchant.name,
      sub: `${w.topMerchant.count} разів · ${money(w.topMerchant.total)}`,
    })
  }
  if (w.priciestDay) {
    slides.push({
      key: 'day',
      colors: ['#C31432', '#240B36'],
      emoji: '📅',
      kicker: 'Найдорожчий день',
      big: w.priciestDay.date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' }),
      sub: `${money(w.priciestDay.total)} за ${w.priciestDay.count} ${w.priciestDay.count === 1 ? 'покупку' : 'покупок'} · найбільше — ${w.priciestDay.top}`,
    })
  }
  if (w.topCategory) {
    slides.push({
      key: 'category',
      colors: ['#F7971E', '#7B2E00'],
      emoji: '🥇',
      kicker: 'Найбільше пішло на',
      big: w.topCategory.name,
      sub: `${Math.round(w.topCategory.share * 100)}% усіх витрат · ${money(w.topCategory.total)}`,
    })
  }
  if (w.coffee) {
    slides.push({
      key: 'coffee',
      colors: ['#6F4E37', '#1E120B'],
      emoji: w.coffee.kind === 'coffee' ? '☕' : '🍽️',
      kicker: w.coffee.kind === 'coffee' ? 'Кави за рік' : 'Поїсти не вдома',
      big: w.coffee.kind === 'coffee' ? `${w.coffee.count}` : `${w.coffee.count} разів`,
      sub: `${money(w.coffee.total)}${w.coffee.kind === 'coffee' ? ` — в середньому ${money(w.coffee.total / w.coffee.count)} за чашку` : ''}`,
    })
  }
  if (w.comparisons.length > 0) {
    slides.push({
      key: 'compare',
      colors: ['#4776E6', '#2A0845'],
      emoji: '🤯',
      kicker: 'Якщо порівняти',
      big: 'Це як…',
      list: w.comparisons,
    })
  }
  if (w.biggest) {
    slides.push({
      key: 'biggest',
      colors: ['#DA4453', '#3A1C71'],
      emoji: '💎',
      kicker: 'Найбільша покупка',
      big: money(w.biggest.amount),
      sub: `${w.biggest.title} · ${w.biggest.date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}`,
    })
  }
  if (w.busiestMonth) {
    slides.push({
      key: 'month',
      colors: ['#1D976C', '#0F2027'],
      emoji: '🗓️',
      kicker: 'Найщедріший місяць',
      big: MONTHS_NOM[w.busiestMonth.month],
      sub: `${money(w.busiestMonth.total)}${w.weekday ? ` · а найбільше грошей іде в ${WEEKDAYS_ACC[w.weekday.day]}` : ''}`,
    })
  }
  slides.push({
    key: 'outro',
    colors: ['#FF6B00', '#3A0CA3'],
    emoji: '✨',
    kicker: `${w.year} — все`,
    big: 'Дякую, що рахуєш гроші разом з MyWallet',
    sub: 'Натисніть «Поділитися», щоб надіслати підсумок',
  })
  return slides
}

interface Props {
  visible: boolean
  onClose: () => void
}

/** «MyWallet Wrapped»: the year's story — tap right for the next, left for the previous */
export default function WrappedModal({ visible, onClose }: Props) {
  const [year, setYear] = useState(defaultWrappedYear)
  const [data, setData] = useState<{ txs: Transaction[]; cards: Card[]; rates: RatesMap | null; currency: string } | null>(null)
  const [index, setIndex] = useState(0)
  const progress = useRef(new Animated.Value(0)).current
  const excludedCardIds = useExcludedCardIds(data?.cards ?? [])
  const excludedCategories = useExcludedCategories()

  useEffect(() => {
    if (!visible) return
    let alive = true
    setData(null)
    setIndex(0)
    Promise.all([
      listPeriodTransactions(new Date(year, 0, 1), new Date(year + 1, 0, 1)),
      listCards().catch(() => [] as Card[]),
      fetchExchangeRates().catch(() => null),
      getStoredPrimaryCurrency().catch(() => 'UAH'),
    ])
      .then(([txs, cards, rates, currency]) => alive && setData({ txs, cards, rates, currency: currency || 'UAH' }))
      .catch(() => alive && setData({ txs: [], cards: [], rates: null, currency: 'UAH' }))
    return () => {
      alive = false
    }
  }, [visible, year])

  const wrapped = useMemo(() => {
    if (!data) return null
    const counted = countedTransactions(data.txs, {
      cards: data.cards,
      rates: data.rates,
      currency: data.currency,
      excludedCardIds,
      excludedCategories,
    })
    return computeWrapped(counted, year, data.currency, data.rates)
  }, [data, year, excludedCardIds, excludedCategories])
  const slides = useMemo(() => (wrapped && wrapped.expenses > 0 ? buildSlides(wrapped) : []), [wrapped])
  const slide = slides[index]

  // The current story's bar fills up, then the next one opens
  useEffect(() => {
    if (!visible || !slide) return
    progress.setValue(0)
    if (index === slides.length - 1) {
      progress.setValue(1)
      return
    }
    const anim = Animated.timing(progress, { toValue: 1, duration: SLIDE_MS, easing: Easing.linear, useNativeDriver: false })
    anim.start(({ finished }) => finished && setIndex(i => Math.min(i + 1, slides.length - 1)))
    return () => anim.stop()
  }, [visible, index, slides.length])

  const go = (by: number) => {
    triggerLightHaptic()
    setIndex(i => Math.max(0, Math.min(slides.length - 1, i + by)))
  }

  const share = () => wrapped && Share.share({ message: wrappedText(wrapped) }).catch(() => {})

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <LinearGradient colors={slide?.colors ?? ['#1A1A1A', '#0A0A0A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

        {/* Story bars */}
        <View style={styles.bars}>
          {slides.map((s, i) => (
            <View key={s.key} style={styles.barTrack}>
              <Animated.View
                style={[
                  styles.barFill,
                  {
                    width:
                      i < index ? '100%' : i > index ? '0%' : progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  },
                ]}
              />
            </View>
          ))}
        </View>
        <Pressable onPress={onClose} hitSlop={14} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        {!data ? (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.loading}>Рахую твій {year}…</Text>
          </View>
        ) : !slide ? (
          <View style={styles.center}>
            <Text style={styles.emoji}>🫥</Text>
            <Text style={styles.big}>За {year} витрат немає</Text>
            {year > 2000 && (
              <Pressable onPress={() => setYear(y => y - 1)} style={styles.yearBtn}>
                <Text style={styles.yearBtnText}>Подивитись {year - 1}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            {/* Tap left / right halves */}
            <View style={styles.tapZones}>
              <Pressable style={{ flex: 1 }} onPress={() => go(-1)} />
              <Pressable style={{ flex: 2 }} onPress={() => go(1)} />
            </View>
            <View style={styles.content} pointerEvents="none">
              <Text style={styles.emoji}>{slide.emoji}</Text>
              <Text style={styles.kicker}>{slide.kicker}</Text>
              <Text style={styles.big} adjustsFontSizeToFit numberOfLines={3}>{slide.big}</Text>
              {slide.sub ? <Text style={styles.sub}>{slide.sub}</Text> : null}
              {slide.list?.map(item => (
                <View key={item.text} style={styles.listItem}>
                  <Text style={styles.listEmoji}>{item.emoji}</Text>
                  <Text style={styles.listText}>{item.text}</Text>
                </View>
              ))}
            </View>
            {/* Above the tap zones */}
            {slide.key === 'intro' && (
              <View style={styles.bottomActions}>
                {[defaultWrappedYear(), defaultWrappedYear() - 1].map(y => (
                  <Pressable key={y} onPress={() => y !== year && setYear(y)} style={[styles.yearChip, y === year && styles.yearChipOn]}>
                    <Text style={[styles.yearChipText, y === year && styles.yearChipTextOn]}>{y}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {slide.key === 'outro' && (
              <View style={styles.bottomActions}>
                <Pressable onPress={share} style={styles.shareBtn}>
                  <Text style={styles.shareText}>Поділитися</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  bars: { position: 'absolute', top: TOP + 8, left: 12, right: 12, flexDirection: 'row', gap: 4, zIndex: 3 },
  barTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: '#fff' },
  close: { position: 'absolute', top: TOP + 22, right: 16, zIndex: 4, padding: 6 },
  closeText: { fontSize: 22, color: '#fff', fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  loading: { color: 'rgba(255,255,255,0.8)', fontSize: 15 },
  tapZones: { ...StyleSheet.absoluteFill, flexDirection: 'row', zIndex: 2 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: BOTTOM + 90, zIndex: 1 },
  bottomActions: { position: 'absolute', left: 28, right: 28, bottom: BOTTOM + 36, flexDirection: 'row', gap: 10, zIndex: 3 },
  emoji: { fontSize: 64, marginBottom: 18 },
  kicker: { fontSize: 15, fontWeight: '800', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: 1.6 },
  big: { fontSize: 46, fontWeight: '900', color: '#fff', letterSpacing: -1, marginTop: 8, lineHeight: 52 },
  sub: { fontSize: 18, color: 'rgba(255,255,255,0.88)', marginTop: 16, lineHeight: 25 },
  listItem: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 16 },
  listEmoji: { fontSize: 28 },
  listText: { flex: 1, fontSize: 18, fontWeight: '600', color: '#fff', lineHeight: 24 },
  yearChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.15)' },
  yearChipOn: { backgroundColor: '#fff' },
  yearChipText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  yearChipTextOn: { color: '#3A0CA3' },
  shareBtn: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 100, backgroundColor: '#fff' },
  shareText: { fontSize: 16, fontWeight: '800', color: Colors.orange },
  yearBtn: { marginTop: 12, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.15)' },
  yearBtnText: { color: '#fff', fontWeight: '700' },
})
