import React, { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Colors } from '../constants/theme'
import { TotalsData } from '../api/totals'
import { Bucket, BUCKETS, KIND_META, KIND_OF_BUCKET } from '../utils/accountKind'
import { formatMoney, RatesMap, sumIn } from '../utils/currency'
import { triggerLightHaptic } from '../utils/haptics'

interface BalanceSplitProps {
  totals: TotalsData
  rates: RatesMap | null
  primaryCurrency: string
  hidden?: boolean
  /** A group's line: its accounts and balance chart */
  onPressBucket: (bucket: Bucket) => void
}

/**
 * What the total balance is made of — cards, piggy banks, cash, investments — one short line
 * each, two to a row (the web's «Загальний баланс» has the same lines).
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
  if (!groups.length) return null

  return (
    <View style={styles.wrap}>
      {groups.map(g => (
        <TouchableOpacity
          key={g.key}
          activeOpacity={0.6}
          style={styles.line}
          onPress={() => {
            triggerLightHaptic()
            onPressBucket(g.key)
          }}
        >
          <View style={[styles.dot, { backgroundColor: g.meta.accent[0] }]} />
          <Text style={styles.label} numberOfLines={1}>{g.meta.many}</Text>
          <Text style={[styles.value, g.value < 0 && styles.negative]} numberOfLines={1}>
            {hidden ? '••••' : (g.value < 0 ? '-' : '') + formatMoney(g.value, primaryCurrency, { hideCents: true })}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 18,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  line: { flexBasis: '42%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { flex: 1, fontSize: 12, fontWeight: '500', color: Colors.white60 },
  value: { fontSize: 13, fontWeight: '700', color: Colors.white, fontVariant: ['tabular-nums'] },
  negative: { color: '#FF6B6B' },
})
