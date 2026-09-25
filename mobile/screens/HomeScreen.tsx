import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Animated,
  Platform,
  RefreshControl,
  Alert,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { GlassView } from 'expo-glass-effect'
import { BlurView } from 'expo-blur'
import { Colors, Gradients, Radius, Typography } from '../constants/theme'
import CardCarousel from '../components/CardCarousel'
import TransactionList from '../components/TransactionList'
import CardSettingsModal from '../components/CardSettingsModal'
import {
  EXCLUDED_CARDS_PATH,
  excludedIdsOf,
  getLegacyExcludedIds,
  migrateLegacyExclusions,
  useExcludedCardIds,
} from '../utils/cardExclusion'
import { setCardExcludedFromStats } from '../api/cards'
import Skeleton from '../components/Skeleton'
import RollingNumber from '../components/RollingNumber'
import { useTransactionFeed } from '../hooks/useTransactionFeed'
import { txBus } from '../utils/txBus'
import GlassCard from '../components/GlassCard'
import GlassButton from '../components/GlassButton'
import SettingsModal from '../components/SettingsModal'
import { useSettingsStore } from '../store/useSettingsStore'
import FloatingActionButton from '../components/FloatingActionButton'
import QuickActionPopup from '../components/QuickActionPopup'
import AddTransactionModal from '../components/AddTransactionModal'
import AddCardModal from '../components/AddCardModal'
import DetailsModal from '../components/DetailsModal'
import EditTxModal from '../components/EditTxModal'
import TransferModal from '../components/TransferModal'
import SplitTxModal from '../components/SplitTxModal'
import ScanReceiptModal from '../components/ScanReceiptModal'

import BalanceHistoryModal from '../components/BalanceHistoryModal'
import { triggerLightHaptic } from '../utils/haptics'
import { supabase } from '../lib/supabase'
import { listCards, Card } from '../api/cards'
import {
  getSumByCard,
  getRecentMonthsStats,
  MonthStat,
  deleteTransaction,
  Transaction,
} from '../api/transactions'
import { fetchTotalsByBucket, TotalsData } from '../api/totals'
import { getPreferences } from '../api/preferences'
import {
  fetchExchangeRates,
  convertCurrency,
  formatMoney,
  getBucket,
  RatesMap,
} from '../utils/currency'
import {
  getStoredPrimaryCurrency,
  setStoredPrimaryCurrency,
  SUPPORTED_CURRENCIES,
} from '../utils/settings'
import { GlassPressable } from '../components/LiquidGlass'

type BucketTab = 'all' | 'cards' | 'savings' | 'cash'

interface HomeScreenProps {
  onNavigateToCards?: () => void
}

