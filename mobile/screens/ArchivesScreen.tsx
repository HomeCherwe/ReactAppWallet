import React, { useCallback, useEffect, useState , useRef} from 'react'
import { Animated,
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  TextInput, Alert, ActivityIndicator, Platform
} from 'react-native'
import PullToRefreshIndicator, { usePullToRefresh } from '../components/PullToRefreshIndicator'
import { checkForAppUpdate } from '../utils/appUpdate'
import { Colors, Typography, Radius } from '../constants/theme'
import { listArchivedTransactions, unarchiveTransaction, Transaction } from '../api/transactions'
import { listCards, Card } from '../api/cards'
import { txBus } from '../utils/txBus'
import { stripPinTag } from '../utils/pinned'
import { fmtAmount, fmtDate, isToday, isYesterday } from '../utils/format'
import Toast from 'react-native-toast-message'
import { GlassPressable } from '../components/LiquidGlass'

function dedupeById(arr: Transaction[]): Transaction[] {
  const seen = new Set<string>()
  return (arr || []).filter(item => {
    if (!item?.id || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export default function ArchivesScreen() {
  const [rows, setRows] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [cardMap, setCardMap] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null)

  const [refreshing, setRefreshing] = useState(false)
  const pullY = useRef(new Animated.Value(0)).current
  // Where the list starts (under the header): the pull indicator comes out from there
  const [listTop, setListTop] = useState(0)

  const fetchArchived = useCallback(async (pulled = false) => {
    if (!pulled) setLoading(true)
    try {
      const [txs, cards] = await Promise.all([
        listArchivedTransactions({ search }).catch(() => []),
        listCards().catch(() => []),
      ])
      const map: Record<string, string> = {}
      cards.forEach(c => { map[c.id] = c.currency || 'UAH' })
      setCardMap(map)
      const sorted = dedupeById((txs || []).filter(tx => tx.archives))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setRows(sorted)
    } catch {
      Toast.show({ type: 'error', text1: 'Помилка завантаження архіву' })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [search])

  useEffect(() => { fetchArchived() }, [fetchArchived])

  useEffect(() => {
    return txBus.subscribe((ev) => {
      if (ev?.type === 'REALTIME') fetchArchived(true)
    })
  }, [fetchArchived])

  const handleUnarchive = async (tx: Transaction) => {
    Alert.alert('Розархівувати?', 'Транзакція повернеться до основного списку', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Розархівувати', onPress: async () => {
          try {
            setUnarchivingId(tx.id)
            await unarchiveTransaction(tx.id)
            Toast.show({ type: 'success', text1: 'Транзакцію розархівовано' })
            txBus.emit({ type: 'REALTIME' })
            await fetchArchived()
          } catch {
            Toast.show({ type: 'error', text1: 'Не вдалося розархівувати' })
          } finally {
            setUnarchivingId(null)
          }
        }
      }
    ])
  }

  const pull = usePullToRefresh(() => {
    setRefreshing(true)
    fetchArchived(true)
    checkForAppUpdate()
  }, refreshing)

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Архів</Text>
        <Text style={styles.headerSub}>{rows.length} транзакцій</Text>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Пошук в архіві..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={Colors.orange} size="large" /></View>
      ) : (
        <Animated.FlatList
          onLayout={e => setListTop(e.nativeEvent.layout.y)}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: pullY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={pull.controlRefreshing}
              tintColor="transparent"
              onRefresh={pull.onRefresh}
            />
          }
          onScrollEndDrag={pull.onScrollEndDrag}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📁</Text>
              <Text style={styles.emptyTitle}>Архів порожній</Text>
            </View>
          }
          renderItem={({ item: tx }) => {
            const currency = tx.card_id ? cardMap[tx.card_id] || 'UAH' : 'UAH'
            const amount = Number(tx.amount_stat ?? tx.amount ?? 0)
            const isExp = amount < 0
            return (
              <View style={styles.txRow}>
                <View style={styles.txLeft}>
                  <Text style={styles.txCategory}>{tx.category || 'Без категорії'}</Text>
                  <Text style={styles.txNote} numberOfLines={1}>{stripPinTag(tx.note)}</Text>
                  <Text style={styles.txDate}>
                    {isToday(tx.created_at) ? 'Сьогодні' : isYesterday(tx.created_at) ? 'Вчора' : fmtDate(tx.created_at)}
                  </Text>
                </View>
                <View style={styles.txRight}>
                  <Text style={[styles.txAmount, { color: isExp ? Colors.red : Colors.green }]}>
                    {isExp ? '-' : '+'}{fmtAmount(Math.abs(amount))} {currency}
                  </Text>
                  <GlassPressable
                    style={styles.unarchiveBtn}
                    onPress={() => handleUnarchive(tx)}
                    disabled={unarchivingId === tx.id}
                  >
                    {unarchivingId === tx.id
                      ? <ActivityIndicator size="small" color={Colors.orange} />
                      : <Text style={styles.unarchiveBtnText}>↩ Розархівувати</Text>}
                  </GlassPressable>
                </View>
              </View>
            )
          }}
        />
      )}

      <PullToRefreshIndicator scrollY={pullY} refreshing={refreshing} top={listTop} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16 },
  headerTitle: { ...Typography.h2, color: Colors.white },
  headerSub: { ...Typography.caption, color: Colors.textSub },
  searchWrap: { paddingHorizontal: 20, marginBottom: 12 },
  searchInput: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 12, color: Colors.white, fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  list: { paddingHorizontal: 20, paddingBottom: 120 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { ...Typography.h3, color: Colors.textSub },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  txLeft: { flex: 1, marginRight: 12 },
  txCategory: { ...Typography.body, color: Colors.white, fontWeight: '600' },
  txNote: { ...Typography.caption, color: Colors.textSub, marginTop: 2 },
  txDate: { ...Typography.small, color: Colors.textMuted, marginTop: 4 },
  txRight: { alignItems: 'flex-end', gap: 8 },
  txAmount: { ...Typography.body, fontWeight: '700' },
  unarchiveBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(255,107,0,0.15)', borderRadius: Radius.sm, borderWidth: 1, borderColor: 'rgba(255,107,0,0.3)' },
  unarchiveBtnText: { color: Colors.orange, fontSize: 12, fontWeight: '600' },
})