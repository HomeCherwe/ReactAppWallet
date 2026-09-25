import React, { useRef } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import { Colors } from '../constants/theme'
import { Card } from '../api/cards'
import { formatMoney } from '../utils/currency'
import { triggerLightHaptic } from '../utils/haptics'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'

interface CardSettingsModalProps {
  /** Card to configure; null closes the sheet */
  card: Card | null
  balance?: number
  excluded: boolean
  onToggleExcluded: (card: Card, excluded: boolean) => void
  onClose: () => void
}

export default function CardSettingsModal({
  card,
  balance,
  excluded,
  onToggleExcluded,
  onClose,
}: CardSettingsModalProps) {
  // Keep showing the last card while the sheet slides out
  const lastCard = useRef<Card | null>(null)
  if (card) lastCard.current = card
  const c = card ?? lastCard.current

  const bankExcluded = !!c?.bank_exclude_from_stats
  const amount = balance ?? Number(c?.initial_balance ?? 0)

  return (
    <SheetModal visible={!!card} onClose={onClose} sheetStyle={styles.sheet}>

      <View style={styles.header}>
        <Text style={styles.title}>Налаштування картки</Text>
        <GlassPressable onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </GlassPressable>
      </View>

      {c && (
        <View style={styles.body}>
          <View style={styles.summary}>
            <Text style={styles.bank}>{(c.bank || 'Картка').toUpperCase()} · {c.currency}</Text>
            <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
            <Text style={styles.balance}>
              {(amount < 0 ? '-' : '') + formatMoney(amount, c.currency)}
            </Text>
          </View>

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
        </View>
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
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
    marginTop: 4,
  },
  balance: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.white,
    marginTop: 8,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
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
})
