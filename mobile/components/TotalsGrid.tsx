import React, { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Colors, Radius, Typography } from '../constants/theme'
import { TotalsData } from '../api/totals'
import { fmtAmount } from '../utils/format'

interface TotalsGridProps {
  totals: TotalsData
  bucketTab: 'all' | 'cards' | 'savings' | 'cash'
  hidden?: boolean
}

const ORDER = ['UAH', 'EUR', 'USD', 'PLN', 'GBP', 'CHF', 'CZK', 'HUF']

export default function TotalsGrid({ totals, bucketTab, hidden = false }: TotalsGridProps) {
  const currencyRows = useMemo(() => {
    let source: Record<string, number> = {}

    if (bucketTab === 'all') {
      const allBuckets = [totals.cash, totals.cards, totals.savings]
      for (const b of allBuckets) {
        for (const [cur, amt] of Object.entries(b || {})) {
          source[cur] = (source[cur] || 0) + amt
        }
      }
    } else {
      source = (totals[bucketTab] || {}) as Record<string, number>
    }

    const entries = Object.entries(source).filter(([, v]) => v != null && v !== 0)
    const ordered: [string, number][] = []
    const rest: [string, number][] = []

    for (const item of entries) {
      if (ORDER.includes(item[0])) ordered.push(item)
      else rest.push(item)
    }

    ordered.sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]))
    rest.sort((a, b) => a[0].localeCompare(b[0]))

    return [...ordered, ...rest]
  }, [totals, bucketTab])

  if (!currencyRows.length) {
    return null
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>
        {bucketTab === 'all'
          ? 'Залишки по валютах'
          : bucketTab === 'cards'
          ? 'Карткові залишки'
          : bucketTab === 'savings'
          ? 'Заощадження'
          : 'Готівкові кошти'}
      </Text>

      <View style={styles.grid}>
        {currencyRows.map(([code, val]) => {
          const isNegative = val < 0
          return (
            <View key={code} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.codeBadge}>{code}</Text>
                <Text style={[styles.val, isNegative ? styles.textRed : styles.textGreen]}>
                  {hidden ? '••••••' : fmtAmount(Math.abs(val), code)}
                </Text>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  sectionTitle: {
    ...Typography.caption,
    color: 'rgba(255, 107, 0, 0.85)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  card: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  codeBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.white80,
  },
  val: {
    fontSize: 15,
    fontWeight: '700',
  },
  textGreen: { color: Colors.green },
  textRed: { color: Colors.red },
})