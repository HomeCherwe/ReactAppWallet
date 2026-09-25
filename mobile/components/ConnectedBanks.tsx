import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { Colors } from '../constants/theme'
import {
  BankConnection,
  connectBank,
  disconnectBank,
  linkBankAccountToCard,
  listBankConnections,
  syncConnectedBanks,
} from '../api/bankConnections'
import { syncBanks } from '../store/useBankSyncStore'
import { txBus } from '../utils/txBus'
import { triggerErrorHaptic, triggerLightHaptic, triggerMediumHaptic, triggerSuccessHaptic } from '../utils/haptics'
import { Card } from '../api/cards'
import BankLogo from './BankLogo'
import BankAccountsSheet from './BankAccountsSheet'
import GlassContextMenu, { MenuAction } from './GlassContextMenu'

// Time for a sheet to finish closing before the next thing is presented (iOS)
const SHEET_SWAP_DELAY_MS = 380

function timeAgo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'щойно'
  if (min < 60) return `${min} хв тому`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} год тому`
  return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
}

function accountsLabel(n: number): string {
  if (n === 0) return ''
  const mod10 = n % 10
  const mod100 = n % 100
  const word = mod10 === 1 && mod100 !== 11 ? 'рахунок' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'рахунки' : 'рахунків'
  return `${n} ${word}`
}

function statusLine(c: BankConnection): { text: string; color: string } {
  if (c.status === 'expired') {
    return {
      text: c.auth === 'token' ? 'Токен відкликано — підключіть знову' : 'Термін доступу сплив — підключіть знову',
      color: Colors.orange,
    }
  }
  if (c.last_error) return { text: 'Помилка останньої синхронізації', color: Colors.red }
  const parts = [c.last_sync_at ? `Синхронізовано ${timeAgo(c.last_sync_at)}` : 'Ще не синхронізовано', accountsLabel(c.accounts.length)]
  return { text: parts.filter(Boolean).join(' · '), color: Colors.textSub }
}

/**
 * Cards screen block: banks connected through TrueLayer — status, last sync, and per bank
 * sync now / reconnect / disconnect. Hidden until loaded and when nothing is connected.
 * Reloads whenever `reloadKey` changes.
 */
export default function ConnectedBanks({
  reloadKey = 0,
  onChanged,
  onReconnectToken,
  cards = [],
  balances = {},
  onOpenCard,
}: {
  reloadKey?: number
  onChanged?: () => void
  /** Token banks (Monobank) reconnect with a new token in the add-bank sheet */
  onReconnectToken?: (c: BankConnection) => void
  /** The user's cards and balances, to show which cards each bank fills */
  cards?: Card[]
  balances?: Record<string, number>
  /** Tap on an account in the bank's sheet */
  onOpenCard?: (card: Card) => void
}) {
  // Tap on a bank: its accounts; long press: quick actions
  const [openId, setOpenId] = useState<string | null>(null)
  const cardsById = useMemo(() => Object.fromEntries(cards.map(c => [c.id, c])), [cards])
  const [connections, setConnections] = useState<BankConnection[] | null>(null)
  const [error, setError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setConnections(await listBankConnections())
      setError(false)
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [reloadKey, load])

  const syncOne = async (c: BankConnection) => {
    setBusyId(c.id)
    try {
      const { added, results } = await syncConnectedBanks(c.id)
      const failed = results.find(r => r.error)
      if (failed) throw new Error(failed.error === 'consent_expired' ? 'Термін доступу сплив' : failed.error)
      triggerSuccessHaptic()
      if (added > 0) {
        txBus.emit({ type: 'SYNCED', source: 'banks', count: added })
        onChanged?.()
      }
      Toast.show({ type: 'success', text1: added > 0 ? `${c.provider_name}: +${added}` : `${c.provider_name}: нових транзакцій немає` })
    } catch (e: any) {
      triggerErrorHaptic()
      Toast.show({ type: 'error', text1: `Не вдалося синхронізувати ${c.provider_name}`, text2: e?.message })
    } finally {
      setBusyId(null)
      load()
    }
  }

  const reconnect = async (c: BankConnection) => {
    if (openId) {
      // Close the bank sheet first: nothing can be presented over a closing sheet
      setOpenId(null)
      setTimeout(() => reconnect(c), SHEET_SWAP_DELAY_MS)
      return
    }
    if (c.auth === 'token') {
      onReconnectToken?.(c)
      return
    }
    setBusyId(c.id)
    try {
      const result = await connectBank(c.provider_id)
      if (result.status === 'ok') {
        triggerSuccessHaptic()
        Toast.show({ type: 'success', text1: `${c.provider_name} підключено знову` })
        await load()
        syncBanks().catch(() => {})
      } else if (result.status === 'error') {
        Toast.show({ type: 'error', text1: 'Не вдалося підключити', text2: result.message })
      }
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Не вдалося підключити', text2: e?.message })
    } finally {
      setBusyId(null)
    }
  }

  // Account without a card → one of the user's cards; then pull its transactions there
  const linkCard = async (c: BankConnection, accountId: string, card: Card) => {
    try {
      await linkBankAccountToCard(c.id, accountId, card.id)
      triggerSuccessHaptic()
      Toast.show({ type: 'success', text1: `Прив’язано до «${card.name}»`, text2: 'Підтягуємо транзакції…' })
      await load()
      syncOne(c)
    } catch (e: any) {
      triggerErrorHaptic()
      Toast.show({ type: 'error', text1: 'Не вдалося прив’язати', text2: e?.message })
      throw e
    }
  }

  const disconnect = (c: BankConnection) => {
    Alert.alert(
      `Відключити ${c.provider_name}?`,
      'Нові транзакції більше не підтягуватимуться. Картки й уже імпортовані транзакції залишаться.',
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Відключити',
          style: 'destructive',
          onPress: async () => {
            setBusyId(c.id)
            try {
              await disconnectBank(c.id)
              setOpenId(null)
              triggerSuccessHaptic()
              Toast.show({ type: 'success', text1: `${c.provider_name} відключено`, text2: 'Картки й транзакції залишились' })
              await load()
              onChanged?.()
            } catch (e: any) {
              Toast.show({ type: 'error', text1: 'Не вдалося відключити', text2: e?.message })
            } finally {
              setBusyId(null)
            }
          },
        },
      ]
    )
  }

  // Long press: glass menu with these actions
  const menuActions = (c: BankConnection): MenuAction[] => [
    { label: 'Рахунки банку', icon: 'list', onPress: () => setOpenId(c.id) },
    c.status === 'expired'
      ? { label: 'Підключити знову', icon: 'key', onPress: () => reconnect(c) }
      : { label: 'Синхронізувати зараз', icon: 'sync', onPress: () => syncOne(c) },
    { label: 'Відключити', icon: 'unplug', destructive: true, onPress: () => disconnect(c) },
  ]

  const opened = connections?.find(c => c.id === openId) ?? null

  // Hidden while loading and when nothing is connected (connecting starts from "＋ Додати")
  if (!connections || connections.length === 0) return null

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>🔄 Підключені банки</Text>
      <View style={styles.group}>
      {connections.map((c, i) => {
          const status = statusLine(c)
          return (
            <GlassContextMenu
              key={c.id}
              actions={menuActions(c)}
              title={c.provider_name}
              subtitle={status.text}
              onPress={() => {
                triggerLightHaptic()
                setOpenId(c.id)
              }}
              style={[styles.row, i > 0 && styles.rowBorder]}
            >
              <BankLogo uri={c.provider_logo} name={c.provider_name} size={38} />
              <View style={styles.rowText}>
                <Text style={styles.bankName}>{c.provider_name}</Text>
                <Text style={[styles.status, { color: status.color }]} numberOfLines={1}>{status.text}</Text>
              </View>
              {busyId === c.id ? (
                <ActivityIndicator color={Colors.orange} />
              ) : (
                <View style={styles.trail}>
                  <View style={[styles.dot, { backgroundColor: c.status === 'active' && !c.last_error ? Colors.green : Colors.orange }]} />
                  <Text style={styles.chevron}>›</Text>
                </View>
              )}
            </GlassContextMenu>
          )
        })}
      </View>
      <Text style={styles.hint}>Натисніть — рахунки банку · утримуйте — дії</Text>

      <BankAccountsSheet
        connection={opened}
        status={opened ? statusLine(opened) : null}
        cardsById={cardsById}
        balances={balances}
        busy={!!opened && busyId === opened.id}
        onClose={() => setOpenId(null)}
        onSync={syncOne}
        onReconnect={reconnect}
        onDisconnect={disconnect}
        cards={cards}
        onLinkCard={linkCard}
        onOpenCard={
          onOpenCard
            ? card => {
                setOpenId(null)
                setTimeout(() => onOpenCard(card), SHEET_SWAP_DELAY_MS)
              }
            : undefined
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 20,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white80,
    marginBottom: 10,
  },
  group: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  row: {
    // Solid, so the lifted preview of the iOS context menu isn't see-through
    backgroundColor: '#161619',
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
  rowText: {
    flex: 1,
  },
  bankName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  status: {
    fontSize: 12,
    marginTop: 2,
  },
  trail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chevron: {
    fontSize: 20,
    color: Colors.textMuted,
  },
  hint: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})
