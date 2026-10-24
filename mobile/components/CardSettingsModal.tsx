import React, { useEffect, useRef, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { Colors } from '../constants/theme'
import { Card, updateCard } from '../api/cards'
import { formatMoney } from '../utils/currency'
import { triggerLightHaptic } from '../utils/haptics'
import { AccountKind, accountKind, goalProgress, isEmptyBalance, KIND_META, parseGoal } from '../utils/accountKind'
import { GlassPressable } from './LiquidGlass'
import KindPicker from './KindPicker'
import SheetModal from './SheetModal'

interface CardSettingsModalProps {
  /** Card to configure; null closes the sheet */
  card: Card | null
  balance?: number
  excluded: boolean
  onToggleExcluded: (card: Card, excluded: boolean) => void
  /** Name, kind, goal or archive saved: the card as it is now */
  onUpdated?: (card: Card) => void
  onClose: () => void
}

/**
 * «Налаштування рахунку» (same as the web's account settings): the name, what the account is for,
 * a piggy bank's goal, statistics and the archive. Every change is saved right away.
 */
export default function CardSettingsModal({
  card,
  balance,
  excluded,
  onToggleExcluded,
  onUpdated,
  onClose,
}: CardSettingsModalProps) {
  // Keep showing the last card while the sheet slides out
  const lastCard = useRef<Card | null>(null)
  if (card) lastCard.current = card
  const c = card ?? lastCard.current

  const [name, setName] = useState('')
  const [kind, setKind] = useState<AccountKind>('card')
  const [goal, setGoal] = useState('')
  const [archived, setArchived] = useState(false)

  useEffect(() => {
    if (!card) return
    setName(card.name || '')
    setKind(accountKind(card))
    setGoal(card.goal_amount ? String(card.goal_amount) : '')
    setArchived(!!card.archived)
  }, [card?.id])

  const bankExcluded = !!c?.bank_exclude_from_stats
  const amount = balance ?? Number(c?.initial_balance ?? 0)
  const canArchive = isEmptyBalance(amount)
  const progress = kind === 'savings' && c ? goalProgress({ goal_amount: parseGoal(goal) }, amount) : null

  // Saves one change; on failure the switch / field goes back
  const save = async (patch: Partial<Card>, undo: () => void) => {
    if (!c) return
    try {
      await updateCard(c.id, patch)
      onUpdated?.({ ...c, ...patch })
    } catch (e: any) {
      undo()
      Alert.alert('Не вдалося зберегти', e?.message || 'Спробуйте ще раз')
    }
  }

  const saveName = () => {
    const next = name.trim()
    if (!c || !next || next === c.name) {
      if (c && !next) setName(c.name)
      return
    }
    save({ name: next }, () => setName(c.name))
  }

  const saveKind = (next: AccountKind) => {
    if (!c || next === kind) return
    triggerLightHaptic()
    const prev = kind
    setKind(next)
    save({ kind: next, ...(next !== 'savings' && c.goal_amount ? { goal_amount: null } : {}) }, () => setKind(prev))
  }

  const saveGoal = () => {
    if (!c) return
    const next = parseGoal(goal)
    const prev = c.goal_amount ? Number(c.goal_amount) : null
    setGoal(next ? String(next) : '')
    if (next === prev) return
    save({ goal_amount: next }, () => setGoal(prev ? String(prev) : ''))
  }

  const saveArchived = (value: boolean) => {
    if (!c) return
    triggerLightHaptic()
    setArchived(value)
    save({ archived: value }, () => setArchived(!value))
  }

  return (
    <SheetModal visible={!!card} onClose={onClose} sheetStyle={styles.sheet}>

      <View style={styles.header}>
        <Text style={styles.title}>Налаштування рахунку</Text>
        <GlassPressable onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </GlassPressable>
      </View>

      {c && (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.summary}>
            <Text style={styles.bank}>
              {KIND_META[kind].icon} {(c.bank || 'Рахунок').toUpperCase()} · {c.currency}
            </Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              onEndEditing={saveName}
              onSubmitEditing={saveName}
              returnKeyType="done"
              placeholder="Назва"
              placeholderTextColor="rgba(255,255,255,0.35)"
              maxLength={50}
            />
            <Text style={styles.balance}>
              {(amount < 0 ? '-' : '') + formatMoney(amount, c.currency)}
            </Text>
          </View>

          <Text style={styles.sectionLabel}>ТИП РАХУНКУ</Text>
          <KindPicker value={kind} onChange={saveKind} />

          {kind === 'savings' && (
            <View style={styles.settingBlock}>
              <Text style={styles.settingTitle}>Ціль</Text>
              <Text style={styles.settingDesc}>Скільки хочете зібрати — покажемо, яку частину вже відкладено. Не обов'язково.</Text>
              <View style={styles.goalRow}>
                <TextInput
                  style={styles.goalInput}
                  value={goal}
                  onChangeText={setGoal}
                  onEndEditing={saveGoal}
                  onSubmitEditing={saveGoal}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  placeholder="напр. 10 000"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                />
                <Text style={styles.goalCurrency}>{c.currency}</Text>
              </View>
              {progress != null && (
                <View style={styles.progressRow}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{progress >= 1 ? '✓ зібрано' : `${Math.floor(progress * 100)}%`}</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.settingRow}>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Виключити зі статистики</Text>
              <Text style={styles.settingDesc}>
                Транзакції цієї картки зникнуть зі списку транзакцій, статистики місяця та аналітики,
                а сама картка — з вибору при створенні транзакції. Баланс картки не змінюється.
              </Text>
              {bankExcluded && (
                <Text style={styles.bankNote}>Увесь банк виключено у веб-версії</Text>
              )}
            </View>
            <Switch
              value={excluded}
              disabled={bankExcluded}
              onValueChange={v => {
                triggerLightHaptic()
                onToggleExcluded(c, v)
              }}
              trackColor={{ false: 'rgba(255,255,255,0.15)', true: Colors.orange }}
              ios_backgroundColor="rgba(255,255,255,0.15)"
            />
          </View>

          <View style={[styles.settingRow, !canArchive && !archived && styles.dimmed]}>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Сховати в архів</Text>
              <Text style={styles.settingDesc}>
                {canArchive || archived
                  ? 'Рахунок зникне зі списків і з вибору рахунку, історія залишиться. Повернути — «Рахунки» → Архів.'
                  : 'В архів можна сховати лише порожній рахунок — спершу переведіть залишок.'}
              </Text>
            </View>
            <Switch
              value={archived}
              disabled={!canArchive && !archived}
              onValueChange={saveArchived}
              trackColor={{ false: 'rgba(255,255,255,0.15)', true: Colors.orange }}
              ios_backgroundColor="rgba(255,255,255,0.15)"
            />
          </View>
        </ScrollView>
      )}
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    paddingTop: 8,
    maxHeight: '90%',
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 12,
  },
  summary: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  bank: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.orange,
    letterSpacing: 0.5,
  },
  nameInput: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
    marginTop: 4,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.18)',
  },
  balance: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.white,
    marginTop: 8,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.45)',
    letterSpacing: 1,
    marginTop: 4,
    marginLeft: 4,
  },
  settingBlock: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  dimmed: { opacity: 0.6 },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
  settingDesc: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.textSub,
    marginTop: 4,
  },
  bankNote: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.orange,
    marginTop: 6,
  },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  goalInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  goalCurrency: { fontSize: 14, fontWeight: '700', color: Colors.textSub, minWidth: 40 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: KIND_META.savings.accent[0] },
  progressText: { fontSize: 12, fontWeight: '700', color: Colors.textSub, fontVariant: ['tabular-nums'] },
})
