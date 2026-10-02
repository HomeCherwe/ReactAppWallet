import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import Toast from 'react-native-toast-message'
import { Colors } from '../constants/theme'
import { createTransaction, getTransactionCategories, ScannedTransaction, scanTransactions } from '../api/transactions'
import { Card } from '../api/cards'
import { triggerErrorHaptic, triggerLightHaptic, triggerSuccessHaptic } from '../utils/haptics'
import GlassButton from './GlassButton'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'
import Icon from './Icon'
import { fmtMoney } from './TxRow'

interface ScanReceiptModalProps {
  visible: boolean
  cards: Card[]
  onClose: () => void
  onSaved: () => void
}

// uri for the preview; base64 is always JPEG (the picker re-encodes HEIC/PNG), which GPT can read
type Picked = { uri: string; base64: string }
type Row = ScannedTransaction & { key: string; selected: boolean; amountText: string }

const MAX_IMAGES = 5
// Each image is its own request; the backend (Vercel) takes up to ~4.5 MB per request
const MAX_IMAGE_CHARS = 4_000_000
// Images read at the same time
const SCAN_PARALLEL = 2
const BASE_CATEGORIES = ['Продукти', 'Транспорт', 'Шопінг', "Здоров'я", 'Розваги', 'Комунальні', 'Кафе', 'Підписки', 'Інше']

// "DD/MM/YYYY" → midday that day (so no time zone moves it to another date)
function dateFromScan(s: string): Date {
  const [dd, mm, yyyy] = String(s || '').split('/').map(Number)
  const d = dd && mm && yyyy ? new Date(yyyy, mm - 1, dd, 12) : new Date()
  return isNaN(d.getTime()) ? new Date() : d
}

/**
 * "Сканувати чек або скрін" (same as the web): photos of receipts or screenshots of any bank app go
 * to GPT (/api/scan-transactions), which lists every transaction it finds; the user checks them,
 * picks the card and saves.
 */
