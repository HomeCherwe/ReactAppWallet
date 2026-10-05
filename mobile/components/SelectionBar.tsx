import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { Colors } from '../constants/theme'
import { Card } from '../api/cards'
import { deleteTransactions, getTransactionCategories, Transaction, updateTransactionsBulk } from '../api/transactions'
import { autoCategorize } from '../api/insights'
import { isSyncCategory } from '../utils/cardExclusion'
import { triggerErrorHaptic, triggerLightHaptic, triggerSuccessHaptic } from '../utils/haptics'
import { GlassSurface } from './LiquidGlass'
import Icon, { IconName } from './Icon'
import SheetModal from './SheetModal'

interface Props {
  /** null: not selecting (the bar slides away) */
  selected: Transaction[] | null
  cards: Card[]
  onCancel: () => void
  /** Selects every transaction loaded in the list */
  onSelectAll: () => void
  /** A change was made: the screen reloads and leaves selection mode */
  onDone: () => void
}

const plural = (n: number) =>
  n % 10 === 1 && n % 100 !== 11 ? 'транзакцію' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'транзакції' : 'транзакцій'

/**
 * Selection mode on Home (long press → «Вибрати», then tap rows): a floating bar with what can be done
 * to all of them at once — category, card, statistics, archive, delete.
 */
