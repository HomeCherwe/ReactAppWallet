import React, { useCallback, useEffect, useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, Platform, RefreshControl
} from 'react-native'
import { Colors, Typography, Radius } from '../constants/theme'
import { listCards, deleteCard, setCardExcludedFromStats, Card } from '../api/cards'
import { getSumByCard } from '../api/transactions'
import { fmtAmount } from '../utils/format'
import AddAccountFlow from '../components/AddAccountFlow'
import CardTransactionsSheet from '../components/CardTransactionsSheet'
import CardSettingsModal from '../components/CardSettingsModal'
import ConnectedBanks from '../components/ConnectedBanks'
import { BankProvider } from '../api/bankConnections'
import { txBus } from '../utils/txBus'
import GlassButton from '../components/GlassButton'
import { getBucket } from '../utils/currency'
import { GlassPressable } from '../components/LiquidGlass'

export default function CardsScreen() {
  const [cards, setCards] = useState<Card[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // "+ Додати": connect a bank (sync) or add your own account
  const [addAccountVisible, setAddAccountVisible] = useState(false)
  const [banksReloadKey, setBanksReloadKey] = useState(0)
  const [cardTxCard, setCardTxCard] = useState<Card | null>(null)
  const [settingsCard, setSettingsCard] = useState<Card | null>(null)
  // Reconnecting a token bank (Monobank): the add sheet opens straight on its token form
  const [tokenReconnect, setTokenReconnect] = useState<BankProvider | null>(null)

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

  const groupedCards = useMemo(() => {
    const groups: Record<string, Card[]> = {
      cards: [],
      savings: [],
      cash: [],
    }
    cards.forEach(c => {
      const b = getBucket(c)
      if (groups[b]) groups[b].push(c)
    })
    return groups
  }, [cards])

  const renderCardItem = (card: Card) => {
    const bal = balances[card.id] ?? Number(card.initial_balance || 0)
    return (
      <View style={styles.cardItem} key={card.id}>
        <View style={styles.cardItemLeft}>
          <View style={styles.cardIconWrap}>
            <Text style={styles.cardIcon}>💳</Text>
          </View>
          <View>
            <Text style={styles.cardName}>{card.name}</Text>
            <Text style={styles.cardBank}>
              {card.bank || 'БАНК'} {card.card_number ? `• ${card.card_number}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.cardItemRight}>
          <Text style={[styles.cardBal, bal < 0 ? styles.textRed : styles.textGreen]}>
            {fmtAmount(bal, card.currency)}
          </Text>
          <GlassPressable
            style={styles.deleteBtn}
            onPress={() => handleDelete(card)}
          >
            <Text style={styles.deleteText}>Видалити</Text>
          </GlassPressable>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Рахунки та картки</Text>
          <Text style={styles.headerSub}>{cards.length} активних рахунків</Text>
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
        <FlatList
          data={[]} // using FlatList just for the refresh control and scroll
          keyExtractor={() => 'dummy'}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                loadData()
              }}
              tintColor={Colors.orange}
            />
          }
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
                {groupedCards.cards.length > 0 && (
                  <View style={styles.groupSection}>
                    <Text style={styles.groupTitle}>💳 Картки</Text>
                    {groupedCards.cards.map(renderCardItem)}
                  </View>
                )}
                {groupedCards.savings.length > 0 && (
                  <View style={styles.groupSection}>
                    <Text style={styles.groupTitle}>🎯 Скарбнички</Text>
                    {groupedCards.savings.map(renderCardItem)}
                  </View>
                )}
                {groupedCards.cash.length > 0 && (
                  <View style={styles.groupSection}>
                    <Text style={styles.groupTitle}>💵 Готівка</Text>
                    {groupedCards.cash.map(renderCardItem)}
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
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
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
  cardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: { fontSize: 20 },
  cardName: { fontSize: 16, fontWeight: '700', color: Colors.white },
  cardBank: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  cardItemRight: { alignItems: 'flex-end', gap: 6 },
  cardBal: { fontSize: 16, fontWeight: '800' },
  textGreen: { color: Colors.white },
  textRed: { color: Colors.red },
  deleteBtn: { paddingVertical: 2, paddingHorizontal: 6 },
  deleteText: { color: Colors.red, fontSize: 12, fontWeight: '600' },
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
})