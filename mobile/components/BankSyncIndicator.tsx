import React, { useEffect, useRef } from 'react'
import { ActivityIndicator, Animated, StyleSheet, Text } from 'react-native'
import { Colors } from '../constants/theme'
import { useBankSyncStore } from '../store/useBankSyncStore'

function formatSyncTime(ms: number): string {
  const d = new Date(ms)
  const time = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return `сьогодні, ${time}`
  if (d.toDateString() === yesterday.toDateString()) return `вчора, ${time}`
  return `${d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}, ${time}`
}

function pluralTx(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'транзакція'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'транзакції'
  return 'транзакцій'
}

/**
 * Bank sync status for the transactions header:
 * syncing → spinner; new transactions → "+N" for a few seconds; otherwise the last sync time.
 */
export default function BankSyncIndicator() {
  const phase = useBankSyncStore(s => s.phase)
  const added = useBankSyncStore(s => s.added)
  const lastSyncAt = useBankSyncStore(s => s.lastSyncAt)

  // Short fade whenever the content changes
  const opacity = useRef(new Animated.Value(1)).current
  const key = `${phase}-${added}-${lastSyncAt}`
  useEffect(() => {
    opacity.setValue(0)
    Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }).start()
  }, [key])

  if (phase === 'idle' && !lastSyncAt) return null

  return (
    <Animated.View style={[styles.wrap, { opacity }]}>
      {phase === 'syncing' ? (
        <>
          <ActivityIndicator size="small" color={Colors.orange} style={styles.spinner} />
          <Text style={styles.text}>Синхронізація банків…</Text>
        </>
      ) : phase === 'result' ? (
        <Text style={[styles.text, styles.added]}>
          ✓ +{added} {pluralTx(added)}
        </Text>
      ) : (
        <Text style={styles.text}>Оновлено {formatSyncTime(lastSyncAt!)}</Text>
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  spinner: {
    transform: [{ scale: 0.75 }],
    marginRight: 2,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  added: {
    color: Colors.green,
  },
})