export default function HomeScreen({ onNavigateToCards }: HomeScreenProps = {}) {
  const scrollY = useRef(new Animated.Value(0)).current
  const statsScrollX = useRef(new Animated.Value(0)).current
  const STATS_SLIDE_WIDTH = Dimensions.get('window').width - 84
  const STATS_GAP = 40
  const SNAP_INTERVAL = STATS_SLIDE_WIDTH + STATS_GAP

  const [userName, setUserName] = useState('...')
  const [userEmail, setUserEmail] = useState('')
  const [primaryCurrency, setPrimaryCurrency] = useState('UAH')
  const [hideBalances, setHideBalances] = useState(false)
  const [favoriteCardIds, setFavoriteCardIds] = useState<string[]>([])
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  // Modals state
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [addTxVisible, setAddTxVisible] = useState(false)
  const [addCardVisible, setAddCardVisible] = useState(false)
  const [quickActionPopupVisible, setQuickActionPopupVisible] = useState(false)
  const [transferVisible, setTransferVisible] = useState(false)
  const [scanVisible, setScanVisible] = useState(false)
  const [historyVisible, setHistoryVisible] = useState(false)

  // Tx operations modals
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [detailsVisible, setDetailsVisible] = useState(false)
  const [editVisible, setEditVisible] = useState(false)
  const [splitVisible, setSplitVisible] = useState(false)

  // Data state
  const [cards, setCards] = useState<Card[]>([])
  // Cards excluded from statistics: their transactions are hidden from the feed and stats
  const excludedCardIds = useExcludedCardIds(cards)
  const excludedKey = excludedCardIds.join(',')
  const [settingsCard, setSettingsCard] = useState<Card | null>(null)
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [totals, setTotals] = useState<TotalsData>({ cash: {}, cards: {}, savings: {} })
  const [rates, setRates] = useState<RatesMap | null>(null)
  const [recentMonthsStats, setRecentMonthsStats] = useState<MonthStat[]>([])
  const [bucketTab, setBucketTab] = useState<BucketTab>('all')
  const bucketTabAnim = useRef(new Animated.Value(0)).current

  const setBucketTabWithAnim = (tab: BucketTab) => {
    triggerLightHaptic()
    setBucketTab(tab)
    const tabIndex = ['all', 'cards', 'savings', 'cash'].indexOf(tab)
    Animated.spring(bucketTabAnim, {
      toValue: tabIndex,
      tension: 75,
      friction: 9,
      useNativeDriver: false,
    }).start()
  }

  const [loading, setLoading] = useState(true)
  const txFeed = useTransactionFeed({ excludeCardIds: excludedCardIds, enabled: !loading })
  const refreshTxFeed = txFeed.refresh
  const [refreshing, setRefreshing] = useState(false)

  const getGreeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Доброго ранку 🌅'
    if (h < 18) return 'Добрий день ☀️'
    return 'Добрий вечір 🌙'
  }

  const loadData = useCallback(async () => {
    try {
      // Fetch everything in parallel, then apply it in one render — no step-by-step jumping
      const [savedCur, ratesMap, userRes, prefs, cardsData, sumByCard, totalsData] = await Promise.all([
        getStoredPrimaryCurrency(),
        fetchExchangeRates(),
        supabase.auth.getUser(),
        getPreferences(),
        listCards(),
        getSumByCard(),
        fetchTotalsByBucket(),
        useSettingsStore.getState().loaded ? null : useSettingsStore.getState().initialize(),
      ])
      const stats = await getRecentMonthsStats(
        savedCur, cardsData, ratesMap, 6, false, excludedIdsOf(cardsData, getLegacyExcludedIds())
      )

      const user = userRes.data.user
      const balMap: Record<string, number> = {}
      for (const c of cardsData) {
        balMap[c.id] = Number(c.initial_balance || 0) + (sumByCard[c.id] || 0)
      }

      setPrimaryCurrency(savedCur)
      setRates(ratesMap)
      if (user?.email) setUserEmail(user.email)
      if (user?.user_metadata?.full_name) {
        setUserName(user.user_metadata.full_name.split(' ')[0])
      } else if (user?.email) {
        setUserName(user.email.split('@')[0])
      }
      setFavoriteCardIds(prefs.cards?.favoriteCardIds || [])
      setShowFavoritesOnly(prefs.cards?.showFavoritesOnly ?? false)
      setCards(cardsData)
      // One-time move of exclusions saved in preferences into cards.exclude_from_stats
      migrateLegacyExclusions(cardsData).then(ids => {
        if (ids.length) setCards(cs => cs.map(c => (ids.includes(c.id) ? { ...c, exclude_from_stats: true } : c)))
      })
      setBalances(balMap)
      setTotals(totalsData)
      setRecentMonthsStats(stats)
    } catch (err) {
      console.error('HomeScreen load error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const onRefresh = () => {
    setRefreshing(true)
    loadData()
    refreshTxFeed()
  }

  // Background bank sync (e.g. Revolut on app open) added transactions — reload quietly
  useEffect(() => {
    return txBus.subscribe(ev => {
      if (ev?.type === 'SYNCED') {
        loadData()
        refreshTxFeed()
      }
    })
  }, [loadData, refreshTxFeed])

  const handleCurrencyChange = async (newCur: string) => {
    setPrimaryCurrency(newCur)
    await setStoredPrimaryCurrency(newCur)
    if (rates) {
      const stats = await getRecentMonthsStats(newCur, cards, rates, 6, false, excludedCardIds)
      setRecentMonthsStats(stats)
    }
  }

  const displayedBalance = useMemo(() => {
    let totalInPrimary = 0
    
    const sectionsToInclude = []
    if (bucketTab === 'all') {
      sectionsToInclude.push(totals.cash, totals.cards, totals.savings)
    } else if (bucketTab === 'cash') {
      sectionsToInclude.push(totals.cash)
    } else if (bucketTab === 'cards') {
      sectionsToInclude.push(totals.cards)
    } else if (bucketTab === 'savings') {
      sectionsToInclude.push(totals.savings)
    }

    const allBalances: Record<string, number> = {}

    sectionsToInclude.forEach(section => {
      Object.entries(section || {}).forEach(([currency, amount]) => {
        if (amount && Math.abs(amount) > 0.01) {
          const normalizedCurrency = currency === 'USDT' ? 'USD' : currency
          if (!allBalances[normalizedCurrency]) {
            allBalances[normalizedCurrency] = 0
          }
          allBalances[normalizedCurrency] += amount
        }
      })
    })

    Object.entries(allBalances).forEach(([currency, amount]) => {
      const inPrimary = convertCurrency(amount, currency, primaryCurrency, rates)
      totalInPrimary += inPrimary
    })

    return totalInPrimary
  }, [totals, bucketTab, primaryCurrency, rates])

  const allEquivalents = useMemo(() => {
    if (bucketTab !== 'all' || displayedBalance === 0) return null

    if (primaryCurrency === 'UAH') {
      const eur = convertCurrency(displayedBalance, 'UAH', 'EUR', rates)
      const usd = convertCurrency(displayedBalance, 'UAH', 'USD', rates)
      return `≈ ${formatMoney(eur, 'EUR', { hideCents: true })} • ${formatMoney(usd, 'USD', { hideCents: true })}`
    } else if (primaryCurrency === 'EUR') {
      const uah = convertCurrency(displayedBalance, 'EUR', 'UAH', rates)
      const usd = convertCurrency(displayedBalance, 'EUR', 'USD', rates)
      return `≈ ${formatMoney(uah, 'UAH', { hideCents: true })} • ${formatMoney(usd, 'USD', { hideCents: true })}`
    } else if (primaryCurrency === 'USD') {
      const uah = convertCurrency(displayedBalance, 'USD', 'UAH', rates)
      const eur = convertCurrency(displayedBalance, 'USD', 'EUR', rates)
      return `≈ ${formatMoney(uah, 'UAH', { hideCents: true })} • ${formatMoney(eur, 'EUR', { hideCents: true })}`
    } else {
      const uah = convertCurrency(displayedBalance, primaryCurrency, 'UAH', rates)
      const eur = convertCurrency(displayedBalance, primaryCurrency, 'EUR', rates)
      return `≈ ${formatMoney(uah, 'UAH', { hideCents: true })} • ${formatMoney(eur, 'EUR', { hideCents: true })}`
    }
  }, [displayedBalance, bucketTab, primaryCurrency, rates])

  // Stable props so the memoized carousel/list skip re-rendering when a modal opens
  const carouselCards = useMemo(
    () =>
      showFavoritesOnly && favoriteCardIds.length > 0
        ? cards
            .filter(c => favoriteCardIds.includes(c.id))
            .sort((a, b) => favoriteCardIds.indexOf(a.id) - favoriteCardIds.indexOf(b.id))
        : cards,
    [cards, showFavoritesOnly, favoriteCardIds]
  )

  const handlePressCard = useCallback((card: Card) => {
    triggerLightHaptic()
    setSettingsCard(card)
  }, [])

  // Card settings switch: update the UI immediately, save to cards.exclude_from_stats,
  // and roll back if saving fails
  const handleToggleExcluded = useCallback(async (card: Card, excluded: boolean) => {
    const apply = (value: boolean) =>
      setCards(cs => cs.map(c => (c.id === card.id ? { ...c, exclude_from_stats: value } : c)))
    apply(excluded)
    const legacy = getLegacyExcludedIds()
    if (!excluded && legacy.includes(card.id)) {
      useSettingsStore.getState().updateNestedSetting(EXCLUDED_CARDS_PATH, legacy.filter(id => id !== card.id))
    }
    try {
      await setCardExcludedFromStats(card.id, excluded)
    } catch (e: any) {
      apply(!excluded)
      Alert.alert('Не вдалося зберегти', e?.message || 'Спробуйте ще раз')
    }
  }, [])

  const handlePressTx = useCallback((tx: Transaction) => {
    setSelectedTx(tx)
    setDetailsVisible(true)
  }, [])

  const usedCurrencies = useMemo(() => {
    const set = new Set<string>()
    cards.forEach(c => set.add(c.currency))
    set.add(primaryCurrency)
    return Array.from(set)
  }, [cards, primaryCurrency])

  // Infinite scroll: fetch the next page when within ~600px of the bottom
  const loadMoreTx = txFeed.loadMore
  const handleScrollForMore = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 600) {
      loadMoreTx()
    }
  }, [loadMoreTx])

  // Toggling a card's exclusion re-computes the monthly stats (the feed refetches on its own)
  const statsExclusionKey = useRef(excludedKey)
  useEffect(() => {
    if (loading || statsExclusionKey.current === excludedKey) return
    statsExclusionKey.current = excludedKey
    getRecentMonthsStats(primaryCurrency, cards, rates, 6, false, excludedCardIds).then(setRecentMonthsStats)
  }, [excludedKey, loading])

  // Fade content in once the first load completes (replaces skeletons without a hard pop)
  const contentOpacity = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!loading) {
      Animated.timing(contentOpacity, { toValue: 1, duration: 350, useNativeDriver: true }).start()
    }
  }, [loading])

  const formatBalance = useCallback(
    (v: number) => (v < 0 ? '-' : '') + formatMoney(v, primaryCurrency),
    [primaryCurrency]
  )

  const headerBgOpacity = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })

  const getBucketLabel = () => {
    switch (bucketTab) {
      case 'all': return 'Загальний баланс'
      case 'cards': return 'Баланс карток'
      case 'savings': return 'Баланс заощаджень'
      case 'cash': return 'Баланс готівки'
    }
  }

  const handleDeleteTx = (tx: Transaction) => {
    Alert.alert(
      'Видалити транзакцію?',
      'Цю дію неможливо скасувати',
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Видалити',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTransaction(tx.id)
              loadData()
              refreshTxFeed()
            } catch (e: any) {
              Alert.alert('Помилка', e.message || 'Не вдалося видалити')
            }
          },
        },
      ]
    )
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Ambient background */}
      <LinearGradient
        colors={['#180A02', '#0A0A0E', '#060608']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <View style={styles.glowTopLeft} pointerEvents="none" />
      <View style={styles.glowTopRight} pointerEvents="none" />
      <View style={styles.glowMidLeft} pointerEvents="none" />
      <View style={styles.glowBottomDock} pointerEvents="none" />

      {/* Floating header blur */}
      <Animated.View style={[styles.floatingHeader, { opacity: headerBgOpacity }]} pointerEvents="none">
        <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} />
        <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="regular" colorScheme="dark" />
        <View style={styles.floatingHeaderBorder} />
      </Animated.View>

      {/* Scroll */}
      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.orange}
          />
        }
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true, listener: handleScrollForMore }
        )}
        scrollEventThrottle={16}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.userName}>{userName}</Text>
          </View>

          <View style={styles.headerActions}>
            <GlassPressable
              style={styles.eyeBtn}
              onPress={() => setHideBalances(!hideBalances)}
            >
              <Text style={styles.eyeIcon}>{hideBalances ? '🙈' : '👁️'}</Text>
            </GlassPressable>

            <GlassPressable
              style={styles.avatarBtn}
              onPress={() => setSettingsVisible(true)}
            >
              <LinearGradient
                colors={['#FF6B00', '#FF3D00']}
                style={styles.avatar}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.avatarText}>
                  {userName.slice(0, 2).toUpperCase()}
                </Text>
              </LinearGradient>
              <View style={styles.avatarBadge} />
            </GlassPressable>
          </View>
        </View>


        {/* Balance Card */}
        <View style={styles.balanceCardWrapper}>
          <GlassCard style={styles.balanceCard} padding={22}>
            <TouchableOpacity activeOpacity={0.8} onPress={() => { triggerLightHaptic(); setHistoryVisible(true); }}>
              <View style={styles.balanceHeaderRow}>
                <Text style={styles.balanceLabel}>{getBucketLabel()}</Text>
                <View style={styles.balanceHeaderActions}>
                  <GlassPressable
                    style={styles.currencyPillBtn}
                    onPress={() => setSettingsVisible(true)}
                  >
                    <LinearGradient
                      colors={['#FF6B00', '#FF3D00']}
                      style={StyleSheet.absoluteFill}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    />
                    <Text style={styles.currencyPillText}>{primaryCurrency}</Text>
                  </GlassPressable>
                </View>
              </View>

              {/* Skeleton and real content share the exact same line heights → no jump on load */}
              {loading ? (
                <View>
                  <View style={styles.balanceLine}>
                    <Skeleton width="62%" height={32} radius={10} />
                  </View>
                  <View style={styles.equivalentsLine}>
                    <Skeleton width="45%" height={12} />
                  </View>
                </View>
              ) : (
                <Animated.View style={{ opacity: contentOpacity }}>
                  <View style={styles.balanceLine}>
                    {hideBalances ? (
                      <Text style={styles.balanceValue}>••••••••</Text>
                    ) : (
                      <RollingNumber
                        value={displayedBalance}
                        format={formatBalance}
                        style={styles.balanceValue}
                      />
                    )}
                  </View>
                  <View style={styles.equivalentsLine}>
                    <Text style={styles.balanceEquivalents} numberOfLines={1}>
                      {allEquivalents && !hideBalances ? allEquivalents : ''}
                    </Text>
                  </View>
                </Animated.View>
              )}
            </TouchableOpacity>

            {loading ? (
              <View>
                {/* Mirrors one stats slide: month label + 3 stat cells + dots */}
                <View style={{ marginTop: 12 }}>
                  <View style={styles.monthLabelLine}>
                    <Skeleton width={90} height={11} />
                  </View>
                  <View style={styles.balanceStats}>
                    {[0, 1, 2].map(i => (
                      <React.Fragment key={i}>
                        {i > 0 && <View style={styles.statDivider} />}
                        <View style={styles.balanceStat}>
                          <View style={styles.statLabelLine}>
                            <Skeleton width={48} height={9} />
                          </View>
                          <View style={styles.statValueLine}>
                            <Skeleton width="80%" height={14} />
                          </View>
                        </View>
                      </React.Fragment>
                    ))}
                  </View>
                </View>
                <View style={styles.statsDots}>
                  <Skeleton width={12} height={4} radius={2} />
                  <Skeleton width={5} height={4} radius={2} />
                  <Skeleton width={5} height={4} radius={2} />
                </View>
              </View>
            ) : recentMonthsStats.length > 0 ? (
              <Animated.View style={{ opacity: contentOpacity }}>
                <Animated.ScrollView 
                  horizontal 
                  pagingEnabled={false}
                  snapToInterval={SNAP_INTERVAL}
                  decelerationRate="fast"
                  showsHorizontalScrollIndicator={false}
                  style={{ marginHorizontal: -22 }}
                  contentContainerStyle={{ marginTop: 12, paddingHorizontal: 22 }}
                  onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: statsScrollX } } }],
                    { useNativeDriver: false }
                  )}
                  scrollEventThrottle={16}
                >
                  {recentMonthsStats.map((stat, i) => {
                    const saved = stat.income - stat.expense;
                    const savedColor = saved > 0 ? Colors.green : (saved < 0 ? '#FF6B6B' : Colors.orange);
                    const savedPrefix = saved > 0 ? '+' : (saved < 0 ? '-' : '');
                    return (
                    <View key={stat.id} style={{ width: STATS_SLIDE_WIDTH, marginRight: i === recentMonthsStats.length - 1 ? 0 : STATS_GAP }}>
                      <Text style={styles.monthLabel}>{i === 0 ? 'Цей місяць' : stat.label}</Text>
                      <View style={styles.balanceStats}>
                        <View style={styles.balanceStat}>
                          <View style={styles.statLabelRow}>
                            <View style={[styles.statDot, { backgroundColor: Colors.green }]} />
                            <Text style={styles.statLabel}>Доходи</Text>
                            {!hideBalances && stat.incomeDiffPercent !== 0 && (
                               <Text style={stat.incomeDiffPercent > 0 ? styles.monthDiffPos : styles.monthDiffNeg}>
                                 {stat.incomeDiffPercent > 0 ? '↑' : '↓'}{Math.abs(stat.incomeDiffPercent).toFixed(0)}%
                               </Text>
                            )}
                          </View>
                          <Text 
                            style={[styles.statValue, { color: Colors.green }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            {hideBalances ? '••••' : `+${formatMoney(stat.income, primaryCurrency, { hideCents: true })}`}
                          </Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.balanceStat}>
                          <View style={styles.statLabelRow}>
                            <View style={[styles.statDot, { backgroundColor: '#FF6B6B' }]} />
                            <Text style={styles.statLabel}>Витрати</Text>
                            {!hideBalances && stat.expenseDiffPercent !== 0 && (
                               <Text style={stat.expenseDiffPercent > 0 ? styles.monthDiffPos : styles.monthDiffNeg}>
                                 {stat.expenseDiffPercent > 0 ? '↑' : '↓'}{Math.abs(stat.expenseDiffPercent).toFixed(0)}%
                               </Text>
                            )}
                          </View>
                          <Text 
                            style={[styles.statValue, { color: '#FF6B6B' }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            {hideBalances ? '••••' : `-${formatMoney(stat.expense, primaryCurrency, { hideCents: true })}`}
                          </Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.balanceStat}>
                          <View style={styles.statLabelRow}>
                            <View style={[styles.statDot, { backgroundColor: savedColor }]} />
                            <Text style={styles.statLabel}>Залишок</Text>
                          </View>
                          <Text 
                            style={[styles.statValue, { color: savedColor }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            {hideBalances ? '••••' : `${savedPrefix}${formatMoney(Math.abs(saved), primaryCurrency, { hideCents: true })}`}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )})}
                </Animated.ScrollView>
                <View style={styles.statsDots}>
                  {recentMonthsStats.map((_, i) => {
                    const width_ = statsScrollX.interpolate({
                      inputRange: [
                        (i - 1) * SNAP_INTERVAL,
                        i * SNAP_INTERVAL,
                        (i + 1) * SNAP_INTERVAL,
                      ],
                      outputRange: [5, 12, 5],
                      extrapolate: 'clamp',
                    })
                    const opacity = statsScrollX.interpolate({
                      inputRange: [
                        (i - 1) * SNAP_INTERVAL,
                        i * SNAP_INTERVAL,
                        (i + 1) * SNAP_INTERVAL,
                      ],
                      outputRange: [0.35, 1, 0.35],
                      extrapolate: 'clamp',
                    })
                    return (
                      <Animated.View
                        key={i}
                        style={[
                          styles.statsDot,
                          { width: width_, opacity, backgroundColor: 'rgba(255,255,255,0.7)' },
                        ]}
                      />
                    )
                  })}
                </View>
              </Animated.View>
            ) : (
              <View style={[styles.balanceStats, { marginTop: 12 }]} />
            )}
          </GlassCard>
        </View>


        {/* Cards Carousel */}
        <View style={styles.section}>
          <CardCarousel
            cards={carouselCards}
            balances={balances}
            loading={loading}
            rates={rates}
            primaryCurrency={primaryCurrency}
            excludedCardIds={excludedCardIds}
            onPressCard={handlePressCard}
          />
        </View>



        {/* Transactions List */}
        <View style={styles.section}>
          <TransactionList
            transactions={txFeed.items}
            cards={cards}
            loading={txFeed.loading}
            loadingMore={txFeed.loadingMore}
            hasMore={txFeed.hasMore}
            error={txFeed.error}
            hidden={hideBalances}
            filter={txFeed.filter}
            onFilterChange={txFeed.changeFilter}
            onRetry={txFeed.retry}
            onPressTx={handlePressTx}
          />
        </View>

        <View style={{ height: 110 }} />
      </Animated.ScrollView>

      {/* Floating Plus button */}
      <FloatingActionButton
        onPress={() => setAddTxVisible(true)}
        onAddCard={() => setAddCardVisible(true)}
        onTransfer={() => setTransferVisible(true)}
        onAddGoal={() => setAddCardVisible(true)}
        onLongPress={() => setQuickActionPopupVisible(true)}
        onLongPressFallback={() => setQuickActionPopupVisible(true)}
      />

      {/* Modals */}
      <QuickActionPopup
        visible={quickActionPopupVisible}
        onClose={() => setQuickActionPopupVisible(false)}
        onAddTransaction={() => setAddTxVisible(true)}
        onAddCard={() => setAddCardVisible(true)}
        onTransfer={() => setTransferVisible(true)}
        onAddGoal={() => setAddCardVisible(true)}
      />

      <CardSettingsModal
        card={settingsCard}
        balance={settingsCard ? balances[settingsCard.id] : undefined}
        excluded={!!settingsCard && excludedCardIds.includes(settingsCard.id)}
        onToggleExcluded={handleToggleExcluded}
        onClose={() => setSettingsCard(null)}
      />

      <AddTransactionModal
        visible={addTxVisible}
        onClose={() => setAddTxVisible(false)}
        cards={cards}
        excludedCardIds={excludedCardIds}
        primaryCurrency={primaryCurrency}
        onSuccess={onRefresh}
      />

      <AddCardModal
        visible={addCardVisible}
        onClose={() => setAddCardVisible(false)}
        defaultCurrency={primaryCurrency}
        onSuccess={onRefresh}
      />

      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        primaryCurrency={primaryCurrency}
        onCurrencyChange={handleCurrencyChange}
        userName={userName}
        userEmail={userEmail}
        usedCurrencies={usedCurrencies}
      />

      {/* Tx Details */}
      <DetailsModal
        visible={detailsVisible}
        tx={selectedTx}
        currency={primaryCurrency}
        onClose={() => {
          setDetailsVisible(false)
          setSelectedTx(null)
        }}
        onEdit={tx => {
          setSelectedTx(tx)
          setEditVisible(true)
        }}
        onSplit={tx => {
          setSelectedTx(tx)
          setSplitVisible(true)
        }}
        onDelete={handleDeleteTx}
      />

      {/* Tx Edit */}
      <EditTxModal
        visible={editVisible}
        tx={selectedTx}
        cards={cards}
        onClose={() => {
          setEditVisible(false)
          setSelectedTx(null)
        }}
        onSaved={onRefresh}
      />

      {/* Tx Split */}
      <SplitTxModal
        visible={splitVisible}
        tx={selectedTx}
        cards={cards}
        onClose={() => {
          setSplitVisible(false)
          setSelectedTx(null)
        }}
        onDone={onRefresh}
      />

      {/* Transfers */}
      <TransferModal
        visible={transferVisible}
        cards={cards}
        onClose={() => setTransferVisible(false)}
        onDone={onRefresh}
      />

      {/* Receipt scanning */}
      <ScanReceiptModal
        visible={scanVisible}
        cards={cards}
        onClose={() => setScanVisible(false)}
        onSaved={onRefresh}
      />

      <BalanceHistoryModal
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        bucket={bucketTab}
        initialCurrency={primaryCurrency}
        totals={totals}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  glowTopLeft: {
    position: 'absolute', width: 320, height: 320, borderRadius: 160,
    backgroundColor: 'rgba(255, 107, 0, 0.22)', top: -90, left: -80,
  },
  glowTopRight: {
    position: 'absolute', width: 250, height: 250, borderRadius: 125,
    backgroundColor: 'rgba(255, 140, 58, 0.16)', top: 40, right: -70,
  },
  glowMidLeft: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(255, 60, 0, 0.12)', top: '40%', left: -90,
  },
  glowBottomDock: {
    position: 'absolute', width: 360, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255, 107, 0, 0.26)', bottom: -10, alignSelf: 'center',
  },
  floatingHeader: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: Platform.OS === 'ios' ? 90 : 70, zIndex: 100, overflow: 'hidden',
  },
  floatingHeaderBorder: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
    backgroundColor: Colors.glassBorder,
  },
  scroll: {
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 18,
  },
  greeting: { ...Typography.caption, color: Colors.textSub },
  userName: { ...Typography.h2, color: Colors.white, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eyeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  eyeIcon: { fontSize: 18 },
  avatarBtn: { position: 'relative' },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { ...Typography.body, fontWeight: '700', color: Colors.white },
  avatarBadge: {
    position: 'absolute', width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.green, bottom: 1, right: 1,
    borderWidth: 2, borderColor: Colors.bg,
  },
  bucketTabsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14, padding: 4, marginBottom: 14, gap: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden',
  },
  bucketTabPill: {
    position: 'absolute', top: 4, bottom: 4, borderRadius: 10,
    overflow: 'hidden', zIndex: 1,
  },
  bucketTab: {
    flex: 1, paddingVertical: 7, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, zIndex: 2,
  },
  bucketTabText: { fontSize: 12, fontWeight: '600', color: Colors.textSub },
  bucketTabTextActive: { color: Colors.white, fontWeight: '700' },
  balanceCardWrapper: { marginBottom: 18 },
  balanceCard: { },
  balanceHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 6,
  },
  balanceHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balanceLabel: {
    ...Typography.label, color: 'rgba(255,107,0,0.85)',
    textTransform: 'uppercase', letterSpacing: 1.2,
  },
  currencyPillBtn: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.pill,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  currencyPillText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  balanceValue: { fontSize: 36, lineHeight: 43, fontWeight: '800', color: Colors.white, letterSpacing: -1 },
  balanceLine: { height: 43, justifyContent: 'center' },
  balanceEquivalents: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: Colors.white60 },
  equivalentsLine: { height: 16, marginTop: 4, marginBottom: 16, justifyContent: 'center' },
  balanceStats: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.30)', borderRadius: Radius.md,
    padding: 10, gap: 6, marginTop: 12,
  },
  balanceStat: { flex: 1, flexDirection: 'column', alignItems: 'flex-start', gap: 2 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 14 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statLabel: { ...Typography.caption, color: Colors.textMuted, fontSize: 11, lineHeight: 14 },
  statLabelLine: { height: 14, justifyContent: 'center' },
  statValue: { ...Typography.caption, fontWeight: '800', fontSize: 15, lineHeight: 19, height: 19 },
  statValueLine: { height: 19, width: '100%', justifyContent: 'center' },
  statDivider: { width: 1, height: 36, backgroundColor: Colors.white10 },
  statsDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    gap: 4,
  },
  statsDot: {
    height: 4,
    borderRadius: 2,
  },
  actionRow: {
    flexDirection: 'row', gap: 8, marginBottom: 20,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: Radius.lg,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  quickBtnAccent: {
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderColor: 'rgba(255, 107, 0, 0.30)',
  },
  quickBtnIcon: { fontSize: 18, marginBottom: 2 },
  quickBtnText: { fontSize: 11, fontWeight: '700', color: Colors.white80 },
  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { ...Typography.h3, color: Colors.white },
  cardsCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10,
  },
  monthLabel: { ...Typography.caption, fontWeight: '700', color: Colors.orange, textTransform: 'uppercase', lineHeight: 16, height: 16, marginBottom: 6 },
  monthLabelLine: { height: 16, marginBottom: 6, justifyContent: 'center' },
  monthDiffPos: { color: Colors.green, fontSize: 10, fontWeight: '800' },
  monthDiffNeg: { color: '#FF6B6B', fontSize: 10, fontWeight: '800' },
})