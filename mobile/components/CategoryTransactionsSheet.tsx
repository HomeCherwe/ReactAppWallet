import React, { useCallback, useMemo, useRef, useState } from 'react'
import { SectionList, StyleSheet, Text, View } from 'react-native'
import { Colors } from '../constants/theme'
import { Card } from '../api/cards'
import { Transaction } from '../api/transactions'
import { formatMoney } from '../utils/currency'
import { getCategoryIcon } from '../utils/categoryIcon'
import { GlassPressable } from './LiquidGlass'
import SheetModal from './SheetModal'
import TxRow, { closeSwipedRow } from './TxRow'
import MenuOverlayHost from './MenuOverlayHost'
import RefundPickBar from './RefundPickBar'
import { TxChange, useTxActions } from '../hooks/useTxActions'
import { useRefundPick } from '../hooks/useRefundPick'
import { txMenuActions } from '../utils/txMenu'
import { MenuFrame, openMenu as openMenuOverlay } from '../store/useMenuOverlay'
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
  // Deleted or archived here: they leave the list at once; Analytics reloads when the sheet closes
  const [removed, setRemoved] = useState<Set<string>>(() => new Set())
  const dirty = useRef(false)
  const lastViewKey = useRef<CategoryView | null>(null)
  if (view && view !== lastViewKey.current) {
    lastViewKey.current = view
    dirty.current = false
    if (removed.size) setRemoved(new Set())
  }

  // Long press and swipe: the same actions as on Home
  const handleChange = useCallback(
    (change: TxChange, tx?: Transaction) => {
      if (change === 'deleted' && tx) {
        setRemoved(prev => new Set(prev).add(tx.id))
        dirty.current = true
      } else {
        // Split, transfer, refund…: the numbers change, Analytics reloads (like after an edit)
        onChanged()
      }
    },
    [onChanged]
  )
  const actions = useTxActions({ cards, hidden, onChanged: handleChange })
  const refund = useRefundPick({
    refundFor: actions.refundFor,
    onRefundForChange: actions.setRefundFor,
    onLinkRefund: actions.handlers.onLinkRefund,
    onUnlinkRefund: actions.handlers.onUnlinkRefund,
  })
  const close = () => {
    actions.setRefundFor(null)
    if (dirty.current) {
      dirty.current = false
      onChanged()
    } else onClose()
  }

  const cardsById = useMemo(() => Object.fromEntries(cards.map(c => [c.id, c])), [cards])
  const sections = useMemo(() => {
    const out: { key: string; title: string; data: Transaction[] }[] = []
    for (const t of v?.transactions ?? []) {
      if (removed.has(t.id)) continue
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
  }, [v?.transactions, removed])

  if (!v) return null
  const isIncome = v.kind === 'income'
  const shownCount = v.transactions.filter(t => !removed.has(t.id)).length

  const openMenu = (tx: Transaction, frame: MenuFrame) => {
    closeSwipedRow()
    openMenuOverlay({
      frame,
      actions: txMenuActions(tx, {
        ...actions.handlers,
        onPressTx: setOpenTx,
        onStartRefund: refund.startRefund,
        canLinkRefund: true,
        canUnlinkRefund: true,
      }),
      previewStyle: styles.menuPreview,
      preview: <TxRow tx={tx} card={tx.card_id ? cardsById[tx.card_id] : undefined} hidden={hidden} last swipeEnabled={false} />,
    })
  }

  return (
    <SheetModal visible={!!view} onClose={close} sheetStyle={styles.sheet} overlay={<MenuOverlayHost />}>
      <View style={styles.header}>
        <View style={[styles.icon, isIncome && styles.iconIncome]}>
          <Text style={styles.iconText}>{getCategoryIcon(v.category, isIncome ? 1 : -1)}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>{v.category}</Text>
          <Text style={styles.sub}>
            {isIncome ? 'Доходи' : 'Витрати'} · {v.periodLabel} · {shownCount}
          </Text>
        </View>
        <GlassPressable onPress={close} style={styles.closeBtn}>
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
            last={index === section.data.length - 1}
            mode={refund.modeFor(item)}
            wiggle={refund.wiggle}
            wiggleDir={index % 2 ? 1 : -1}
            onPress={tx => (actions.refundFor ? refund.pickRefund(tx) : setOpenTx(tx))}
            onLongPress={openMenu}
            onRefund={refund.startRefund}
            onDelete={actions.handlers.onDeleteTx}
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
        onDeleted={deleted => handleChange('deleted', deleted)}
      />
      {actions.sheets}
      <RefundPickBar expense={actions.refundFor} currency={v.currency} hidden={hidden} onCancel={refund.cancelRefundPick} />
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  menuPreview: {
    backgroundColor: '#141416',
  },
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
