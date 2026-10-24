import React, { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Colors } from '../constants/theme'
import { TotalsData } from '../api/totals'
import { Bucket, BUCKETS, KIND_META, KIND_OF_BUCKET } from '../utils/accountKind'
import { formatBreakdown, formatMoney, RatesMap, sumIn } from '../utils/currency'
import { triggerLightHaptic } from '../utils/haptics'

interface BalanceSplitProps {
  totals: TotalsData
  rates: RatesMap | null
  primaryCurrency: string
  hidden?: boolean
  /** A group's row: its balance history */
  onPressBucket: (bucket: Bucket) => void
}

/**
 * What the total balance is made of — cards, piggy banks, cash, investments — each in the main
 * currency and in the currencies it is in (the web's «Загальний баланс» shows the same rows).
 */
export default function BalanceSplit({ totals, rates, primaryCurrency, hidden, onPressBucket }: BalanceSplitProps) {
  const groups = useMemo(
    () =>
      BUCKETS.map(key => ({
        key,
        meta: KIND_META[KIND_OF_BUCKET[key]],
        totals: totals[key] || {},
        value: sumIn(totals[key], primaryCurrency, rates),
      })).filter(g => Object.values(g.totals).some(v => Math.abs(v) >= 0.005)),
    [totals, primaryCurrency, rates]
  )
  const positive = groups.reduce((s, g) => s + Math.max(0, g.value), 0)
  if (!groups.length) return null

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {groups
          .filter(g => g.value > 0)
          .map(g => (
            <LinearGradient
              key={g.key}
              colors={g.meta.accent}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.barPart, { flex: g.value / positive }]}
            />
          ))}
      </View>

      {groups.map(g => (
        <TouchableOpacity
          key={g.key}
          activeOpacity={0.7}
          style={styles.row}
          onPress={() => {
            triggerLightHaptic()
            onPressBucket(g.key)
          }}
        >
          <View style={[styles.dot, { backgroundColor: g.meta.accent[0] }]} />
          <View style={styles.texts}>
            <Text style={styles.label}>
              {g.meta.icon} {g.meta.many}
            </Text>
            {/* In the currencies it is in, when that's not just the main one */}
            {!hidden && Object.keys(g.totals).some(c => c !== primaryCurrency) && (
              <Text style={styles.breakdown} numberOfLines={1}>
                {formatBreakdown(g.totals)}
              </Text>
            )}
          </View>
          <View style={styles.right}>
            <Text style={[styles.value, g.value < 0 && styles.negative]} numberOfLines={1}>
              {hidden ? '••••' : (g.value < 0 ? '-' : '') + formatMoney(g.value, primaryCurrency, { hideCents: true })}
            </Text>
            {positive > 0 && g.value > 0 && <Text style={styles.share}>{Math.round((g.value / positive) * 100)}%</Text>}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  bar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 8,
  },
  barPart: { height: '100%', borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  texts: { flex: 1, minWidth: 0 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.white80 },
  breakdown: { fontSize: 11, color: Colors.textSub, marginTop: 1, fontVariant: ['tabular-nums'] },
  right: { alignItems: 'flex-end' },
  value: { fontSize: 14, fontWeight: '700', color: Colors.white, fontVariant: ['tabular-nums'] },
  negative: { color: '#FF6B6B' },
  share: { fontSize: 10, fontWeight: '600', color: Colors.textMuted, fontVariant: ['tabular-nums'] },
})
