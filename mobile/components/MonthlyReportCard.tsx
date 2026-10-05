import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Toast from 'react-native-toast-message'
import { Colors } from '../constants/theme'
import {
  getMonthlyReport,
  MonthlyReport,
  MonthlyReportStats,
  parseReport,
  readMonthlyReport,
  ReportSectionType,
} from '../api/insights'
import { triggerLightHaptic, triggerSuccessHaptic } from '../utils/haptics'

// "порівняно з серпнем"
const MONTHS_INSTR = ['січнем', 'лютим', 'березнем', 'квітнем', 'травнем', 'червнем', 'липнем', 'серпнем', 'вереснем', 'жовтнем', 'листопадом', 'груднем']

const SECTION: Record<ReportSectionType, { emoji: string; title: string; dot: string }> = {
  changes: { emoji: '📊', title: 'Що змінилось', dot: Colors.white60 },
  overspend: { emoji: '🔥', title: 'Де перевитрата', dot: '#FF6B6B' },
  good: { emoji: '👍', title: 'Що вийшло добре', dot: Colors.green },
  tip: { emoji: '💡', title: 'Порада', dot: Colors.orangeLight },
}

interface Props {
  /** 'YYYY-MM' */
  month: string
  monthLabel: string
  currency: string
  stats: MonthlyReportStats
}

/** Change against the previous month, e.g. { text: '↑ 23%', up: true }; null when there's nothing to compare */
function delta(now: number, before: number): { text: string; up: boolean } | null {
  if (!before) return null
  const pct = Math.round(((now - before) / before) * 100)
  if (pct === 0) return { text: '= 0%', up: false }
  return { text: `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}%`, up: pct > 0 }
}

/**
 * «Звіт місяця»: GPT reads the month's numbers (the same ones the screen shows) and writes a short
 * summary with parts — what changed, where it went over, what went well, one tip. Written on
 * request and kept per month.
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

  const parsed = useMemo(() => (report ? parseReport(report.report) : null), [report])
  const empty = stats.transactions === 0
  // A month still going on isn't compared: half a month always looks cheaper
  const prevMonth = (Number(month.slice(5, 7)) + 10) % 12
  const changes = stats.partial
    ? []
    : [
        { label: 'Витрати', d: delta(stats.expense, stats.previous.expense), good: false },
        { label: 'Доходи', d: delta(stats.income, stats.previous.income), good: true },
      ].filter(c => c.d)

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

      {changes.length > 0 && !empty && (
        <View style={styles.chips}>
          {changes.map(c => {
            // More income is good; more spending isn't
            const fine = c.d!.up === c.good
            return (
              <View key={c.label} style={[styles.chip, fine ? styles.chipGood : styles.chipBad]}>
                <Text style={styles.chipLabel}>{c.label}</Text>
                <Text style={[styles.chipValue, { color: fine ? Colors.green : '#FF6B6B' }]}>{c.d!.text}</Text>
              </View>
            )
          })}
          <Text style={styles.chipsNote}>порівняно з {MONTHS_INSTR[prevMonth]}</Text>
        </View>
      )}

      {writing ? (
        <View style={styles.writing}>
          <ActivityIndicator color={Colors.orange} />
          <Text style={styles.writingText}>Пишу звіт за {monthLabel.toLowerCase()}…</Text>
        </View>
      ) : parsed ? (
        <>
          {parsed.summary ? <Text style={styles.summary}>{parsed.summary}</Text> : null}
          {parsed.sections.map(s => {
            const meta = SECTION[s.type] ?? SECTION.changes
            const tip = s.type === 'tip'
            return (
              <View key={s.type} style={[styles.section, tip && styles.tipBox]}>
                <Text style={styles.sectionTitle}>
                  {meta.emoji} {meta.title}
                </Text>
                {s.points.map((p, i) => (
                  <View key={i} style={styles.point}>
                    {!tip && <View style={[styles.dot, { backgroundColor: meta.dot }]} />}
                    <Text style={[styles.pointText, tip && styles.tipText]}>{p}</Text>
                  </View>
                ))}
              </View>
            )
          })}
          <Text style={styles.meta}>
            GPT · {new Date(report!.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
          </Text>
        </>
      ) : !checked ? (
        <ActivityIndicator color={Colors.orange} style={{ marginVertical: 8 }} />
      ) : (
        <>
          <Text style={styles.hint}>
            {empty
              ? 'За цей місяць транзакцій немає.'
              : 'Короткий розбір від GPT: що змінилось порівняно з минулим місяцем, де перевитрата, що вийшло добре, і порада на наступний.'}
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
    padding: 16,
    overflow: 'hidden',
    backgroundColor: '#141416',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,140,58,0.35)',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', color: Colors.white },
  refresh: { fontSize: 13, fontWeight: '700', color: Colors.orangeLight },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, borderWidth: 1 },
  chipGood: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.30)' },
  chipBad: { backgroundColor: 'rgba(255,107,107,0.10)', borderColor: 'rgba(255,107,107,0.30)' },
  chipLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.white80 },
  chipValue: { fontSize: 12.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
  chipsNote: { fontSize: 11.5, color: Colors.white40 },
  summary: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: Colors.white, marginBottom: 4 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: Colors.white60, letterSpacing: 0.3, marginBottom: 6, textTransform: 'uppercase' },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  pointText: { flex: 1, fontSize: 15, lineHeight: 21, color: Colors.white },
  tipBox: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,140,58,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,140,58,0.40)',
  },
  tipText: { fontWeight: '600' },
  meta: { fontSize: 11.5, color: Colors.white40, marginTop: 14 },
  hint: { fontSize: 13.5, lineHeight: 19, color: Colors.white60 },
  btn: { alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 100, backgroundColor: Colors.orange },
  btnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  writing: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  writingText: { fontSize: 14, color: Colors.white60 },
})
