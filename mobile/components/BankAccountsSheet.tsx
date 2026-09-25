import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Colors } from '../constants/theme'
import { BankConnection } from '../api/bankConnections'
import { Card } from '../api/cards'
import SheetModal from './SheetModal'
import { GlassPressable } from './LiquidGlass'
import BankLogo from './BankLogo'
import { fmtMoney } from './TxRow'

interface Props {
  connection: BankConnection | null
  status: { text: string; color: string } | null
  cardsById: Record<string, Card>
  balances: Record<string, number>
  busy?: boolean
  onClose: () => void
  onSync: (c: BankConnection) => void
  onReconnect: (c: BankConnection) => void
  onDisconnect: (c: BankConnection) => void
  /** Tap on an account that has a card: its transactions */
  onOpenCard?: (card: Card) => void
  /** All the user's cards, to link an account without a card to one of them */
  cards?: Card[]
  onLinkCard?: (c: BankConnection, accountId: string, card: Card) => Promise<void>
}

type BankAccount = BankConnection['accounts'][number]

/** Tap on a connected bank: which accounts it brings in, their cards and balances. */
export default function BankAccountsSheet({
  connection,
  status,
  cardsById,
  balances,
  busy,
  onClose,
  onSync,
  onReconnect,
  onDisconnect,
  onOpenCard,
  cards = [],
  onLinkCard,
}: Props) {
  // Account being linked to an existing card (the sheet shows the card picker)
  const [linking, setLinking] = useState<BankAccount | null>(null)
  const [linkBusy, setLinkBusy] = useState<string | null>(null)
  useEffect(() => {
    if (!connection) setLinking(null)
  }, [connection])

  // Keep showing the last bank while the sheet slides out
  const last = useRef<{ c: BankConnection; s: { text: string; color: string } } | null>(null)
  if (connection && status) last.current = { c: connection, s: status }
  if (!last.current) return null
  const { c, s } = last.current

  const expired = c.status === 'expired'
  const accountLabel = (a: BankAccount) => a.display_name || (a.kind === 'card' ? 'Картка' : 'Рахунок')

  const pickCard = (a: BankAccount, card: Card) => {
    Alert.alert(
      `Прив’язати до «${card.name}»?`,
      `Транзакції рахунку «${accountLabel(a)}» підтягуватимуться в цю картку. Якщо ви вже вносили їх вручну, можуть з’явитися дублікати.`,
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Прив’язати',
          onPress: async () => {
            setLinkBusy(card.id)
            try {
              await onLinkCard?.(c, a.account_id, card)
              setLinking(null)
            } catch {
              // the toast already explains it; stay on the picker
            } finally {
              setLinkBusy(null)
            }
          },
        },
      ]
    )
  }

  if (linking) {
    // Cards of this bank's other accounts can't take a second one; same currency first
    const takenIds = new Set(c.accounts.map(a => a.card_id).filter(Boolean) as string[])
    const options = cards
      .filter(card => !takenIds.has(card.id))
      .sort(
        (x, y) =>
          Number(y.currency === linking.currency) - Number(x.currency === linking.currency) ||
          x.name.localeCompare(y.name)
      )
    return (
      <SheetModal visible={!!connection} onClose={onClose} sheetStyle={styles.sheet}>
        <View style={styles.header}>
          <Pressable onPress={() => setLinking(null)} hitSlop={10}>
            <Text style={styles.backText}>‹ Назад</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.titleSmall} numberOfLines={1}>Прив’язати до картки</Text>
            <Text style={styles.subtle} numberOfLines={1}>{c.provider_name} · {accountLabel(linking)}</Text>
          </View>
          <GlassPressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </GlassPressable>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={[styles.listContent, { paddingBottom: 34 }]}>
          {options.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Немає вільних карток. Створіть картку на сторінці рахунків.</Text>
            </View>
          ) : (
            <View style={styles.group}>
              {options.map((card, i) => {
                const sameCur = card.currency === linking.currency
                const bal = balances[card.id] ?? Number(card.initial_balance ?? 0)
                return (
                  <Pressable
                    key={card.id}
                    disabled={!!linkBusy}
                    onPress={() => pickCard(linking, card)}
                    style={({ pressed }) => [styles.row, i > 0 && styles.rowBorder, pressed && styles.rowPressed]}
                  >
                    <View style={[styles.icon, !sameCur && styles.iconIdle]}>
                      <Text style={styles.iconText}>💳</Text>
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.accName} numberOfLines={1}>{card.name}</Text>
                      <Text style={[styles.accMeta, !sameCur && { color: Colors.orange }]} numberOfLines={1}>
                        {[card.bank, sameCur ? card.currency : `${card.currency} ≠ ${linking.currency}`].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {linkBusy === card.id ? (
                      <ActivityIndicator color={Colors.orange} />
                    ) : (
                      <Text style={styles.balance}>{`${bal < 0 ? '−' : ''}${fmtMoney(bal, card.currency)}`}</Text>
                    )}
                  </Pressable>
                )
              })}
            </View>
          )}
        </ScrollView>
      </SheetModal>
    )
  }
  // Accounts with a card first; the ones without activity (no card yet) after
  const accounts = [...c.accounts].sort((a, b) => Number(!!b.card_id) - Number(!!a.card_id))

  return (
    <SheetModal visible={!!connection} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.header}>
        <BankLogo uri={c.provider_logo} name={c.provider_name} size={48} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{c.provider_name}</Text>
          <Text style={[styles.status, { color: s.color }]} numberOfLines={2}>{s.text}</Text>
        </View>
        <GlassPressable onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </GlassPressable>
      </View>

      <Text style={styles.sectionLabel}>Рахунки · {accounts.length}</Text>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {accounts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Рахунки з'являться після першої синхронізації</Text>
          </View>
        ) : (
          <View style={styles.group}>
            {accounts.map((a, i) => {
              const card = a.card_id ? cardsById[a.card_id] : undefined
              const bal = card ? balances[card.id] ?? Number(card.initial_balance ?? 0) : null
              return (
                <Pressable
                  key={a.account_id}
                  disabled={card ? !onOpenCard : !onLinkCard}
                  onPress={() => (card ? onOpenCard?.(card) : setLinking(a))}
                  style={({ pressed }) => [styles.row, i > 0 && styles.rowBorder, pressed && styles.rowPressed]}
                >
                  <View style={[styles.icon, !card && styles.iconIdle]}>
                    <Text style={styles.iconText}>{a.kind === 'card' ? '💳' : '🏦'}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.accName} numberOfLines={1}>
                      {card?.name || a.display_name || (a.kind === 'card' ? 'Картка' : 'Рахунок')}
                    </Text>
                    <Text style={styles.accMeta} numberOfLines={1}>
                      {card
                        ? [a.display_name && a.display_name !== card.name ? a.display_name : null, a.currency].filter(Boolean).join(' · ')
                        : `${a.currency ?? ''} · картку ще не створено`}
                    </Text>
                  </View>
                  {!card && onLinkCard ? (
                    <View style={styles.linkPill}>
                      <Text style={styles.linkPillText}>Прив’язати</Text>
                    </View>
                  ) : null}
                  {bal != null ? (
                    <View style={styles.balCol}>
                      <Text style={[styles.balance, bal < 0 && { color: '#FF6B6B' }]}>
                        {`${bal < 0 ? '−' : ''}${fmtMoney(bal, card?.currency || a.currency || undefined)}`}
                      </Text>
                      {onOpenCard ? <Text style={styles.chevron}>›</Text> : null}
                    </View>
                  ) : null}
                </Pressable>
              )
            })}
          </View>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          disabled={busy}
          onPress={() => (expired ? onReconnect(c) : onSync(c))}
          style={({ pressed }) => [styles.primaryBtn, (pressed || busy) && styles.btnPressed]}
        >
          {busy ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.primaryText}>{expired ? '🔑 Підключити знову' : '🔄 Синхронізувати зараз'}</Text>
          )}
        </Pressable>
        <Pressable
          disabled={busy}
          onPress={() => onDisconnect(c)}
          style={({ pressed }) => [styles.dangerBtn, pressed && styles.btnPressed]}
        >
          <Text style={styles.dangerText}>Відключити банк</Text>
        </Pressable>
      </View>
    </SheetModal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 14,
  },
  headerText: {
    flex: 1,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.orange,
  },
  titleSmall: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.white,
  },
  subtle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  linkPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 107, 0, 0.16)',
  },
  linkPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.orange,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.white,
  },
  status: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: Colors.white80,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white60,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 22,
    marginBottom: 8,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  group: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.10)',
  },
  rowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 107, 0, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconIdle: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    opacity: 0.6,
  },
  iconText: {
    fontSize: 18,
  },
  rowText: {
    flex: 1,
  },
  accName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
  accMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  balCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  balance: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
    fontVariant: ['tabular-nums'],
  },
  chevron: {
    fontSize: 20,
    color: Colors.textMuted,
  },
  empty: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSub,
    textAlign: 'center',
  },
  actions: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 34,
    gap: 10,
  },
  primaryBtn: {
    height: 50,
    borderRadius: 16,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.white,
  },
  dangerBtn: {
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FF6B6B',
  },
  btnPressed: {
    opacity: 0.75,
  },
})
