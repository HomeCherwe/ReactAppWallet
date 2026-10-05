import React, { useEffect, useRef, useState } from 'react'
import { Animated, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { initialWindowMetrics } from 'react-native-safe-area-context'
import PullToRefreshIndicator, { usePullToRefresh } from '../components/PullToRefreshIndicator'
import SubscriptionsCard from '../components/SubscriptionsCard'
import { Colors } from '../constants/theme'
import { Card, listCards } from '../api/cards'
import { fetchExchangeRates, RatesMap } from '../utils/currency'
import { getStoredPrimaryCurrency } from '../utils/settings'
import { checkForAppUpdate } from '../utils/appUpdate'

const SAFE_TOP = initialWindowMetrics?.insets.top ?? 47

/**
 * «Підписки» tab: the subscriptions MyWallet finds in bank charges — for information, nothing is
 * created. Tap one to see every charge; pull down to look for new ones.
 */
export default function SubscriptionsScreen() {
  const [cards, setCards] = useState<Card[]>([])
  const [rates, setRates] = useState<RatesMap | null>(null)
  const [currency, setCurrency] = useState('UAH')
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const pullY = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Promise.all([
      listCards().catch(() => [] as Card[]),
      fetchExchangeRates().catch(() => null),
      getStoredPrimaryCurrency().catch(() => 'UAH'),
    ]).then(([c, r, cur]) => {
      setCards(c)
      setRates(r)
      setCurrency(cur || 'UAH')
    })
  }, [])

  const pull = usePullToRefresh(() => {
    setRefreshing(true)
    setRefreshKey(k => k + 1)
    checkForAppUpdate()
  }, refreshing)

  return (
    <View style={styles.root}>
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: pullY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={pull.controlRefreshing} tintColor="transparent" onRefresh={pull.onRefresh} />}
        onScrollEndDrag={pull.onScrollEndDrag}
      >
        <Text style={styles.screenTitle}>Підписки</Text>
        <Text style={styles.sub}>
          MyWallet сам знаходить регулярні списання у ваших банках — нічого не створює, лише показує. Натисніть на
          підписку, щоб побачити всі її списання.
        </Text>
        <SubscriptionsCard
          cards={cards}
          rates={rates}
          currency={currency}
          title="Активні"
          refreshKey={refreshKey}
          onLoaded={() => setRefreshing(false)}
        />
        <View style={{ height: 130 }} />
      </Animated.ScrollView>
      <PullToRefreshIndicator scrollY={pullY} refreshing={refreshing} top={SAFE_TOP} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingTop: SAFE_TOP + 12, paddingHorizontal: 16 },
  screenTitle: { fontSize: 32, fontWeight: '800', color: Colors.white, letterSpacing: -0.5, paddingHorizontal: 4, marginBottom: 6 },
  sub: { fontSize: 13.5, lineHeight: 19, color: Colors.white60, paddingHorizontal: 4 },
})
