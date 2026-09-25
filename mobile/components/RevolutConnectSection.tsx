import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { Colors } from '../constants/theme'
import {
  connectRevolut,
  disconnectRevolut,
  getLastRevolutSync,
  getRevolutStatus,
  RevolutStatus,
} from '../api/revolut'
import { syncBanks } from '../store/useBankSyncStore'
import { triggerErrorHaptic, triggerSuccessHaptic } from '../utils/haptics'
import { GlassPressable } from './LiquidGlass'

const CONNECT_ERRORS: Record<string, string> = {
  access_denied: 'Доступ не надано в банку',
  exchange_failed: 'Банк не підтвердив підключення. Спробуйте ще раз',
  save_failed: 'Не вдалося зберегти підключення',
}

function timeAgo(date: Date): string {
  const min = Math.round((Date.now() - date.getTime()) / 60000)
  if (min < 1) return 'щойно'
  if (min < 60) return `${min} хв тому`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} год тому`
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
}

/** Settings block: connect Revolut via TrueLayer, sync now, disconnect. */
export default function RevolutConnectSection({ visible }: { visible: boolean }) {
  const [status, setStatus] = useState<RevolutStatus | 'checking' | 'unknown'>('checking')
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect' | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setStatus('checking')
    setLastSync(await getLastRevolutSync())
    try {
      setStatus(await getRevolutStatus())
    } catch {
      setStatus('unknown')
    }
  }, [])

  useEffect(() => {
    if (visible) refresh()
  }, [visible, refresh])

  const handleSync = async () => {
    setBusy('sync')
    try {
      const added = await syncBanks()
      setLastSync(new Date())
      triggerSuccessHaptic()
      Toast.show({ type: 'success', text1: added > 0 ? `Додано ${added} транзакцій` : 'Нових транзакцій немає' })
    } catch (e: any) {
      triggerErrorHaptic()
      Toast.show({ type: 'error', text1: 'Не вдалося синхронізувати', text2: e?.message })
      refresh()
    } finally {
      setBusy(null)
    }
  }

  const handleConnect = async () => {
    setBusy('connect')
    try {
      const result = await connectRevolut()
      if (result.status === 'ok') {
        setStatus('connected')
        triggerSuccessHaptic()
        Toast.show({ type: 'success', text1: 'Revolut підключено' })
        // First sync right away so transactions show up immediately
        setBusy(null)
        await handleSync()
      } else if (result.status === 'error') {
        triggerErrorHaptic()
        Toast.show({
          type: 'error',
          text1: 'Не вдалося підключити Revolut',
          text2: CONNECT_ERRORS[result.message] ?? result.message,
        })
      }
    } catch (e: any) {
      triggerErrorHaptic()
      Toast.show({ type: 'error', text1: 'Не вдалося підключити Revolut', text2: e?.message })
    } finally {
      setBusy(null)
    }
  }

  const handleDisconnect = () => {
    Alert.alert('Відключити Revolut?', 'Нові транзакції більше не підтягуватимуться. Наявні залишаться.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Відключити',
        style: 'destructive',
        onPress: async () => {
          setBusy('disconnect')
          try {
            await disconnectRevolut()
            setStatus('disconnected')
          } catch (e: any) {
            Toast.show({ type: 'error', text1: 'Не вдалося відключити', text2: e?.message })
          } finally {
            setBusy(null)
          }
        },
      },
    ])
  }

  const connected = status === 'connected'
  const statusText =
    status === 'checking'
      ? 'Перевірка…'
      : connected
      ? `Підключено${lastSync ? ` · синхронізовано ${timeAgo(lastSync)}` : ''}`
      : status === 'expired'
      ? 'Термін дії підключення сплив (90 днів) — підключіть знову'
      : status === 'unknown'
      ? 'Не вдалося перевірити підключення'
      : 'Не підключено'

  return (
    <View style={styles.group}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: connected ? Colors.green : status === 'expired' ? Colors.orange : Colors.textMuted }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Revolut</Text>
          <Text style={styles.status}>{statusText}</Text>
        </View>
        {status === 'checking' && <ActivityIndicator color={Colors.orange} size="small" />}
      </View>

      <Text style={styles.hint}>
        Через TrueLayer (Open Banking). Нові транзакції підтягуються автоматично при кожному відкритті застосунку.
      </Text>

      <View style={styles.divider} />

      {connected ? (
        <View style={styles.row}>
          <GlassPressable style={styles.btn} onPress={handleSync} disabled={!!busy}>
            {busy === 'sync' ? (
              <ActivityIndicator color={Colors.green} size="small" />
            ) : (
              <Text style={[styles.btnText, { color: Colors.green }]}>Синхронізувати зараз</Text>
            )}
          </GlassPressable>
          <View style={styles.vDivider} />
          <GlassPressable style={styles.btn} onPress={handleDisconnect} disabled={!!busy}>
            {busy === 'disconnect' ? (
              <ActivityIndicator color={Colors.red} size="small" />
            ) : (
              <Text style={[styles.btnText, { color: Colors.red }]}>Відключити</Text>
            )}
          </GlassPressable>
        </View>
      ) : (
        <GlassPressable
          style={styles.btn}
          onPress={handleConnect}
          disabled={!!busy || status === 'checking'}
        >
          {busy === 'connect' ? (
            <ActivityIndicator color={Colors.orange} size="small" />
          ) : (
            <Text style={styles.btnText}>
              {status === 'expired' ? 'Підключити знову' : 'Підключити Revolut'}
            </Text>
          )}
        </GlassPressable>
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  status: {
    fontSize: 12,
    color: Colors.textSub,
    marginTop: 2,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textMuted,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  row: {
    flexDirection: 'row',
  },
  vDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  btn: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.orange,
  },
})