export default function SelectionBar({ selected, cards, onCancel, onSelectAll, onDone }: Props) {
  const slide = useRef(new Animated.Value(0)).current
  const [picker, setPicker] = useState<'category' | 'card' | null>(null)
  const [categories, setCategories] = useState<string[] | null>(null)
  const [catQuery, setCatQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const last = useRef<Transaction[]>([])
  if (selected) last.current = selected
  const list = last.current
  const count = list.length
  const ids = list.map(t => t.id)

  useEffect(() => {
    Animated.spring(slide, { toValue: selected ? 1 : 0, useNativeDriver: true, speed: 14, bounciness: selected ? 6 : 0 }).start()
  }, [!!selected])

  useEffect(() => {
    if (picker === 'category' && !categories) {
      getTransactionCategories()
        .then(c => setCategories([...new Set(c.filter(x => x && !isSyncCategory(x)))].sort((a, b) => a.localeCompare(b, 'uk'))))
        .catch(() => setCategories([]))
    }
  }, [picker])

  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true)
    try {
      await work()
      triggerSuccessHaptic()
      Toast.show({ type: 'success', text1: done })
      setPicker(null)
      onDone()
    } catch (e: any) {
      triggerErrorHaptic()
      Toast.show({ type: 'error', text1: 'Не вдалося', text2: e?.message })
    } finally {
      setBusy(false)
    }
  }

  const allExcluded = count > 0 && list.every(t => t.exclude_from_stats)

  const actions: { icon: IconName; label: string; destructive?: boolean; onPress: () => void }[] = [
    { icon: 'tag', label: 'Категорія', onPress: () => setPicker('category') },
    { icon: 'card', label: 'Картка', onPress: () => setPicker('card') },
    {
      icon: 'chart',
      label: allExcluded ? 'Враховувати' : 'Без статист.',
      onPress: () =>
        run(
          () => updateTransactionsBulk(ids, { exclude_from_stats: !allExcluded }),
          allExcluded ? `Знову враховуються: ${count}` : `Не враховуються в статистиці: ${count}`
        ),
    },
    {
      icon: 'archive',
      label: 'В архів',
      onPress: () =>
        Alert.alert(`Заархівувати ${count} ${plural(count)}?`, 'Вони зникнуть зі списку й балансу; повернути можна з архіву.', [
          { text: 'Скасувати', style: 'cancel' },
          { text: 'В архів', onPress: () => run(() => updateTransactionsBulk(ids, { archives: true }), `В архіві: ${count}`) },
        ]),
    },
    {
      icon: 'trash',
      label: 'Видалити',
      destructive: true,
      onPress: () =>
        Alert.alert(`Видалити ${count} ${plural(count)}?`, 'Це не можна скасувати.', [
          { text: 'Скасувати', style: 'cancel' },
          { text: 'Видалити', style: 'destructive', onPress: () => run(() => deleteTransactions(ids), `Видалено: ${count}`) },
        ]),
    },
  ]

  const q = catQuery.trim()
  const shownCats = useMemo(
    () => (categories ?? []).filter(c => !q || c.toLowerCase().includes(q.toLowerCase())),
    [categories, q]
  )
  const canCreate = !!q && !(categories ?? []).some(c => c.toLowerCase() === q.toLowerCase())
  // The rules learn it: the same merchants' waiting bank imports get it too
  const pickCategory = (c: string) =>
    run(async () => {
      await updateTransactionsBulk(ids, { category: c })
      await autoCategorize({ gpt: false }).catch(() => null)
    }, `Категорія «${c}» · ${count}`)

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [200, 0] })

  return (
    <>
      <Animated.View
        pointerEvents={selected ? 'box-none' : 'none'}
        style={[styles.wrap, { opacity: slide, transform: [{ translateY }] }]}
      >
        <View style={styles.bar}>
          <GlassSurface borderRadius={24} tintColor="rgba(20, 20, 24, 0.6)" />
          <View style={styles.head}>
            <Pressable
              accessibilityLabel="Скасувати вибір"
              hitSlop={10}
              onPress={() => {
                triggerLightHaptic()
                onCancel()
              }}
              style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
            >
              <Icon name="close" size={15} color="#fff" strokeWidth={2.6} />
            </Pressable>
            <Text style={styles.count}>{count ? `Обрано ${count}` : 'Оберіть транзакції'}</Text>
            {busy ? (
              <ActivityIndicator color={Colors.orange} />
            ) : (
              <Pressable
                hitSlop={8}
                onPress={() => {
                  triggerLightHaptic()
                  onSelectAll()
                }}
              >
                <Text style={styles.all}>Усі</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.actions}>
            {actions.map(a => (
              <Pressable
                key={a.label}
                disabled={!count || busy}
                onPress={() => {
                  triggerLightHaptic()
                  a.onPress()
                }}
                style={({ pressed }) => [styles.action, (!count || busy) && styles.disabled, pressed && styles.pressed]}
              >
                <Icon name={a.icon} size={20} color={a.destructive ? '#FF6B6B' : Colors.white} strokeWidth={2.2} />
                <Text style={[styles.actionText, a.destructive && { color: '#FF6B6B' }]} numberOfLines={1}>
                  {a.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Animated.View>

      {/* Category for all of them */}
      <SheetModal visible={picker === 'category'} onClose={() => setPicker(null)} sheetStyle={styles.sheet}>
        <Text style={styles.sheetTitle}>Категорія для {count} {plural(count)}</Text>
        <View style={styles.sheetBody}>
          <TextInput
            value={catQuery}
            onChangeText={setCatQuery}
            placeholder="Пошук або нова категорія"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            autoCorrect={false}
            keyboardAppearance="dark"
          />
          {categories === null ? (
            <ActivityIndicator color={Colors.orange} style={{ marginVertical: 20 }} />
          ) : (
            <ScrollView contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
              {canCreate && (
                <Pressable onPress={() => pickCategory(q)} style={[styles.chip, styles.chipCreate]}>
                  <Icon name="plus" size={13} color={Colors.orange} strokeWidth={2.6} />
                  <Text style={[styles.chipText, { color: Colors.orange }]}>Створити «{q}»</Text>
                </Pressable>
              )}
              {shownCats.map(c => (
                <Pressable key={c} disabled={busy} onPress={() => pickCategory(c)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                  <Text style={styles.chipText}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </SheetModal>

      {/* Card for all of them */}
      <SheetModal visible={picker === 'card'} onClose={() => setPicker(null)} sheetStyle={styles.sheet}>
        <Text style={styles.sheetTitle}>Перенести {count} {plural(count)} на картку</Text>
        <ScrollView contentContainerStyle={styles.cardList}>
          {cards.map((c, i) => (
            <Pressable
              key={c.id}
              disabled={busy}
              onPress={() => run(() => updateTransactionsBulk(ids, { card_id: c.id }), `Перенесено на «${c.name}» · ${count}`)}
              style={({ pressed }) => [styles.cardRow, i < cards.length - 1 && styles.cardRowBorder, pressed && styles.pressed]}
            >
              <View style={styles.cardIcon}>
                <Icon name="card" size={16} color={Colors.orangeLight} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.cardBank} numberOfLines={1}>{c.bank || 'Рахунок'}</Text>
              </View>
              <Text style={styles.cardCur}>{c.currency}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SheetModal>
    </>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 104, // above the tab dock
  },
  bar: {
    borderRadius: 24,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: 'rgba(22, 22, 26, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  cancel: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: Colors.white,
  },
  all: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.orangeLight,
    paddingHorizontal: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: 14,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.white80,
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.6,
  },
  sheet: {
    backgroundColor: 'rgba(14, 14, 18, 0.97)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    paddingTop: 8,
    maxHeight: '75%',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.white,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  sheetBody: {
    paddingHorizontal: 16,
    gap: 12,
    flexShrink: 1,
  },
  input: {
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    fontSize: 15,
    color: Colors.white,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 40,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  chipCreate: {
    borderColor: 'rgba(255, 107, 0, 0.5)',
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  cardList: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  cardRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
  cardBank: {
    fontSize: 12,
    color: Colors.white40,
    marginTop: 1,
  },
  cardCur: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white60,
  },
})
