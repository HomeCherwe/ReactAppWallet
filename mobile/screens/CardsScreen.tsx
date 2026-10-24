import React, { useCallback, useEffect, useState, useMemo , useRef} from 'react'
import { Animated,
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, Platform, RefreshControl
} from 'react-native'
import PullToRefreshIndicator, { usePullToRefresh } from '../components/PullToRefreshIndicator'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import GlassContextMenu from '../components/GlassContextMenu'
import { GlassSurface } from '../components/LiquidGlass'
import { Colors, Typography, Radius } from '../constants/theme'
import { listCards, deleteCard, setCardExcludedFromStats, updateCard, Card } from '../api/cards'
import { getSumByCard } from '../api/transactions'
import { fmtAmount } from '../utils/format'
import AddAccountFlow from '../components/AddAccountFlow'
import CardTransactionsSheet from '../components/CardTransactionsSheet'
import CardSettingsModal from '../components/CardSettingsModal'
import ConnectedBanks from '../components/ConnectedBanks'
import { BankProvider } from '../api/bankConnections'
import { txBus } from '../utils/txBus'
import { useMenuOverlay } from '../store/useMenuOverlay'
import { syncBanks } from '../store/useBankSyncStore'
import { checkForAppUpdate } from '../utils/appUpdate'
import GlassButton from '../components/GlassButton'
import { cardLabel } from '../utils/cardLabel'
import { ACCOUNT_KINDS, AccountKind, accountKind, goalProgress, isEmptyBalance, KIND_META } from '../utils/accountKind'
import { GlassPressable } from '../components/LiquidGlass'

function emptyAccountsText(n: number) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} порожній рахунок`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} порожні рахунки`
  return `${n} порожніх рахунків`
}

