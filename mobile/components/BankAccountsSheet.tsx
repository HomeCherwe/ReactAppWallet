import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Colors } from '../constants/theme'
import { BankConnection, listTransferNames, TransferName } from '../api/bankConnections'
import { Card } from '../api/cards'
import { accountKind, KIND_META } from '../utils/accountKind'
import { cardLabel } from '../utils/cardLabel'
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
  /** One of the user's cards into the bank (an account it doesn't share): its transfers go there */
  onAttachCard?: (c: BankConnection, card: Card, match: string) => Promise<void>
  onDetachCard?: (c: BankConnection, card: Card) => Promise<void>
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
  onAttachCard,
  onDetachCard,
}: Props) {
  // Account being linked to an existing card (the sheet shows the card picker)
  const [linking, setLinking] = useState<BankAccount | null>(null)
  const [linkBusy, setLinkBusy] = useState<string | null>(null)
  // Adding one of the user's cards to the bank: null, { card: null } (picking), { card } (its name)
  const [attach, setAttach] = useState<{ card: Card | null } | null>(null)
  const [names, setNames] = useState<TransferName[] | null>(null)
  const [match, setMatch] = useState('')
  useEffect(() => {
    if (!connection) {
      setLinking(null)
      setAttach(null)
    }
  }, [connection])
  useEffect(() => {
    setNames(null)
  }, [connection?.id])

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

  const startAttach = () => {
    setAttach({ card: null })
    if (!names) listTransferNames(c.id).then(setNames).catch(() => setNames([]))
  }
  const pickAttachCard = (card: Card) => {
    setAttach({ card })
    setMatch((names || []).find(n => n.card_id === card.id)?.name || '')
  }
  const detach = (card: Card) =>
    Alert.alert(
      `Прибрати «${card.name}» з ${c.provider_name}?`,
      'Нові перекази більше не з’являтимуться на ньому самі. Рахунок і перекази, що вже є, залишаться.',
      [
        { text: 'Скасувати', style: 'cancel' },
        { text: 'Прибрати', style: 'destructive', onPress: () => onDetachCard?.(c, card).catch(() => {}) },
      ]
    )

  if (attach && !attach.card) {
    // Piggy banks first, and the cards the bank's transfers already went to
    const takenIds = new Set(c.accounts.map(a => a.card_id).filter(Boolean) as string[])
    const suggested = new Set((names || []).map(n => n.card_id).filter(Boolean) as string[])
    const options = cards
      .filter(card => !takenIds.has(card.id) && !card.archived)
      .sort(
        (x, y) =>
          Number(suggested.has(y.id)) - Number(suggested.has(x.id)) ||
          Number(accountKind(y) === 'savings') - Number(accountKind(x) === 'savings') ||
          x.name.localeCompare(y.name)
      )
    return (
      <SheetModal visible={!!connection} onClose={onClose} sheetStyle={styles.sheet}>
        <View style={styles.header}>
          <Pressable onPress={() => setAttach(null)} hitSlop={10}>
            <Text style={styles.backText}>‹ Назад</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.titleSmall} numberOfLines={1}>Додати існуючий рахунок</Text>
            <Text style={styles.subtle} numberOfLines={1}>{c.provider_name}</Text>
          </View>
          <GlassPressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </GlassPressable>
        </View>
        <Text style={styles.explain}>
          Для рахунку, який {c.provider_name} не віддає через підключення (наприклад, заощадження): перекази на нього й з нього
          з’являтимуться на ньому самі.
        </Text>
        <ScrollView style={styles.list} contentContainerStyle={[styles.listContent, { paddingBottom: 34 }]}>
          {options.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Немає вільних рахунків. Створіть його на сторінці рахунків.</Text>
            </View>
          ) : (
            <View style={styles.group}>
              {options.map((card, i) => {
                const bal = balances[card.id] ?? Number(card.initial_balance ?? 0)
                return (
                  <Pressable
                    key={card.id}
                    onPress={() => pickAttachCard(card)}
                    style={({ pressed }) => [styles.row, i > 0 && styles.rowBorder, pressed && styles.rowPressed]}
                  >
                    <View style={styles.icon}>
                      <Text style={styles.iconText}>{KIND_META[accountKind(card)].icon}</Text>
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.accName} numberOfLines={1}>{card.name}</Text>
                      <Text style={styles.accMeta} numberOfLines={1}>
                        {[card.bank, card.currency, suggested.has(card.id) ? 'перекази вже йшли сюди' : null].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Text style={styles.balance}>{`${bal < 0 ? '−' : ''}${fmtMoney(bal, card.currency)}`}</Text>
                  </Pressable>
                )
              })}
            </View>
          )}
        </ScrollView>
      </SheetModal>
    )
  }

  if (attach?.card) {
    const card = attach.card
    const clean = match.trim()
    return (
      <SheetModal visible={!!connection} onClose={onClose} sheetStyle={styles.sheet}>
        <View style={styles.header}>
          <Pressable onPress={() => setAttach({ card: null })} hitSlop={10}>
            <Text style={styles.backText}>‹ Назад</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.titleSmall} numberOfLines={2}>Як {c.provider_name} називає «{cardLabel(card)}»</Text>
          </View>
          <GlassPressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </GlassPressable>
        </View>
        <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: 34 }]} keyboardShouldPersistTaps="handled">
          <Text style={[styles.explain, { paddingHorizontal: 4 }]}>
            Як у переказах основного рахунку, наприклад «To Заощадження…» — без «To» / «From». Кожен такий переказ, і минулі теж,
            стане переказом на «{cardLabel(card)}» або з нього.
          </Text>
          <TextInput
            style={styles.input}
            value={match}
            onChangeText={setMatch}
            maxLength={80}
            placeholder="Наприклад, Заощадження з миттєвим доступом"
            placeholderTextColor="rgba(255,255,255,0.35)"
            returnKeyType="done"
          />
          {names == null ? (
            <ActivityIndicator color={Colors.orange} style={{ marginTop: 14 }} />
          ) : (
            names.length > 0 && (
              <>
                <Text style={styles.chipsLabel}>Перекази в {c.provider_name}:</Text>
                <View style={styles.chips}>
                  {names.map(n => {
                    const on = clean.toLowerCase() === n.name.toLowerCase()
                    return (
                      <Pressable key={n.name} onPress={() => setMatch(n.name)} style={[styles.chip, on && styles.chipOn]}>
                        <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                          {n.name} <Text style={styles.chipCount}>· {n.count}</Text>
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </>
            )
          )}
          <Pressable
            disabled={!!linkBusy || clean.length < 3}
            onPress={async () => {
              setLinkBusy(card.id)
              try {
                await onAttachCard?.(c, card, clean)
                setAttach(null)
              } catch {
                // the toast already explains it
              } finally {
                setLinkBusy(null)
              }
            }}
            style={({ pressed }) => [styles.primaryBtn, { marginTop: 18 }, (pressed || !!linkBusy || clean.length < 3) && styles.btnPressed]}
          >
            {linkBusy ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryText}>Додати до {c.provider_name}</Text>}
          </Pressable>
        </ScrollView>
      </SheetModal>
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
                    <Text style={styles.iconText}>{a.manual && card ? KIND_META[accountKind(card)].icon : a.kind === 'card' ? '💳' : '🏦'}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.accName} numberOfLines={1}>
                      {(a.manual && card ? cardLabel(card) : card?.name) || a.display_name || (a.kind === 'card' ? 'Картка' : 'Рахунок')}
                    </Text>
                    <Text style={styles.accMeta} numberOfLines={1}>
                      {a.manual
                        ? `через перекази «${a.match}»`
                        : card
                          ? [a.display_name && a.display_name !== card.name ? a.display_name : null, a.currency].filter(Boolean).join(' · ')
                          : `${a.currency ?? ''} · картку ще не створено`}
                    </Text>
                  </View>
                  {a.manual && card && onDetachCard ? (
                    <Pressable onPress={() => detach(card)} hitSlop={8} style={styles.detachBtn}>
                      <Text style={styles.detachText}>✕</Text>
                    </Pressable>
                  ) : null}
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
        {onAttachCard ? (
          <Pressable onPress={startAttach} style={({ pressed }) => [styles.attachBtn, pressed && styles.rowPressed]}>
            <Text style={styles.attachTitle}>+ Додати існуючий рахунок</Text>
            <Text style={styles.attachSub}>Якщо банк не віддає якийсь рахунок, наприклад заощадження</Text>
          </Pressable>
        ) : null}
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
  explain: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSub,
    paddingHorizontal: 22,
    marginBottom: 12,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.white,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  chipsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 14,
    marginBottom: 8,
    marginLeft: 4,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  chipOn: { backgroundColor: 'rgba(255, 107, 0, 0.15)', borderColor: 'rgba(255, 107, 0, 0.5)' },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.white80 },
  chipTextOn: { color: Colors.white },
  chipCount: { color: Colors.textMuted },
  attachBtn: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  attachTitle: { fontSize: 14, fontWeight: '700', color: Colors.orange },
  attachSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  detachBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  detachText: { fontSize: 12, color: Colors.white60, fontWeight: '700' },
})
