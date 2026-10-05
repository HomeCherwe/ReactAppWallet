import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Toast from 'react-native-toast-message'
import { Colors } from '../constants/theme'
import { getMonthlyReport, MonthlyReport, MonthlyReportStats, readMonthlyReport } from '../api/insights'
import { triggerLightHaptic, triggerSuccessHaptic } from '../utils/haptics'

interface Props {
  /** 'YYYY-MM' */
  month: string
  monthLabel: string
  currency: string
  stats: MonthlyReportStats
}

/**
 * «Звіт місяця»: GPT reads the month's numbers (the same ones the screen shows) and writes a few
 * sentences — what changed, where it went over, one tip. Written on request and kept per month.
 */
export default function MonthlyReportCard({ month, monthLabel, currency, stats }: Props) {
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [checked, setChecked] = useState(false)
  const [writing, setWriting] = useState(false)
  const shown = useRef(month)
  shown.current = month

  useEffect(() => {
    setReport(null)
    setChecked(false)
    readMonthlyReport(month)
      .then(r => shown.current === month && setReport(r))
      .catch(() => {})
      .finally(() => shown.current === month && setChecked(true))
  }, [month])

  const empty = stats.transactions === 0
  const write = async (force: boolean) => {
    if (writing || empty) return
    triggerLightHaptic()
    setWriting(true)
    try {
      const r = await getMonthlyReport(month, currency, stats, force)
      if (shown.current !== month) return
      setReport(r)
      triggerSuccessHaptic()
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Звіт не вийшов', text2: e?.message })
    } finally {
      setWriting(false)
    }
  }

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={['rgba(255,107,0,0.16)', 'rgba(175,82,222,0.10)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.head}>
        <Text style={styles.title}>✨ Звіт місяця</Text>
        {report && !writing && (
          <Pressable hitSlop={10} onPress={() => write(true)}>
            <Text style={styles.refresh}>Оновити</Text>
          </Pressable>
        )}
      </View>

      {writing ? (
        <View style={styles.writing}>
          <ActivityIndicator color={Colors.orange} />
          <Text style={styles.writingText}>Пишу звіт за {monthLabel.toLowerCase()}…</Text>
        </View>
      ) : report ? (
        <>
          <Text style={styles.text}>{report.report}</Text>
          <Text style={styles.meta}>
            GPT · {new Date(report.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
          </Text>
        </>
      ) : !checked ? (
        <ActivityIndicator color={Colors.orange} style={{ marginVertical: 8 }} />
      ) : (
        <>
          <Text style={styles.hint}>
            {empty
              ? 'За цей місяць транзакцій немає.'
              : 'Кілька речень від GPT: що змінилось порівняно з минулим місяцем, де перевитрата і порада на наступний.'}
          </Text>
          {!empty && (
            <Pressable onPress={() => write(false)} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}>
              <Text style={styles.btnText}>Написати звіт</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    borderRadius: 20,
    padding: 14,
    overflow: 'hidden',
    backgroundColor: '#141416',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,140,58,0.35)',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '800', color: Colors.white },
  refresh: { fontSize: 13, fontWeight: '700', color: Colors.orangeLight },
  text: { fontSize: 15, lineHeight: 22, color: Colors.white },
  meta: { fontSize: 11.5, color: Colors.white40, marginTop: 8 },
  hint: { fontSize: 13.5, lineHeight: 19, color: Colors.white60 },
  btn: { alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 100, backgroundColor: Colors.orange },
  btnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  writing: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  writingText: { fontSize: 14, color: Colors.white60 },
})
