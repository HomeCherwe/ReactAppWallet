import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Colors, Radius } from '../constants/theme'
import { AdminHealth, AdminLogs, AdminProblem, getAdminHealth, getAdminLogs } from '../api/admin'
import { triggerLightHaptic } from '../utils/haptics'

const PERIODS = [
  { hours: 24, label: '24 години' },
  { hours: 24 * 7, label: '7 днів' },
  { hours: 24 * 30, label: '30 днів' },
]
const SOURCES = [
  { key: 'all', label: 'Усе' },
  { key: 'server', label: 'Сервер' },
  { key: 'web', label: 'Сайт' },
  { key: 'ios', label: 'iPhone' },
]
const SOURCE_LABEL: Record<string, string> = { server: 'Сервер', web: 'Сайт', ios: 'iPhone' }
const STATE_COLOR = { ok: '#34C759', warn: '#FF8C3A', fail: '#FF6B6B' }

function timeAgo(iso?: string | null) {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'щойно'
  if (min < 60) return `${min} хв тому`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} год тому`
  return `${Math.round(h / 24)} дн тому`
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        triggerLightHaptic()
        onPress()
      }}
      style={[styles.chip, active && styles.chipOn]}
    >
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  )
}

/** One problem: how often and where; a tap opens the latest example */
function ProblemRow({ group }: { group: AdminProblem }) {
  const [open, setOpen] = useState(false)
  const meta = [
    SOURCE_LABEL[group.source] || group.source,
    timeAgo(group.last_at),
    group.path,
    group.status ? `код ${group.status}` : null,
    group.mine ? 'у тебе' : group.users > 0 ? `людей: ${group.users}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const share = () =>
    Share.share({ message: [group.message, group.path, group.status && `status ${group.status}`, group.details].filter(Boolean).join('\n') }).catch(() => {})

  return (
    <View style={styles.problem}>
      <Pressable onPress={() => setOpen(v => !v)} style={({ pressed }) => [styles.problemHead, pressed && styles.pressed]}>
        <View style={[styles.dotSmall, { backgroundColor: group.level === 'error' ? STATE_COLOR.fail : STATE_COLOR.warn }]} />
        <View style={styles.flex}>
          <Text style={styles.problemText} numberOfLines={open ? undefined : 2}>{group.message}</Text>
          <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countText}>×{group.count}</Text>
        </View>
      </Pressable>
      {open && (
        <View style={styles.problemBody}>
          {!!group.details && (
            <ScrollView style={styles.detailsBox} nestedScrollEnabled>
              <Text style={styles.detailsText} selectable>{group.details}</Text>
            </ScrollView>
          )}
          <Text style={styles.meta}>
            Вперше: {new Date(group.first_at).toLocaleString('uk-UA')}
            {'\n'}Востаннє: {new Date(group.last_at).toLocaleString('uk-UA')}
            {group.app_version ? `\nВерсія: ${group.app_version}` : ''}
          </Text>
          <Pressable onPress={share} hitSlop={8}>
            <Text style={styles.shareText}>Поділитися</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

/**
 * «Адмінка» (only the owner; the web has the same page): is everything the project depends on working
 * right now, and what went wrong lately on the server, the site and the iPhone app.
 */
export default function AdminScreen({ onClose }: { onClose: () => void }) {
  const [hours, setHours] = useState(24)
  const [source, setSource] = useState('all')
  const [withWarnings, setWithWarnings] = useState(false)
  const [logs, setLogs] = useState<AdminLogs | null>(null)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [health, setHealth] = useState<AdminHealth | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const loadLogs = useCallback(async () => {
    setLogsError(null)
    try {
      setLogs(await getAdminLogs(hours))
    } catch (e: any) {
      setLogs(null)
      setLogsError(e?.message || 'Помилка')
    }
  }, [hours])

  const loadHealth = useCallback(async () => {
    setChecking(true)
    setHealthError(null)
    try {
      setHealth(await getAdminHealth())
    } catch (e: any) {
      setHealthError(e?.message || 'Помилка')
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])
  useEffect(() => {
    loadHealth()
  }, [loadHealth])

  const groups = useMemo(
    () => (logs?.groups || []).filter(g => (source === 'all' || g.source === source) && (withWarnings || g.level === 'error')),
    [logs, source, withWarnings]
  )
  const errorCount = groups.filter(g => g.level === 'error').reduce((s, g) => s + g.count, 0)
  const brokenBanks = (health?.banks || []).filter(b => b.problem)

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Адмінка</Text>
        <TouchableOpacity
          onPress={() => {
            loadLogs()
            loadHealth()
          }}
          disabled={checking}
          hitSlop={8}
          style={styles.headerBtn}
        >
          {checking ? <ActivityIndicator size="small" color={Colors.orange} /> : <Text style={styles.headerBtnText}>Оновити</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>Закрити</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.section}>СТАН ЗАРАЗ</Text>
        <View style={styles.card}>
          {healthError ? (
            <Text style={styles.failText}>Не вдалося перевірити: {healthError}</Text>
          ) : !health ? (
            <ActivityIndicator color={Colors.orange} style={styles.spinner} />
          ) : (
            <>
              {health.checks.map(c => (
                <View key={c.key} style={styles.check}>
                  <View style={[styles.dot, { backgroundColor: STATE_COLOR[c.state] }]} />
                  <View style={styles.flex}>
                    <Text style={styles.checkLabel}>{c.label}</Text>
                    <Text style={[styles.checkText, c.state !== 'ok' && { color: STATE_COLOR[c.state] }]}>{c.text}</Text>
                    {!!c.link && (
                      <Pressable onPress={() => Linking.openURL(c.link as string)} style={styles.linkBtn}>
                        <Text style={styles.linkText}>{c.linkLabel} ↗</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
              {brokenBanks.map((b, i) => (
                <Text key={`${b.provider}-${i}`} style={styles.bankLine} numberOfLines={2}>
                  <Text style={styles.bankName}>{b.provider}</Text> · {b.mine ? 'твій' : 'інший користувач'} · <Text style={styles.bankProblem}>{b.problem}</Text>
                </Text>
              ))}
              {!!health.deploy?.commit && (
                <Text style={styles.deploy}>
                  Сервер: версія {health.deploy.commit}
                  {health.deploy.region ? ` · ${health.deploy.region}` : ''}
                </Text>
              )}
            </>
          )}
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionInline}>ПОМИЛКИ</Text>
          {!!logs && (
            <Text style={styles.summary}>
              Помилок: {errorCount} · різних: {groups.length}
            </Text>
          )}
        </View>
        <View style={styles.chips}>
          {PERIODS.map(p => (
            <Chip key={p.hours} label={p.label} active={hours === p.hours} onPress={() => setHours(p.hours)} />
          ))}
        </View>
        <View style={styles.chips}>
          {SOURCES.map(s => (
            <Chip key={s.key} label={s.label} active={source === s.key} onPress={() => setSource(s.key)} />
          ))}
          <Chip label="Попередження" active={withWarnings} onPress={() => setWithWarnings(v => !v)} />
        </View>

        {logsError ? (
          <Text style={styles.failText}>Журнал не завантажився: {logsError}</Text>
        ) : !logs ? (
          <ActivityIndicator color={Colors.orange} style={styles.spinner} />
        ) : groups.length === 0 ? (
          <Text style={styles.empty}>✓ За цей період помилок немає</Text>
        ) : (
          groups.map(g => <ProblemRow key={g.fingerprint} group={g} />)
        )}
        {!!logs?.truncated && <Text style={styles.deploy}>Показано лише найновіші записи — виберіть менший період.</Text>}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12 },
  title: { flex: 1, fontSize: 24, fontWeight: '800', color: Colors.white, letterSpacing: -0.3 },
  headerBtn: {
    minWidth: 72,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,107,0,0.15)',
  },
  headerBtnText: { fontSize: 13, fontWeight: '700', color: Colors.orange },
  scroll: { paddingHorizontal: 16, paddingBottom: 50 },
  section: { fontSize: 12, fontWeight: '700', color: Colors.white40, letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 22, marginBottom: 8, marginHorizontal: 4 },
  sectionInline: { fontSize: 12, fontWeight: '700', color: Colors.white40, letterSpacing: 1 },
  summary: { fontSize: 12, color: Colors.white40, fontVariant: ['tabular-nums'] },
  card: { padding: 14, borderRadius: 18, gap: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)' },
  spinner: { paddingVertical: 18 },
  flex: { flex: 1, minWidth: 0 },
  check: { flexDirection: 'row', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  checkLabel: { fontSize: 14, fontWeight: '700', color: Colors.white },
  checkText: { fontSize: 12, lineHeight: 17, color: Colors.white60, marginTop: 2 },
  linkBtn: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.pill, backgroundColor: Colors.orange },
  linkText: { fontSize: 13, fontWeight: '800', color: Colors.white },
  bankLine: { fontSize: 12, color: Colors.white40, marginLeft: 20 },
  bankName: { fontWeight: '700', color: Colors.white80 },
  bankProblem: { color: STATE_COLOR.warn },
  deploy: { fontSize: 11, color: Colors.white40, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.pill, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  chipOn: { backgroundColor: 'rgba(255,107,0,0.15)', borderColor: 'rgba(255,107,0,0.5)' },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.white60 },
  chipTextOn: { color: Colors.white },
  failText: { fontSize: 13, color: STATE_COLOR.fail },
  empty: { fontSize: 14, color: Colors.white60, textAlign: 'center', paddingVertical: 24 },
  problem: { marginTop: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', overflow: 'hidden' },
  problemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
  pressed: { opacity: 0.7 },
  dotSmall: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  problemText: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: Colors.white },
  meta: { fontSize: 11, lineHeight: 16, color: Colors.white40, marginTop: 3 },
  countPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill, backgroundColor: 'rgba(255,255,255,0.08)' },
  countText: { fontSize: 11, fontWeight: '800', color: Colors.white80, fontVariant: ['tabular-nums'] },
  problemBody: { paddingHorizontal: 12, paddingBottom: 12, paddingLeft: 30, gap: 6 },
  detailsBox: { maxHeight: 220, padding: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.3)' },
  detailsText: { fontSize: 11, lineHeight: 16, color: Colors.white60 },
  shareText: { fontSize: 13, fontWeight: '700', color: Colors.orange, marginTop: 4 },
})
