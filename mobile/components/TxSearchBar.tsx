import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Card } from '../api/cards'
import { getTransactionCategories } from '../api/transactions'
import { Colors } from '../constants/theme'
import { FeedSearch } from '../hooks/useTransactionFeed'
import { triggerLightHaptic, triggerSelectionHaptic } from '../utils/haptics'
import { PERIODS } from '../utils/periods'
import Icon from './Icon'
import SheetModal from './SheetModal'

type PickerKind = 'period' | 'card' | 'category'

interface Option {
  key: string
  label: string
  hint?: string
  selected: boolean
  onPick: () => void
}

const TITLES: Record<PickerKind, string> = {
  period: 'Період',
  card: 'Картка',
  category: 'Категорія',
}

/**
 * Search field over the home transactions list, with the period / card / category filters under it.
 * The search itself runs on the server (useTransactionFeed → search_transactions).
 */
export default function TxSearchBar({ search, cards }: { search: FeedSearch; cards: Card[] }) {
  // Kept after closing, so the sheet doesn't go blank while it slides away
  const [picker, setPicker] = useState<PickerKind>('period')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [categories, setCategories] = useState<string[] | null>(null)

  const openPicker = (kind: PickerKind) => {
    triggerLightHaptic()
    setPicker(kind)
    setPickerOpen(true)
    if (kind === 'category' && !categories) {
      getTransactionCategories()
        .then(list => setCategories([...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uk'))))
        .catch(() => setCategories([]))
    }
  }

  const sortedCards = useMemo(() => [...cards].sort((a, b) => a.name.localeCompare(b.name, 'uk')), [cards])
  const periodLabel = search.period !== 'all' ? PERIODS.find(p => p.id === search.period)?.label ?? null : null
  const cardLabel = search.cardId ? cards.find(c => c.id === search.cardId)?.name ?? 'Картка' : null

  const options: Option[] =
    picker === 'period'
      ? PERIODS.map(p => ({ key: p.id, label: p.label, selected: search.period === p.id, onPick: () => search.setPeriod(p.id) }))
      : picker === 'card'
        ? [
            { key: '', label: 'Усі картки', selected: !search.cardId, onPick: () => search.setCardId(null) },
            ...sortedCards.map(c => ({
              key: c.id,
              label: c.name,
              hint: c.currency,
              selected: search.cardId === c.id,
              onPick: () => search.setCardId(c.id),
            })),
          ]
        : [
            { key: '', label: 'Усі категорії', selected: !search.category, onPick: () => search.setCategory(null) },
            ...(categories ?? []).map(c => ({
              key: c,
              label: c,
              selected: search.category === c,
              onPick: () => search.setCategory(c),
            })),
          ]

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Icon name="search" size={16} color={Colors.white40} strokeWidth={2.2} />
        <TextInput
          value={search.query}
          onChangeText={search.setQuery}
          placeholder="Мерчант, сума, 12.09, вересень…"
          placeholderTextColor={Colors.textMuted}
          style={styles.input}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          selectionColor={Colors.orange}
          keyboardAppearance="dark"
        />
        {search.searching && (search.query !== '' || search.active) ? (
          <ActivityIndicator size="small" color={Colors.white40} />
        ) : search.query !== '' ? (
          <Pressable accessibilityLabel="Очистити пошук" hitSlop={10} onPress={() => search.setQuery('')} style={styles.clearBtn}>
            <Icon name="close" size={11} color="#141416" strokeWidth={3.2} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chips}
      >
        <Chip label={periodLabel ?? 'Період'} active={!!periodLabel} onPress={() => openPicker('period')} onClear={() => search.setPeriod('all')} />
        <Chip label={cardLabel ?? 'Картка'} active={!!cardLabel} onPress={() => openPicker('card')} onClear={() => search.setCardId(null)} />
        <Chip
          label={search.category ?? 'Категорія'}
          active={!!search.category}
          onPress={() => openPicker('category')}
          onClear={() => search.setCategory(null)}
        />
        {search.active && (
          <Pressable
            onPress={() => {
              triggerLightHaptic()
              search.reset()
            }}
            style={({ pressed }) => [styles.resetChip, pressed && styles.pressed]}
          >
            <Text style={styles.resetText}>Скинути</Text>
          </Pressable>
        )}
      </ScrollView>

      <SheetModal visible={pickerOpen} onClose={() => setPickerOpen(false)} sheetStyle={styles.sheet}>
        <Text style={styles.sheetTitle}>{TITLES[picker]}</Text>
        <ScrollView contentContainerStyle={styles.sheetList} showsVerticalScrollIndicator={false}>
          {picker === 'category' && categories === null ? (
            <ActivityIndicator color={Colors.orange} style={{ marginVertical: 24 }} />
          ) : (
            options.map((o, i) => (
              <Pressable
                key={o.key || '__all'}
                onPress={() => {
                  triggerSelectionHaptic()
                  o.onPick()
                  setPickerOpen(false)
                }}
                style={({ pressed }) => [styles.option, i < options.length - 1 && styles.optionBorder, pressed && styles.optionPressed]}
              >
                <Text style={[styles.optionText, o.selected && styles.optionTextSelected]} numberOfLines={1}>
                  {o.label}
                </Text>
                {o.hint ? <Text style={styles.optionHint}>{o.hint}</Text> : null}
                {o.selected && <Icon name="check" size={18} color={Colors.orange} strokeWidth={2.6} />}
              </Pressable>
            ))
          )}
        </ScrollView>
      </SheetModal>
    </View>
  )
}

function Chip({ label, active, onPress, onClear }: { label: string; active: boolean; onPress: () => void; onClear: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
      {active ? (
        <Pressable
          accessibilityLabel={`Скинути: ${label}`}
          hitSlop={8}
          onPress={() => {
            triggerLightHaptic()
            onClear()
          }}
        >
          <Icon name="close" size={12} color={Colors.orange} strokeWidth={2.8} />
        </Pressable>
      ) : (
        <Icon name="chevronDown" size={13} color={Colors.white40} strokeWidth={2.4} />
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    color: Colors.white,
  },
  clearBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.white40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  chipActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.14)',
    borderColor: 'rgba(255, 107, 0, 0.45)',
  },
  chipText: {
    maxWidth: 160,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white80,
  },
  chipTextActive: {
    color: Colors.orangeLight,
  },
  resetChip: {
    height: 32,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  resetText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white60,
  },
  pressed: {
    opacity: 0.7,
  },
  sheet: {
    backgroundColor: 'rgba(14, 14, 18, 0.97)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    paddingTop: 8,
    maxHeight: '70%',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.white,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  sheetList: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 4,
  },
  optionBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  optionPressed: {
    opacity: 0.6,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    color: Colors.white,
  },
  optionTextSelected: {
    fontWeight: '700',
    color: Colors.orangeLight,
  },
  optionHint: {
    fontSize: 13,
    color: Colors.textMuted,
  },
})
