import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { Colors } from '../constants/theme'
import {
  BankConnection,
  connectBank,
  disconnectBank,
  listBankConnections,
  syncConnectedBanks,
} from '../api/bankConnections'
import { syncBanks } from '../store/useBankSyncStore'
import { txBus } from '../utils/txBus'
import { triggerErrorHaptic, triggerLightHaptic, triggerSuccessHaptic } from '../utils/haptics'
import { GlassPressable } from './LiquidGlass'
import BankLogo from './BankLogo'
import AddBankModal from './AddBankModal'

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
  if (c.status === 'expired') return { text: 'Термін доступу сплив — підключіть знову', color: Colors.orange }
  if (c.last_error) return { text: 'Помилка останньої синхронізації', color: Colors.red }
  const parts = [c.last_sync_at ? `Синхронізовано ${timeAgo(c.last_sync_at)}` : 'Ще не синхронізовано', accountsLabel(c.accounts.length)]
  return { text: parts.filter(Boolean).join(' · '), color: Colors.textSub }
}

/** Settings block: connected banks (TrueLayer) + "Add bank". */
export default function BanksSection({ visible }: { visible: boolean }) {
  const [connections, setConnections] = useState<BankConnection[] | null>(null)
  const [error, setError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      setConnections(await listBankConnections())
      setError(false)
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => {
    if (visible) load()
  }, [visible, load])

  const syncOne = async (c: BankConnection) => {
    setBusyId(c.id)
    try {
      const { added, results } = await syncConnectedBanks(c.id)
      const failed = results.find(r => r.error)
      if (failed) throw new Error(failed.error === 'consent_expired' ? 'Термін доступу сплив' : failed.error)
      triggerSuccessHaptic()
      if (added > 0) txBus.emit({ type: 'SYNCED', source: 'banks', count: added })
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
              await load()
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

  const openActions = (c: BankConnection) => {
    triggerLightHaptic()
    Alert.alert(c.provider_name, statusLine(c).text, [
      c.status === 'expired'
        ? { text: 'Підключити знову', onPress: () => reconnect(c) }
        : { text: 'Синхронізувати зараз', onPress: () => syncOne(c) },
      { text: 'Відключити', style: 'destructive', onPress: () => disconnect(c) },
      { text: 'Закрити', style: 'cancel' },
    ])
  }

  return (
    <View style={styles.group}>
      {connections === null ? (
        <View style={styles.loading}>
          {error ? (
            <Pressable onPress={load}>
              <Text style={styles.errorText}>Не вдалося завантажити банки · Повторити</Text>
            </Pressable>
          ) : (
            <ActivityIndicator color={Colors.orange} />
          )}
        </View>
      ) : (
        connections.map((c, i) => {
          const status = statusLine(c)
          return (
            <Pressable
              key={c.id}
              onPress={() => openActions(c)}
              style={({ pressed }) => [styles.row, i > 0 && styles.rowBorder, pressed && styles.rowPressed]}
            >
              <BankLogo uri={c.provider_logo} name={c.provider_name} size={38} />
              <View style={styles.rowText}>
                <Text style={styles.bankName}>{c.provider_name}</Text>
                <Text style={[styles.status, { color: status.color }]} numberOfLines={1}>{status.text}</Text>
              </View>
              {busyId === c.id ? (
                <ActivityIndicator color={Colors.orange} />
              ) : (
                <View style={[styles.dot, { backgroundColor: c.status === 'active' && !c.last_error ? Colors.green : Colors.orange }]} />
              )}
            </Pressable>
          )
        })
      )}

      {connections !== null && connections.length === 0 && (
        <Text style={styles.emptyHint}>
          Підключіть банк — і нові транзакції підтягуватимуться автоматично при кожному відкритті застосунку.
        </Text>
      )}

      <View style={styles.divider} />
      <GlassPressable style={styles.addBtn} onPress={() => setAddOpen(true)}>
        <Text style={styles.addText}>＋ Додати банк</Text>
      </GlassPressable>

      <AddBankModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        connectedProviderIds={(connections ?? []).filter(c => c.status === 'active').map(c => c.provider_id)}
        defaultCountry={connections?.[0]?.country ?? 'fr'}
        onConnected={async () => {
          await load()
          // First sync right away (pulls ~90 days of history) — shown by the indicator on Home
          syncBanks().catch(() => {})
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  loading: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13,
    color: Colors.orange,
    fontWeight: '600',
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
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  emptyHint: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.textMuted,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  addBtn: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
  },
  addText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.orange,
  },
})