export default function ScanReceiptModal({ visible, cards, onClose, onSaved }: ScanReceiptModalProps) {
  const [step, setStep] = useState<'pick' | 'scanning' | 'review'>('pick')
  const [images, setImages] = useState<Picked[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [cardId, setCardId] = useState<string>('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [categories, setCategories] = useState<string[]>(BASE_CATEGORIES)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  // Fresh start every time it opens
  useEffect(() => {
    if (!visible) return
    setStep('pick')
    setImages([])
    setRows([])
    setExpanded(null)
    setCardId(prev => (cards.some(c => c.id === prev) ? prev : cards[0]?.id ?? ''))
    getTransactionCategories()
      .then(list => setCategories([...new Set([...BASE_CATEGORIES, ...list.filter(Boolean)])]))
      .catch(() => {})
  }, [visible])

  const card = cards.find(c => c.id === cardId)
  const selectedCount = rows.filter(r => r.selected).length

  const addImages = async (camera: boolean) => {
    try {
      let result: ImagePicker.ImagePickerResult
      if (camera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert('Немає доступу до камери', 'Дозвольте MyWallet доступ до камери в Параметрах iPhone.')
          return
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.4, base64: true })
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.5,
          base64: true,
          allowsMultipleSelection: true,
          selectionLimit: MAX_IMAGES,
        })
      }
      if (result.canceled || !result.assets?.length) return
      const usable = result.assets.filter(a => a.base64 && a.base64.length <= MAX_IMAGE_CHARS)
      if (usable.length < result.assets.length) {
        Toast.show({
          type: 'info',
          text1: 'Частину зображень не додано',
          text2: 'Вони завеликі — спробуйте скріншот замість фото',
        })
      }
      if (usable.length === 0) return
      triggerLightHaptic()
      setImages(prev => [...prev, ...usable.map(a => ({ uri: a.uri, base64: a.base64 as string }))].slice(0, MAX_IMAGES))
    } catch (e: any) {
      Alert.alert('Помилка', e?.message || 'Не вдалося відкрити зображення')
    }
  }

  // One request per image (each stays under the upload limit), a couple at a time
  const scanAll = async (): Promise<ScannedTransaction[]> => {
    const found: ScannedTransaction[] = []
    let failed = 0
    let lastError = ''
    setProgress({ done: 0, total: images.length })
    for (let i = 0; i < images.length; i += SCAN_PARALLEL) {
      const batch = await Promise.allSettled(images.slice(i, i + SCAN_PARALLEL).map(img => scanTransactions(img.base64)))
      for (const r of batch) {
        if (r.status === 'fulfilled') found.push(...r.value)
        else {
          failed++
          lastError = r.reason?.message || String(r.reason)
        }
      }
      setProgress({ done: Math.min(i + SCAN_PARALLEL, images.length), total: images.length })
    }
    if (failed === images.length) throw new Error(lastError)
    if (failed > 0) {
      Toast.show({ type: 'info', text1: `Не вдалося прочитати ${failed} з ${images.length} зображень`, text2: lastError })
    }
    return found
  }

  const scan = async () => {
    if (images.length === 0) return
    setStep('scanning')
    try {
      const found = await scanAll()
      if (found.length === 0) {
        triggerErrorHaptic()
        Toast.show({ type: 'info', text1: 'Транзакцій не знайдено', text2: 'Спробуйте чіткіше фото або інший скріншот' })
        setStep('pick')
        return
      }
      setRows(
        found.map((t, i) => ({
          ...t,
          key: `scan_${i}`,
          selected: true,
          amountText: String(Math.abs(Number(t.amount) || 0)).replace('.', ','),
        }))
      )
      // A card in the currency of the receipt, if the current one doesn't match
      const cur = found[0]?.currency
      if (cur && card?.currency !== cur) {
        const match = cards.find(c => c.currency === cur)
        if (match) setCardId(match.id)
      }
      triggerSuccessHaptic()
      setStep('review')
    } catch (e: any) {
      triggerErrorHaptic()
      Toast.show({ type: 'error', text1: 'Не вдалося розпізнати', text2: e?.message })
      setStep('pick')
    }
  }

  const update = (key: string, patch: Partial<Row>) => setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)))

  const save = async () => {
    const chosen = rows.filter(r => r.selected)
    if (chosen.length === 0) return
    if (!cardId) {
      Toast.show({ type: 'error', text1: 'Оберіть картку' })
      return
    }
    setSaving(true)
    let saved = 0
    for (const r of chosen) {
      const abs = Math.abs(parseFloat(r.amountText.replace(',', '.')) || 0)
      if (!abs) continue
      try {
        await createTransaction({
          amount: r.type === 'income' ? abs : -abs,
          category: r.category || 'Інше',
          note: [r.merchant, r.note].filter(Boolean).join('\n') || undefined,
          card: card ? `${card.bank || ''} ${card.name}`.trim() : undefined,
          card_id: cardId,
          created_at: dateFromScan(r.date).toISOString(),
          archives: false,
          exclude_from_stats: false,
          is_debt: false,
        })
        saved++
      } catch (e) {
        console.warn('[Scan] save failed:', e)
      }
    }
    setSaving(false)
    if (saved > 0) {
      triggerSuccessHaptic()
      Toast.show({ type: 'success', text1: `Збережено ${saved} ${saved === 1 ? 'транзакцію' : saved < 5 ? 'транзакції' : 'транзакцій'}` })
      onSaved()
      onClose()
    } else {
      triggerErrorHaptic()
      Toast.show({ type: 'error', text1: 'Не вдалося зберегти транзакції' })
    }
  }

  const sortedCards = useMemo(() => [...cards].sort((a, b) => a.name.localeCompare(b.name, 'uk')), [cards])

  return (
    <SheetModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.header}>
        <Text style={styles.title}>{step === 'review' ? 'Знайдені транзакції' : 'Сканування'}</Text>
        <GlassPressable onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </GlassPressable>
      </View>

      {step === 'pick' && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.lead}>
            Фото чека або скріншот з будь-якого банку — GPT знайде на ньому всі транзакції, а ви перевірите їх перед
            збереженням.
          </Text>

          {images.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
              {images.map((img, i) => (
                <View key={img.uri} style={styles.thumbWrap}>
                  <Image source={{ uri: img.uri }} style={styles.thumb} />
                  <Pressable
                    accessibilityLabel="Прибрати зображення"
                    hitSlop={8}
                    onPress={() => setImages(prev => prev.filter((_, j) => j !== i))}
                    style={styles.thumbRemove}
                  >
                    <Icon name="close" size={11} color="#fff" strokeWidth={3} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🧾</Text>
              <Text style={styles.emptyText}>Додайте до {MAX_IMAGES} зображень</Text>
            </View>
          )}

          <View style={styles.btnRow}>
            <GlassButton label="📷 Камера" variant="glass" size="md" style={styles.flex} onPress={() => addImages(true)} />
            <GlassButton label="🖼️ Фото / скріни" variant="glass" size="md" style={styles.flex} onPress={() => addImages(false)} />
          </View>
          <GlassButton
            label={images.length ? `Розпізнати (${images.length})` : 'Розпізнати'}
            variant="primary"
            size="lg"
            disabled={images.length === 0}
            style={styles.full}
            onPress={scan}
          />
        </ScrollView>
      )}

      {step === 'scanning' && (
        <View style={styles.scanning}>
          <ActivityIndicator size="large" color={Colors.orange} />
          <Text style={styles.scanningText}>Шукаємо транзакції…</Text>
          <Text style={styles.scanningSub}>
            {progress.total > 1 ? `Зображення ${Math.min(progress.done + 1, progress.total)} з ${progress.total} · ` : ''}
            зазвичай 10–30 секунд
          </Text>
        </View>
      )}

      {step === 'review' && (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Картка</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {sortedCards.map(c => {
                const active = c.id === cardId
                return (
                  <Pressable key={c.id} onPress={() => setCardId(c.id)} style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={[styles.chipHint, active && styles.chipTextActive]}>{c.currency}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>

            <View style={styles.listHead}>
              <Text style={styles.label}>
                Знайдено {rows.length} · обрано {selectedCount}
              </Text>
              <Pressable
                hitSlop={8}
                onPress={() => setRows(prev => prev.map(r => ({ ...r, selected: selectedCount !== rows.length })))}
              >
                <Text style={styles.link}>{selectedCount === rows.length ? 'Зняти всі' : 'Обрати всі'}</Text>
              </Pressable>
            </View>

            {rows.map(r => {
              const open = expanded === r.key
              const abs = Math.abs(parseFloat(r.amountText.replace(',', '.')) || 0)
              const otherCurrency = card && r.currency && r.currency !== card.currency
              return (
                <View key={r.key} style={[styles.row, !r.selected && styles.rowOff]}>
                  <Pressable style={styles.rowMain} onPress={() => setExpanded(open ? null : r.key)}>
                    <Pressable
                      accessibilityLabel={r.selected ? 'Не зберігати' : 'Зберегти'}
                      hitSlop={8}
                      onPress={() => update(r.key, { selected: !r.selected })}
                      style={[styles.check, r.selected && styles.checkOn]}
                    >
                      {r.selected && <Icon name="check" size={13} color="#fff" strokeWidth={3.2} />}
                    </Pressable>
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {r.merchant}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {[r.category, dateFromScan(r.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })].join(' · ')}
                      </Text>
                    </View>
                    <Text style={[styles.rowAmount, r.type === 'income' && styles.green]}>
                      {r.type === 'income' ? '+' : '−'}
                      {fmtMoney(abs, r.currency)}
                    </Text>
                  </Pressable>

                  {open && (
                    <View style={styles.edit}>
                      <View style={styles.segment}>
                        {(['expense', 'income'] as const).map(t => (
                          <Pressable key={t} onPress={() => update(r.key, { type: t })} style={[styles.segBtn, r.type === t && styles.segBtnOn]}>
                            <Text style={[styles.segText, r.type === t && styles.segTextOn]}>{t === 'expense' ? 'Витрата' : 'Дохід'}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <View style={styles.fieldRow}>
                        <TextInput
                          value={r.amountText}
                          onChangeText={v => update(r.key, { amountText: v.replace(/[^\d.,]/g, '') })}
                          keyboardType="decimal-pad"
                          style={[styles.input, styles.amountInput]}
                          placeholder="0,00"
                          placeholderTextColor={Colors.textMuted}
                          keyboardAppearance="dark"
                        />
                        <Text style={styles.currency}>{r.currency}</Text>
                      </View>
                      {otherCurrency && (
                        <Text style={styles.warn}>
                          Валюта {r.currency}, а картка в {card?.currency} — перевірте суму
                        </Text>
                      )}
                      <TextInput
                        value={r.note}
                        onChangeText={v => update(r.key, { note: v })}
                        style={styles.input}
                        placeholder="Нотатка"
                        placeholderTextColor={Colors.textMuted}
                        keyboardAppearance="dark"
                      />
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
                        {categories.map(c => {
                          const active = c === r.category
                          return (
                            <Pressable key={c} onPress={() => update(r.key, { category: c })} style={[styles.chip, active && styles.chipActive]}>
                              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                            </Pressable>
                          )
                        })}
                      </ScrollView>
                    </View>
                  )}
                </View>
              )
            })}
          </ScrollView>

          <View style={styles.footer}>
            <GlassButton label="Назад" variant="glass" size="md" style={styles.backBtn} onPress={() => setStep('pick')} />
            <GlassButton
              label={selectedCount ? `Зберегти (${selectedCount})` : 'Зберегти'}
              variant="primary"
              size="md"
              loading={saving}
              disabled={selectedCount === 0 || saving}
              style={styles.flex}
              onPress={save}
            />
          </View>
        </>
      )}
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: 'rgba(14, 14, 18, 0.97)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    paddingTop: 8,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.white,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 15,
    color: Colors.white80,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  lead: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.white60,
    paddingHorizontal: 4,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 28,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    gap: 6,
  },
  emptyIcon: {
    fontSize: 34,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.white60,
  },
  thumbs: {
    gap: 10,
    paddingVertical: 4,
  },
  thumbWrap: {
    position: 'relative',
  },
  thumb: {
    width: 96,
    height: 150,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  thumbRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  full: {
    width: '100%',
  },
  scanning: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  scanningText: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.white,
    marginTop: 8,
  },
  scanningSub: {
    fontSize: 13,
    color: Colors.white40,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.white40,
    paddingHorizontal: 4,
  },
  chips: {
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  chipActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.16)',
    borderColor: 'rgba(255, 107, 0, 0.5)',
  },
  chipText: {
    maxWidth: 150,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white80,
  },
  chipHint: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.white40,
  },
  chipTextActive: {
    color: Colors.orangeLight,
  },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  link: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.orangeLight,
    paddingHorizontal: 4,
  },
  row: {
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    overflow: 'hidden',
  },
  rowOff: {
    opacity: 0.45,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: Colors.orange,
    borderColor: Colors.orange,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
  rowMeta: {
    fontSize: 12,
    color: Colors.white40,
    marginTop: 2,
  },
  rowAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
    fontVariant: ['tabular-nums'],
  },
  green: {
    color: Colors.green,
  },
  edit: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 10,
  },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  segBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
  },
  segBtnOn: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  segText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white60,
  },
  segTextOn: {
    color: Colors.white,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  amountInput: {
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  currency: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white60,
    minWidth: 40,
  },
  warn: {
    fontSize: 12,
    color: '#FFD18A',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 34,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  backBtn: {
    width: 100,
  },
})
