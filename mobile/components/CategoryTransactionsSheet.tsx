import React, { useMemo, useRef, useState } from 'react'
import { SectionList, StyleSheet, Text, View } from 'react-native'
import { Colors } from '../constants/theme'
import { Card } from '../api/cards'
import { Transaction } from '../api/transactions'
import { formatMoney } from '../utils/currency'
import { getCategoryIcon } from '../utils/categoryIcon'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'
import TxRow from './TxRow'
import TxSheet from './TxSheet'

export interface CategoryView {
  category: string
  kind: 'expense' | 'income'
  /** In the main currency */
  total: number
  currency: string
  periodLabel: string
  transactions: Transaction[]
}

interface Props {
  view: CategoryView | null
  cards: Card[]
  hidden?: boolean
  onClose: () => void
  /** A transaction was edited here: the screen reloads */
  onChanged: () => void
}

function dayTitle(d: Date) {
  return d.toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'long' })
}

/** Tap on a category in Analytics: its transactions for the period; tap one to edit it. */
export default function CategoryTransactionsSheet({ view, cards, hidden, onClose, onChanged }: Props) {
  const last = useRef<CategoryView | null>(null)
  if (view) last.current = view
  const v = view ?? last.current
  const [openTx, setOpenTx] = useState<Transaction | null>(null)

  const cardsById = useMemo(() => Object.fromEntries(cards.map(c => [c.id, c])), [cards])
  const sections = useMemo(() => {
    const out: { key: string; title: string; data: Transaction[] }[] = []
    for (const t of v?.transactions ?? []) {
      const d = new Date(t.created_at)
      const key = d.toDateString()
      let s = out[out.length - 1]
      if (!s || s.key !== key) {
        s = { key, title: dayTitle(d), data: [] }
        out.push(s)
      }
      s.data.push(t)
    }
    return out
  }, [v?.transactions])

  if (!v) return null
  const isIncome = v.kind === 'income'

  return (
    <SheetModal visible={!!view} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.header}>
        <View style={[styles.icon, isIncome && styles.iconIncome]}>
          <Text style={styles.iconText}>{getCategoryIcon(v.category, isIncome ? 1 : -1)}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>{v.category}</Text>
          <Text style={styles.sub}>
            {isIncome ? 'Доходи' : 'Витрати'} · {v.periodLabel} · {v.transactions.length}
          </Text>
        </View>
        <GlassPressable onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </GlassPressable>
      </View>

      <Text style={[styles.total, { color: isIncome ? Colors.green : '#FF6B6B' }]}>
        {hidden ? '••••' : `${isIncome ? '+' : '−'}${formatMoney(v.total, v.currency)}`}
      </Text>

      <SectionList
        sections={sections}
        keyExtractor={t => t.id}
        style={styles.list}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <TxRow
            tx={item}
            card={item.card_id ? cardsById[item.card_id] : undefined}
            hidden={hidden}
            swipeEnabled={false}
            last={index === section.data.length - 1}
            onPress={setOpenTx}
          />
        )}
        ListFooterComponent={<View style={{ height: 40 }} />}
      />

      {/* Inside this sheet, so iOS can show it on top of it */}
      <TxSheet
        tx={openTx}
        cards={cards}
        hidden={hidden}
        onClose={() => setOpenTx(null)}
        onSaved={() => {
          setOpenTx(null)
          onChanged()
        }}
      />
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
    height: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 107, 0, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconIncome: {
    backgroundColor: 'rgba(34, 197, 94, 0.14)',
  },
  iconText: {
    fontSize: 22,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.white,
  },
  sub: {
    fontSize: 13,
    color: Colors.white40,
    marginTop: 2,
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
  total: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 8,
    fontVariant: ['tabular-nums'],
  },
  list: {
    flex: 1,
  },
  dayHeader: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: 'rgba(14, 14, 18, 0.97)',
  },
  dayTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white40,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
})
