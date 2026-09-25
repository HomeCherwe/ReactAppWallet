import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  Platform,
  Keyboard,
  ActivityIndicator,
} from 'react-native'
import { Colors, Radius } from '../constants/theme'
import { Card } from '../api/cards'
import {
  createTransaction,
  getRecentUsage,
  invalidateCategoriesCache,
  RecentUsage,
} from '../api/transactions'
import { LinearGradient } from 'expo-linear-gradient'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'
import CalcKeypad from './CalcKeypad'
import { evaluate, formatExpr, hasOperator, pressKey } from '../utils/calc'
import { getCategoryIcon } from '../utils/categoryIcon'
import { triggerErrorHaptic, triggerSuccessHaptic } from '../utils/haptics'

// Used only until the user has categories of their own
const DEFAULT_CATEGORIES = {
  expense: [
    'Їжа та продукти',
    'Кафе та ресторани',
    'Авто та транспорт',
    'Здоров\'я та краса',
    'Одяг та взуття',
    'Комунальні послуги',
    'Зв\'язок та інтернет',
    'Дім та затишок',
    'Інше',
  ],
  income: ['Зарплата', 'Переказ', 'Інше'],
}

const CURRENCY_SYMBOLS: Record<string, string> = { UAH: '₴', USD: '$', EUR: '€', GBP: '£', PLN: 'zł' }

type TxType = 'expense' | 'income'

interface AddTransactionModalProps {
  visible: boolean
  onClose: () => void
  cards: Card[]
  /** Cards excluded from statistics — not offered in the picker */
  excludedCardIds?: string[]
  onSuccess: () => void
  primaryCurrency?: string
}

