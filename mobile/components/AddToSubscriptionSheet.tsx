import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { Colors } from '../constants/theme'
import { Card } from '../api/cards'
import { Transaction } from '../api/transactions'
import {
  DetectedSubscription,
  isBankSubscription,
  linkToSubscription,
  listSubscriptions,
  subscriptionFromTransaction,
} from '../api/insights'
import { formatMoney } from '../utils/currency'
import { triggerLightHaptic, triggerSuccessHaptic } from '../utils/haptics'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'

type Frequency = DetectedSubscription['frequency']

const FREQS: { key: Frequency; label: string }[] = [
  { key: 'weekly', label: 'Щотижня' },
  { key: 'monthly', label: 'Щомісяця' },
  { key: 'yearly', label: 'Щороку' },
]
const FREQ_TEXT: Record<Frequency, string> = { weekly: 'щотижня', monthly: 'щомісяця', yearly: 'щороку' }

/** What the bank called the charge: "NETFLIX.COM | Конвертовано…" → "Netflix.com" */
function chargeName(tx: Transaction | null) {
  const raw = String(tx?.merchant_name || '').trim() || String(tx?.note || '').split('|')[0].split('\n')[0].trim()
  const s = raw.slice(0, 40)
  return s && s === s.toUpperCase() ? s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()) : s
}

interface Props {
  /** The charge; null closes the sheet */
  tx: Transaction | null
  cards: Card[]
  onClose: () => void
}

/**
 * «Додати в підписку» (a transaction's long press; the web's right click has the same): the charge
 * goes into one of the subscriptions — for when the bank names it differently and it wasn't found
 * as part of it — or a new subscription starts from it.
 */
