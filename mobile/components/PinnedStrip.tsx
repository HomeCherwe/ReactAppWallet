import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Colors } from '../constants/theme'
import { Transaction } from '../api/transactions'
import { Card } from '../api/cards'
import { getCategoryIcon } from '../utils/categoryIcon'
import { txDisplayTitle } from '../utils/pinned'

const CURRENCY_SYMBOLS: Record<string, string> = { UAH: '₴', USD: '$', EUR: '€', GBP: '£', PLN: 'zł' }

function fmtShort(amount: number, currency?: string): string {
  const abs = Math.abs(amount).toLocaleString('uk-UA', {
    minimumFractionDigits: Math.abs(amount) % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return currency ? `${abs} ${CURRENCY_SYMBOLS[currency] ?? currency}` : abs
}

function fmtDay(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  return d.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  })
}

interface PinnedStripProps {
  items: Transaction[]
  cardsById: Record<string, Card>
  hidden?: boolean
  onPress?: (tx: Transaction) => void
  onLongPress?: (tx: Transaction) => void
}

/** Horizontal row of pinned transactions at the top of the transactions block. */
function PinnedStrip({ items, cardsById, hidden, onPress, onLongPress }: PinnedStripProps) {
  if (items.length === 0) return null

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.headerText}>📌 Закріплені</Text>
        <Text style={styles.count}>{items.length}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        decelerationRate="fast"
      >
        {items.map(tx => {
          const amount = Number(tx.amount)
          const isIncome = amount > 0
          const card = tx.card_id ? cardsById[tx.card_id] : undefined
          const currency = tx.currency || card?.currency
          return (
            <Pressable
              key={tx.id}
              onPress={() => onPress?.(tx)}
              onLongPress={() => onLongPress?.(tx)}
              delayLongPress={350}
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
            >
              <View style={styles.tileTop}>
                <View style={[styles.icon, isIncome && styles.iconIncome]}>
                  <Text style={styles.iconEmoji}>{getCategoryIcon(tx.category ?? null, amount)}</Text>
                </View>
                <Text style={styles.day}>{fmtDay(tx.created_at)}</Text>
              </View>
              <Text style={styles.title} numberOfLines={1}>{txDisplayTitle(tx)}</Text>
              <Text style={[styles.amount, isIncome && styles.amountIncome]} numberOfLines={1}>
                {hidden ? '••••' : `${isIncome ? '+' : '−'}${fmtShort(amount, currency)}`}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

export default React.memo(PinnedStrip)

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white60,
  },
  count: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.orange,
    backgroundColor: 'rgba(255, 107, 0, 0.14)',
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 16,
    gap: 10,
  },
  tile: {
    width: 148,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 107, 0, 0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 107, 0, 0.35)',
  },
  tilePressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 107, 0, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconIncome: {
    backgroundColor: 'rgba(34, 197, 94, 0.14)',
  },
  iconEmoji: {
    fontSize: 16,
  },
  day: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
  },
  amount: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.white,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  amountIncome: {
    color: Colors.green,
  },
})