export default function AddTransactionModal({
  visible,
  onClose,
  cards,
  excludedCardIds = [],
  onSuccess,
  primaryCurrency = 'UAH',
}: AddTransactionModalProps) {
  const [type, setType] = useState<TxType>('expense')
  const [expr, setExpr] = useState('')
  const [selectedCardId, setSelectedCardId] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [note, setNote] = useState('')
  // Hide the calculator while a text field (note / category search) uses the system keyboard
  const [textFocused, setTextFocused] = useState(false)
  const [catQuery, setCatQuery] = useState('')
  const [customCategory, setCustomCategory] = useState('')
  const [usage, setUsage] = useState<RecentUsage | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Cards and categories: most recently used first, then the rest
  const orderedCards = useMemo(() => {
    const rank = new Map((usage?.cardIds ?? []).map((id, i) => [id, i]))
    const excluded = new Set(excludedCardIds)
    return cards.filter(c => !excluded.has(c.id)).sort(
      (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity)
    )
  }, [cards, usage, excludedCardIds])

  const categories = useMemo(() => {
    const own = usage?.[type] ?? []
    const base = own.length > 0 ? own : DEFAULT_CATEGORIES[type]
    // A newly typed category goes first until it's saved with the transaction
    return customCategory ? [customCategory, ...base.filter(c => c !== customCategory)] : base
  }, [usage, type, customCategory])

  // Search runs over all of the user's categories (expense + income), current type first
  const searchResults = useMemo(() => {
    const q = catQuery.trim().toLowerCase()
    if (!q) return null
    const other = type === 'expense' ? usage?.income ?? [] : usage?.expense ?? []
    const all = [...new Set([...categories, ...other])]
    return all.filter(c => c.toLowerCase().includes(q))
  }, [catQuery, categories, usage, type])

  const canCreateCategory =
    !!catQuery.trim() &&
    !(searchResults ?? []).some(c => c.toLowerCase() === catQuery.trim().toLowerCase())

  const pickCategory = (cat: string) => {
    if (!categories.includes(cat)) setCustomCategory(cat)
    setSelectedCategory(cat)
    setCatQuery('')
    Keyboard.dismiss()
  }

  // Fresh form each time the sheet opens
  useEffect(() => {
    if (!visible) return
    setType('expense')
    setExpr('')
    setNote('')
    setErrorMsg('')
    setCatQuery('')
    setCustomCategory('')
    getRecentUsage(excludedCardIds)
      .then(setUsage)
      .catch(() => setUsage({ expense: [], income: [], cardIds: [] }))
  }, [visible])

  // Default selections follow the recency order
  useEffect(() => {
    if (!orderedCards.some(c => c.id === selectedCardId)) {
      setSelectedCardId(orderedCards[0]?.id ?? '')
    }
  }, [orderedCards])

  useEffect(() => {
    if (!categories.includes(selectedCategory)) setSelectedCategory(categories[0] ?? '')
  }, [categories])

  // After a fresh open with usage loaded, start from the most recent card/category
  useEffect(() => {
    if (!visible || !usage) return
    setSelectedCardId(orderedCards[0]?.id ?? '')
    setSelectedCategory(categories[0] ?? '')
  }, [usage])

  const selectedCard = orderedCards.find(c => c.id === selectedCardId)
  const currency = selectedCard?.currency || primaryCurrency
  const currencySymbol = CURRENCY_SYMBOLS[currency] ?? currency
  const result = evaluate(expr)
  const showResultLine = hasOperator(expr) && result !== null
  // Font shrinks with the expression length (manual sizing — adjustsFontSizeToFit
  // collapsed short values like "0" to zero width inside the flex row)
  const amountLabel = expr ? formatExpr(expr) : '0'
  const amountFontSize =
    amountLabel.length <= 9 ? 44 : amountLabel.length <= 13 ? 34 : amountLabel.length <= 18 ? 26 : 20

  const handleKey = useCallback((key: string) => {
    setErrorMsg('')
    setExpr(prev => pressKey(prev, key))
  }, [])

  const handleSave = async () => {
    const value = evaluate(expr)
    if (value === null || value <= 0) {
      triggerErrorHaptic()
      setErrorMsg('Вкажіть суму більше нуля')
      return
    }

    setErrorMsg('')
    setLoading(true)
    try {
      await createTransaction({
        amount: type === 'expense' ? -Math.abs(value) : Math.abs(value),
        card_id: selectedCardId || undefined,
        category: selectedCategory || undefined,
        note: note.trim() || selectedCategory,
      })
      invalidateCategoriesCache() // so the recency order includes this one next time
      triggerSuccessHaptic()
      onSuccess()
      onClose()
    } catch (err: any) {
      console.error('[AddTransactionModal] Error:', err)
      triggerErrorHaptic()
      setErrorMsg(err.message || 'Помилка при створенні транзакції')
    } finally {
      setLoading(false)
    }
  }

  // Two rows of category chips, scrolled horizontally together
  const categoryRows = useMemo(() => {
    const rows: string[][] = [[], []]
    categories.forEach((c, i) => rows[i % 2].push(c))
    return rows
  }, [categories])

  return (
    <SheetModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>

      <View style={styles.header}>
        <Text style={styles.title}>Нова транзакція</Text>
        <GlassPressable onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </GlassPressable>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Type */}
        <View style={styles.segment}>
          {(['expense', 'income'] as TxType[]).map(t => {
            const active = type === t
            return (
              <Pressable
                key={t}
                style={[styles.segmentBtn, active && (t === 'expense' ? styles.segExpense : styles.segIncome)]}
                onPress={() => setType(t)}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {t === 'expense' ? 'Витрата' : 'Дохід'}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Amount (typed on the keypad below) */}
        <Pressable style={styles.amountBox} onPress={() => Keyboard.dismiss()}>
          <View style={styles.amountRow}>
            <Text
              style={[
                styles.amountText,
                { fontSize: amountFontSize, lineHeight: Math.round(amountFontSize * 1.2) },
                !expr && styles.amountPlaceholder,
                type === 'income' && !!expr && styles.incomeColor,
              ]}
              numberOfLines={1}
            >
              {amountLabel}
            </Text>
            <Text style={styles.amountCurrency}>{currencySymbol}</Text>
          </View>
          <Text style={styles.resultLine}>
            {showResultLine ? `= ${formatExpr(String(result))} ${currencySymbol}` : ' '}
          </Text>
          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
        </Pressable>

        {/* Card */}
        {orderedCards.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>РАХУНОК / КАРТКА</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
              keyboardShouldPersistTaps="handled"
            >
              {orderedCards.map(c => {
                const active = c.id === selectedCardId
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.cardChip, active && styles.chipActive]}
                    onPress={() => setSelectedCardId(c.id)}
                  >
                    <Text style={styles.cardChipBank} numberOfLines={1}>
                      {(c.bank || 'Картка').toUpperCase()} · {c.currency}
                    </Text>
                    <Text style={[styles.cardChipName, active && styles.chipTextActive]} numberOfLines={1}>
                      {c.name}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        )}

        {/* Category: search existing or type a new one */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>КАТЕГОРІЯ</Text>
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Пошук або нова категорія"
              placeholderTextColor="rgba(255, 255, 255, 0.35)"
              value={catQuery}
              onChangeText={setCatQuery}
              onFocus={() => setTextFocused(true)}
              onBlur={() => setTextFocused(false)}
              onSubmitEditing={() => {
                const q = catQuery.trim()
                if (!q) return
                pickCategory(searchResults?.find(c => c.toLowerCase() === q.toLowerCase()) ?? q)
              }}
              returnKeyType="done"
              autoCorrect={false}
            />
            {catQuery ? (
              <Pressable onPress={() => setCatQuery('')} hitSlop={10}>
                <Text style={styles.searchClear}>✕</Text>
              </Pressable>
            ) : null}
          </View>

          {searchResults ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
              keyboardShouldPersistTaps="handled"
            >
              {canCreateCategory && (
                <Pressable style={[styles.catChip, styles.newCatChip]} onPress={() => pickCategory(catQuery.trim())}>
                  <Text style={styles.newCatText}>＋ Нова: «{catQuery.trim()}»</Text>
                </Pressable>
              )}
              {searchResults.map(cat => (
                <Pressable
                  key={cat}
                  style={[styles.catChip, cat === selectedCategory && styles.chipActive]}
                  onPress={() => pickCategory(cat)}
                >
                  <Text style={styles.catIcon}>{getCategoryIcon(cat, type === 'income' ? 1 : -1)}</Text>
                  <Text style={[styles.catText, cat === selectedCategory && styles.chipTextActive]}>{cat}</Text>
                </Pressable>
              ))}
              {!canCreateCategory && searchResults.length === 0 && (
                <Text style={styles.noResults}>Нічого не знайдено</Text>
              )}
            </ScrollView>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catRows}
              keyboardShouldPersistTaps="handled"
            >
              {categoryRows.map((row, r) => (
                <View key={r} style={styles.chipsRow}>
                  {row.map(cat => {
                    const active = cat === selectedCategory
                    return (
                      <Pressable
                        key={cat}
                        style={[styles.catChip, active && styles.chipActive]}
                        onPress={() => setSelectedCategory(cat)}
                      >
                        <Text style={styles.catIcon}>
                          {getCategoryIcon(cat, type === 'income' ? 1 : -1)}
                        </Text>
                        <Text style={[styles.catText, active && styles.chipTextActive]}>{cat}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Note */}
        <TextInput
          style={styles.noteInput}
          placeholder="Примітка (не обов'язково)"
          placeholderTextColor="rgba(255, 255, 255, 0.35)"
          value={note}
          onChangeText={setNote}
          onFocus={() => setTextFocused(true)}
          onBlur={() => setTextFocused(false)}
          returnKeyType="done"
        />
      </ScrollView>

      {/* The calculator keypad replaces the system keyboard; it hides while typing a note */}
      {!textFocused && <CalcKeypad onKey={handleKey} />}

      <View style={styles.footer}>
        <Pressable
          onPress={handleSave}
          disabled={loading}
          style={({ pressed }) => [styles.saveBtn, pressed && styles.saveBtnPressed]}
        >
          <LinearGradient
            colors={['#FF7A1A', '#FF5A00']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.saveText}>Зберегти транзакцію</Text>
          )}
        </Pressable>
      </View>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    paddingTop: 8,
    maxHeight: '94%',
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: Colors.white80,
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  segExpense: {
    backgroundColor: 'rgba(239, 68, 68, 0.22)',
  },
  segIncome: {
    backgroundColor: 'rgba(34, 197, 94, 0.22)',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSub,
  },
  segmentTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  amountBox: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  incomeColor: {
    color: Colors.green,
  },
  amountText: {
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  amountPlaceholder: {
    color: 'rgba(255, 255, 255, 0.25)',
  },
  amountCurrency: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.orange,
  },
  resultLine: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: Colors.white60,
    fontVariant: ['tabular-nums'],
  },
  errorText: {
    color: Colors.red,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  section: {
    marginTop: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.45)',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  catRows: {
    flexDirection: 'column',
    gap: 8,
  },
  cardChip: {
    maxWidth: 170,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardChipBank: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.orange,
    letterSpacing: 0.4,
  },
  cardChipName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white80,
    marginTop: 1,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.20)',
    borderColor: 'rgba(255, 107, 0, 0.55)',
  },
  chipTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  catIcon: {
    fontSize: 15,
  },
  catText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.white80,
  },
  noteInput: {
    marginTop: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    color: Colors.white,
    fontSize: 15,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
  },
  saveBtn: {
    height: 54,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  saveText: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: -0.2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  searchIcon: {
    fontSize: 13,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    color: Colors.white,
    fontSize: 15,
  },
  searchClear: {
    fontSize: 13,
    color: Colors.white60,
  },
  newCatChip: {
    backgroundColor: 'rgba(255, 107, 0, 0.14)',
    borderColor: 'rgba(255, 107, 0, 0.45)',
    borderStyle: 'dashed',
  },
  newCatText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.orange,
  },
  noResults: {
    fontSize: 13,
    color: Colors.textMuted,
    paddingVertical: 8,
  },
})