export default function AddToSubscriptionSheet({ tx, cards, onClose }: Props) {
  // Keep showing the last charge while the sheet slides out
  const lastTx = useRef<Transaction | null>(null)
  if (tx) lastTx.current = tx
  const t = tx ?? lastTx.current

  const [subs, setSubs] = useState<DetectedSubscription[] | null>(null)
  const [name, setName] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!tx) return
    setSubs(null)
    setName(chargeName(tx))
    setFrequency('monthly')
    setBusy(null)
    listSubscriptions().then(list => setSubs(list || [])).catch(() => setSubs([]))
  }, [tx?.id])

  const currencyOf = (cardId?: string | null) => String(cards.find(c => c.id === cardId)?.currency || 'UAH').toUpperCase()
  const amount = Math.abs(Number(t?.amount || 0))
  const txCurrency = String(t?.currency || currencyOf(t?.card_id)).toUpperCase()
  const current = (subs || []).find(s => s.id === t?.subscription_id)

  // Bank subscriptions; about this charge's price first, then the active ones
  const options = useMemo(() => {
    const near = (s: DetectedSubscription) => Number(s.amount) > 0 && Math.abs(Number(s.amount) - amount) <= Number(s.amount) * 0.3
    return (subs || [])
      .filter(s => isBankSubscription(s) && !s.hidden && s.id !== t?.subscription_id)
      .map(s => ({ ...s, near: near(s) }))
      .sort((a, b) => Number(b.near) - Number(a.near) || Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name, 'uk'))
  }, [subs, amount, t?.subscription_id])

  const done = (message: string) => {
    triggerSuccessHaptic()
    Toast.show({ type: 'success', text1: message })
    onClose()
  }

  const link = async (sub: DetectedSubscription | null) => {
    if (!t || busy) return
    triggerLightHaptic()
    setBusy(sub?.id || 'unlink')
    try {
      await linkToSubscription(t.id, sub?.id || null)
      done(sub ? `Додано до «${sub.name}»` : 'Прибрано з підписки')
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Не вдалося', text2: e?.message })
      setBusy(null)
    }
  }

  const create = async () => {
    const clean = name.trim()
    if (!t || !clean || busy) return
    triggerLightHaptic()
    setBusy('new')
    try {
      const sub = await subscriptionFromTransaction(t.id, { name: clean, frequency })
      done(`Нова підписка «${sub?.name || clean}»`)
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Не вдалося', text2: e?.message })
      setBusy(null)
    }
  }

  return (
    <SheetModal visible={!!tx} onClose={busy ? () => {} : onClose} sheetStyle={styles.sheet}>
      <View style={styles.header}>
        <Text style={styles.title}>{t?.subscription_id ? 'Підписка' : 'Додати в підписку'}</Text>
        <GlassPressable onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </GlassPressable>
      </View>

      {t && (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* The charge */}
          <View style={styles.charge}>
            <View style={styles.flex}>
              <Text style={styles.chargeName} numberOfLines={1}>{chargeName(t) || t.category || 'Списання'}</Text>
              <Text style={styles.sub}>
                {new Date(t.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
            <Text style={styles.chargeAmount}>−{formatMoney(amount, txCurrency)}</Text>
          </View>

          {current && (
            <View style={styles.current}>
              <Text style={[styles.flex, styles.currentText]} numberOfLines={1}>
                Зараз у <Text style={styles.bold}>«{current.name}»</Text>
              </Text>
              <Pressable onPress={() => link(null)} disabled={!!busy} hitSlop={8}>
                <Text style={styles.removeText}>{busy === 'unlink' ? 'Прибираю…' : 'Прибрати'}</Text>
              </Pressable>
            </View>
          )}

          {/* Into one of the subscriptions */}
          <Text style={styles.section}>{current ? 'ПЕРЕНЕСТИ В ІНШУ' : 'ДО ПІДПИСКИ'}</Text>
          <View style={styles.list}>
            {subs == null ? (
              <ActivityIndicator color={Colors.orange} style={{ paddingVertical: 14 }} />
            ) : options.length === 0 ? (
              <Text style={styles.empty}>Поки що жодної підписки</Text>
            ) : (
              options.map((s, i) => (
                <Pressable
                  key={s.id}
                  onPress={() => link(s)}
                  disabled={!!busy}
                  style={({ pressed }) => [styles.option, i < options.length - 1 && styles.optionBorder, pressed && styles.pressed]}
                >
                  <View style={styles.flex}>
                    <Text style={styles.optionName} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {formatMoney(Number(s.amount), String(s.currency || currencyOf(s.card_id)).toUpperCase())} · {FREQ_TEXT[s.frequency]}
                      {s.near ? ' · схожа сума' : ''}
                      {!s.is_active ? ' · не списується' : ''}
                    </Text>
                  </View>
                  {busy === s.id ? <ActivityIndicator color={Colors.orange} /> : <Text style={styles.chevron}>›</Text>}
                </Pressable>
              ))
            )}
          </View>
          <Text style={styles.hint}>Наступні списання з такою назвою і схожою сумою додаватимуться до неї самі.</Text>

          {/* Or a new one from this charge */}
          {!current && (
            <>
              <Text style={styles.section}>АБО НОВА ПІДПИСКА</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                maxLength={60}
                placeholder="Назва, наприклад Netflix"
                placeholderTextColor="rgba(255,255,255,0.35)"
                returnKeyType="done"
              />
              <View style={styles.freqs}>
                {FREQS.map(f => {
                  const on = frequency === f.key
                  return (
                    <Pressable
                      key={f.key}
                      onPress={() => {
                        triggerLightHaptic()
                        setFrequency(f.key)
                      }}
                      style={[styles.freq, on && styles.freqOn]}
                    >
                      <Text style={[styles.freqText, on && styles.freqTextOn]}>{f.label}</Text>
                    </Pressable>
                  )
                })}
              </View>
              <Pressable
                onPress={create}
                disabled={!!busy || !name.trim()}
                style={({ pressed }) => [styles.createBtn, (!!busy || !name.trim()) && styles.disabled, pressed && styles.pressed]}
              >
                <Text style={styles.createText}>{busy === 'new' ? 'Створюю…' : 'Створити підписку'}</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      )}
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden', paddingTop: 8, maxHeight: '90%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 6 },
  title: { fontSize: 20, fontWeight: '800', color: Colors.white, letterSpacing: -0.3 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: Colors.white80, fontSize: 15, fontWeight: '700' },
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  flex: { flex: 1, minWidth: 0 },
  charge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  chargeName: { fontSize: 15, fontWeight: '700', color: Colors.white },
  chargeAmount: { fontSize: 15, fontWeight: '800', color: Colors.white, fontVariant: ['tabular-nums'] },
  sub: { fontSize: 12, color: Colors.white40, marginTop: 2, fontVariant: ['tabular-nums'] },
  current: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: 'rgba(255,107,0,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,107,0,0.35)',
  },
  currentText: { fontSize: 14, color: Colors.white60 },
  bold: { fontWeight: '700', color: Colors.white },
  removeText: { fontSize: 14, fontWeight: '700', color: '#FF8A8A' },
  section: { fontSize: 12, fontWeight: '700', color: Colors.white40, letterSpacing: 1, marginTop: 18, marginBottom: 8, marginLeft: 4 },
  list: { borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 14 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  optionBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  optionName: { fontSize: 15, fontWeight: '600', color: Colors.white },
  chevron: { fontSize: 20, color: Colors.white40 },
  empty: { fontSize: 14, color: Colors.white40, paddingVertical: 12 },
  hint: { fontSize: 12, color: Colors.white40, marginTop: 8, marginHorizontal: 4, lineHeight: 17 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: Colors.white,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  freqs: { flexDirection: 'row', gap: 6, marginTop: 8 },
  freq: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  freqOn: { backgroundColor: 'rgba(255,107,0,0.15)', borderColor: 'rgba(255,107,0,0.5)' },
  freqText: { fontSize: 13, fontWeight: '600', color: Colors.white60 },
  freqTextOn: { color: Colors.white },
  createBtn: { marginTop: 12, height: 46, borderRadius: 14, backgroundColor: Colors.orange, alignItems: 'center', justifyContent: 'center' },
  createText: { fontSize: 15, fontWeight: '800', color: Colors.white },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
})