export default function CardsScreen() {
  const [cards, setCards] = useState<Card[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // "+ Додати": connect a bank (sync) or add your own account
  const [addAccountVisible, setAddAccountVisible] = useState(false)
  const [banksReloadKey, setBanksReloadKey] = useState(0)
  const pullY = useRef(new Animated.Value(0)).current
  // Where the list starts (under the header): the pull indicator comes out from there
  const [listTop, setListTop] = useState(0)
  // No scrolling while a long-press menu is open (the finger slides over the menu instead)
  const menuOpen = useMenuOverlay(s => !!s.menu)
  const [cardTxCard, setCardTxCard] = useState<Card | null>(null)
  const [settingsCard, setSettingsCard] = useState<Card | null>(null)
  // Reconnecting a token bank (Monobank): the add sheet opens straight on its token form
  const [tokenReconnect, setTokenReconnect] = useState<BankProvider | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [cardsData, sumByCardRaw] = await Promise.all([
        listCards(),
        getSumByCard().catch(() => ({})),
      ])
      setCards(cardsData)

      const balMap: Record<string, number> = {}
      const sumByCard = (sumByCardRaw || {}) as Record<string, number>;
      for (const c of cardsData) {
        balMap[c.id] = Number(c.initial_balance || 0) + (sumByCard[c.id] || 0)
      }
      setBalances(balMap)
    } catch {
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Bank sync added cards/transactions (auto-sync on app open, "sync now") — reload quietly
  useEffect(() => {
    return txBus.subscribe(ev => {
      if (ev?.type === 'SYNCED') {
        loadData()
        setBanksReloadKey(k => k + 1)
      }
    })
  }, [loadData])

  // Card settings (from a card's transactions sheet): update right away, roll back on failure
  const handleToggleExcluded = useCallback(async (card: Card, excluded: boolean) => {
    const apply = (value: boolean) => {
      setCards(cs => cs.map(c => (c.id === card.id ? { ...c, exclude_from_stats: value } : c)))
      setSettingsCard(c => (c?.id === card.id ? { ...c, exclude_from_stats: value } : c))
    }
    apply(excluded)
    try {
      await setCardExcludedFromStats(card.id, excluded)
      txBus.emit({ type: 'SYNCED', source: 'card-settings', count: 0 })
    } catch (e: any) {
      apply(!excluded)
      Alert.alert('Помилка', e?.message || 'Не вдалося зберегти')
    }
  }, [])

  // Name, kind, goal or archive changed in the account's settings
  const handleCardUpdated = useCallback((card: Card) => {
    setCards(cs => cs.map(c => (c.id === card.id ? { ...c, ...card } : c)))
    setSettingsCard(c => (c?.id === card.id ? { ...c, ...card } : c))
    txBus.emit({ type: 'SYNCED', source: 'card-settings', count: 0 })
  }, [])

  // Hide (or bring back) accounts in one go; only empty ones are offered for the archive
  const setArchived = async (list: Card[], value: boolean) => {
    const ids = new Set(list.map(c => c.id))
    setCards(cs => cs.map(c => (ids.has(c.id) ? { ...c, archived: value } : c)))
    try {
      await Promise.all(list.map(c => updateCard(c.id, { archived: value })))
      txBus.emit({ type: 'SYNCED', source: 'card-settings', count: 0 })
    } catch (e: any) {
      Alert.alert('Не вдалося змінити архів', e?.message || 'Спробуйте ще раз')
      loadData()
    }
  }

  const openAddAccount = () => {
    setTokenReconnect(null)
    setAddAccountVisible(true)
  }

  const handleDelete = (card: Card) => {
    Alert.alert(
      'Видалити картку?',
      `Ви впевнені, що хочете видалити "${card.name}"?`,
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Видалити',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCard(card.id)
              loadData()
            } catch (err: any) {
              Alert.alert('Помилка', err.message || 'Не вдалося видалити')
            }
          },
        },
      ]
    )
  }

  // One group per account kind (the web's cards page has the same); archived ones on their own
  const activeCards = useMemo(() => cards.filter(c => !c.archived), [cards])
  const archivedCards = useMemo(() => cards.filter(c => c.archived), [cards])
  const groupedCards = useMemo(() => {
    const groups = Object.fromEntries(ACCOUNT_KINDS.map(k => [k, [] as Card[]])) as Record<AccountKind, Card[]>
    activeCards.forEach(c => groups[accountKind(c)].push(c))
    return groups
  }, [activeCards])
  const balanceOf = (card: Card) => balances[card.id] ?? Number(card.initial_balance || 0)
  const emptyCards = useMemo(() => activeCards.filter(c => isEmptyBalance(balanceOf(c))), [activeCards, balances])

  const ARCHIVE_ACCENT: [string, string] = ['#6B7280', '#4B5563']

  const renderCardItem = (card: Card) => {
    const bal = balanceOf(card)
    const kind = accountKind(card)
    const accent = card.archived ? ARCHIVE_ACCENT : KIND_META[kind].accent
    const excluded = !!(card.exclude_from_stats || card.bank_exclude_from_stats)
    const progress = kind === 'savings' ? goalProgress(card, bal) : null
    return (
      <GlassContextMenu
        key={card.id}
        style={styles.cardItem}
        title={card.name}
        subtitle={`${card.bank || 'Рахунок'} · ${fmtAmount(bal, card.currency)}`}
        onPress={() => setCardTxCard(card)}
        actions={[
          { label: 'Транзакції та статистика', icon: 'list', onPress: () => setCardTxCard(card) },
          { label: 'Налаштування рахунку', icon: 'tag', onPress: () => setSettingsCard(card) },
          ...(card.archived
            ? [{ label: 'Повернути з архіву', icon: 'archive' as const, onPress: () => setArchived([card], false) }]
            : isEmptyBalance(bal)
            ? [{ label: 'Сховати в архів', icon: 'archive' as const, onPress: () => setArchived([card], true) }]
            : []),
          { label: 'Видалити', icon: 'trash', destructive: true, onPress: () => handleDelete(card) },
        ]}
      >
        <GlassSurface borderRadius={22} />
        {/* Colored edge on the left */}
        <LinearGradient colors={accent} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.cardAccent} />
        <View style={styles.cardItemLeft}>
          <LinearGradient colors={accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardIconWrap}>
            <Text style={styles.cardIcon}>{KIND_META[kind].icon}</Text>
          </LinearGradient>
          <View style={styles.cardTexts}>
            <Text style={styles.cardName} numberOfLines={1}>{card.name}</Text>
            <Text style={styles.cardBank} numberOfLines={1}>
              {card.bank || 'Рахунок'}
              {card.card_number ? ` · •• ${String(card.card_number).slice(-4)}` : ''}
              {progress != null ? ` · ціль ${fmtAmount(Number(card.goal_amount), card.currency)}` : ''}
              {excluded ? ' · поза статистикою' : ''}
            </Text>
            {progress != null && (
              <View style={styles.goalRow}>
                <View style={styles.goalTrack}>
                  <LinearGradient
                    colors={accent}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.goalFill, { width: `${progress * 100}%` }]}
                  />
                </View>
                <Text style={styles.goalPct}>{progress >= 1 ? '✓' : `${Math.floor(progress * 100)}%`}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.cardItemRight}>
          <Text style={[styles.cardBal, bal < 0 && styles.textRed]} numberOfLines={1}>
            {fmtAmount(bal, card.currency)}
          </Text>
          <Text style={styles.cardCur}>{card.currency}</Text>
        </View>
      </GlassContextMenu>
    )
  }

  const pull = usePullToRefresh(() => {
    setRefreshing(true)
    loadData()
    setBanksReloadKey(k => k + 1)
    syncBanks().catch(() => {})
    checkForAppUpdate()
  }, refreshing)

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A0B03', '#0B0A0E', '#060608']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.4, y: 1 }}
      />
      <View style={styles.glowTop} pointerEvents="none" />
      <View style={styles.glowRight} pointerEvents="none" />
      <View style={styles.glowBottom} pointerEvents="none" />
      <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Рахунки та картки</Text>
          <Text style={styles.headerSub}>
            {activeCards.length} активних рахунків{archivedCards.length > 0 ? ` · ${archivedCards.length} в архіві` : ''}
          </Text>
        </View>
        <GlassPressable style={styles.addBtn} onPress={openAddAccount}>
          <Text style={styles.addBtnText}>+ Додати</Text>
        </GlassPressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.orange} size="large" />
        </View>
      ) : (
        <Animated.FlatList
          onLayout={e => setListTop(e.nativeEvent.layout.y)}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: pullY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
          scrollEnabled={!menuOpen}
          data={[]} // using FlatList just for the refresh control and scroll
          keyExtractor={() => 'dummy'}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={pull.controlRefreshing}
              onRefresh={pull.onRefresh}
              tintColor="transparent"
            />
          }
          onScrollEndDrag={pull.onScrollEndDrag}
          ListHeaderComponent={
            <ConnectedBanks
              reloadKey={banksReloadKey}
              onChanged={loadData}
              cards={cards}
              balances={balances}
              onOpenCard={setCardTxCard}
              onReconnectToken={c => {
                setTokenReconnect({ provider_id: c.provider_id, name: c.provider_name, logo: c.provider_logo, country: c.country ?? 'ua', auth: 'token' })
                setAddAccountVisible(true)
              }}
            />
          }
          ListEmptyComponent={
            cards.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyIcon}>💳</Text>
                <Text style={styles.emptyTitle}>Карток не додано</Text>
                <Text style={styles.emptySub}>Натисніть «+ Додати», щоб підключити банк або додати рахунок вручну</Text>
              </View>
            ) : (
              <View>
                {ACCOUNT_KINDS.map(kind =>
                  groupedCards[kind].length > 0 ? (
                    <View key={kind} style={styles.groupSection}>
                      <Text style={styles.groupTitle}>
                        {KIND_META[kind].icon} {KIND_META[kind].many}
                      </Text>
                      {groupedCards[kind].map(renderCardItem)}
                    </View>
                  ) : null
                )}

                {/* Accounts with nothing on them: one tap hides them all */}
                {emptyCards.length >= 2 && (
                  <View style={styles.emptyHint}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.emptyHintTitle}>🗄 {emptyAccountsText(emptyCards.length)}</Text>
                      <Text style={styles.emptyHintSub} numberOfLines={2}>
                        {emptyCards.map(c => cardLabel(c)).join(', ')}
                      </Text>
                    </View>
                    <GlassPressable style={styles.emptyHintBtn} onPress={() => setArchived(emptyCards, true)}>
                      <Text style={styles.emptyHintBtnText}>Сховати</Text>
                    </GlassPressable>
                  </View>
                )}

                {archivedCards.length > 0 && (
                  <View style={styles.groupSection}>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => setArchiveOpen(o => !o)}>
                      <Text style={[styles.groupTitle, styles.archiveTitle]}>
                        🗄 Архів · {archivedCards.length} {archiveOpen ? '▴' : '▾'}
                      </Text>
                    </TouchableOpacity>
                    {archiveOpen && <View style={styles.archiveList}>{archivedCards.map(renderCardItem)}</View>}
                  </View>
                )}
              </View>
            )
          }
          renderItem={() => null}
        />
      )}

      <CardTransactionsSheet
        card={cardTxCard}
        balance={cardTxCard ? balances[cardTxCard.id] : undefined}
        cards={cards}
        onChanged={loadData}
        onClose={() => setCardTxCard(null)}
        onOpenSettings={card => {
          setCardTxCard(null)
          setTimeout(() => setSettingsCard(card), 380)
        }}
      />

      <CardSettingsModal
        card={settingsCard}
        balance={settingsCard ? balances[settingsCard.id] : undefined}
        excluded={!!settingsCard?.exclude_from_stats}
        onToggleExcluded={handleToggleExcluded}
        onUpdated={handleCardUpdated}
        onClose={() => setSettingsCard(null)}
      />

      <AddAccountFlow
        visible={addAccountVisible}
        onClose={() => {
          setAddAccountVisible(false)
          setTokenReconnect(null)
        }}
        initialProvider={tokenReconnect}
        onChanged={what => (what === 'bank' ? setBanksReloadKey(k => k + 1) : loadData())}
      />

      <PullToRefreshIndicator scrollY={pullY} refreshing={refreshing} top={listTop} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060608' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
  },
  headerTitle: { ...Typography.h2, color: Colors.white },
  headerSub: { ...Typography.caption, color: Colors.textSub, marginTop: 2 },
  addBtn: {
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.40)',
  },
  addBtnText: { color: Colors.orange, fontWeight: '700', fontSize: 13 },
  list: { paddingHorizontal: 20, paddingBottom: 120 },
  // Glass tile (Liquid Glass on iOS 26, blurred material elsewhere)
  cardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 22,
    paddingVertical: 14,
    paddingLeft: 18,
    paddingRight: 16,
    marginBottom: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  cardItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 10 },
  cardTexts: { flex: 1 },
  cardIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: { fontSize: 19 },
  cardName: { fontSize: 16, fontWeight: '700', color: Colors.white },
  cardBank: { fontSize: 12, color: Colors.white60, marginTop: 2 },
  cardItemRight: { alignItems: 'flex-end' },
  cardBal: { fontSize: 16, fontWeight: '800', color: Colors.white, fontVariant: ['tabular-nums'] },
  cardCur: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginTop: 2, letterSpacing: 0.5 },
  textRed: { color: '#FF6B6B' },
  glowTop: {
    position: 'absolute', width: 340, height: 340, borderRadius: 170,
    backgroundColor: 'rgba(255, 107, 0, 0.30)', top: -120, left: -90,
  },
  glowRight: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: 'rgba(255, 150, 60, 0.18)', top: '38%', right: -110,
  },
  glowBottom: {
    position: 'absolute', width: 380, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255, 90, 0, 0.22)', bottom: -60, alignSelf: 'center',
  },
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { ...Typography.h3, color: Colors.white },
  emptySub: { ...Typography.caption, color: Colors.textSub, marginTop: 4 },
  groupSection: { marginBottom: 24 },
  groupTitle: {
    ...Typography.h3,
    color: Colors.orange,
    marginBottom: 12,
    marginLeft: 4,
  },
  archiveTitle: { color: Colors.textSub },
  archiveList: { opacity: 0.7 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  goalTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  goalFill: { height: '100%', borderRadius: 3 },
  goalPct: { fontSize: 11, fontWeight: '700', color: Colors.textSub, fontVariant: ['tabular-nums'] },
  emptyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  emptyHintTitle: { fontSize: 14, fontWeight: '700', color: Colors.white },
  emptyHintSub: { fontSize: 12, color: Colors.textSub, marginTop: 2 },
  emptyHintBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  emptyHintBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },
})