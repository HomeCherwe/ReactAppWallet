import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronRight, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchIsAdmin, getAdminHealth, getAdminLogs } from '../api/admin'

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
const SOURCE_LABEL = { server: 'Сервер', web: 'Сайт', ios: 'iPhone' }
const STATE_COLOR = { ok: '#34C759', warn: '#FF8C3A', fail: '#FF6B6B' }

function timeAgo(iso) {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'щойно'
  if (min < 60) return `${min} хв тому`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} год тому`
  return `${Math.round(h / 24)} дн тому`
}

const chip = active =>
  `px-3 h-8 rounded-full text-xs font-bold border transition-colors ${
    active ? 'bg-brand/15 border-brand/50 text-white' : 'bg-white/[0.04] border-white/10 text-white/60 hover:bg-white/[0.08]'
  }`

const card = 'rounded-3xl bg-gradient-to-b from-white/[0.075] to-white/[0.025] backdrop-blur-xl shadow-glass border border-white/10'

/** One problem: how often and where; a click opens the latest example */
function ProblemRow({ group }) {
  const [open, setOpen] = useState(false)
  const isError = group.level === 'error'

  const copy = async e => {
    e.stopPropagation()
    const text = [group.message, group.path, group.status && `status ${group.status}`, group.details].filter(Boolean).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Скопійовано')
    } catch {
      toast.error('Не вдалося скопіювати')
    }
  }

  return (
    <div className="rounded-2xl bg-white/[0.035] overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)} className="w-full flex items-start gap-3 p-3 text-left hover:bg-white/[0.05] transition-colors">
        <span className="h-2 w-2 mt-1.5 rounded-full shrink-0" style={{ background: isError ? STATE_COLOR.fail : STATE_COLOR.warn }} />
        <span className="flex-1 min-w-0">
          <span className={`block text-[13px] font-semibold text-white break-words ${open ? '' : 'line-clamp-2'}`}>{group.message}</span>
          <span className="block mt-1 text-[11px] text-white/45 truncate">
            {[
              SOURCE_LABEL[group.source] || group.source,
              timeAgo(group.last_at),
              group.path,
              group.status && `код ${group.status}`,
              group.mine ? 'у тебе' : group.users > 0 ? `людей: ${group.users}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span className="shrink-0 flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-full bg-white/[0.08] text-[11px] font-bold tabular-nums text-white/80">×{group.count}</span>
          {open ? <ChevronDown size={16} className="text-white/35" /> : <ChevronRight size={16} className="text-white/35" />}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 pl-8">
          {group.details && (
            <pre className="p-2.5 rounded-xl bg-black/30 text-[11px] leading-relaxed text-white/60 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{group.details}</pre>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/40">
            <span>
              Вперше: {new Date(group.first_at).toLocaleString('uk-UA')} · Востаннє: {new Date(group.last_at).toLocaleString('uk-UA')}
              {group.app_version ? ` · версія ${group.app_version}` : ''}
            </span>
            <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 font-semibold text-white/60 hover:text-white">
              <Copy size={12} />
              Скопіювати
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * «Адмінка» (only the owner): is everything the project depends on working right now, and what went
 * wrong lately on the server, the site and the iPhone app.
 */
export default function AdminPage() {
  const [allowed, setAllowed] = useState(null)
  const [hours, setHours] = useState(24)
  const [source, setSource] = useState('all')
  const [withWarnings, setWithWarnings] = useState(false)
  const [logs, setLogs] = useState(null)
  const [logsError, setLogsError] = useState(null)
  const [health, setHealth] = useState(null)
  const [healthError, setHealthError] = useState(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    fetchIsAdmin().then(setAllowed)
  }, [])

  const loadLogs = useCallback(async () => {
    setLogsError(null)
    try {
      setLogs(await getAdminLogs(hours))
    } catch (e) {
      setLogs(null)
      setLogsError(e.message)
    }
  }, [hours])

  const loadHealth = useCallback(async () => {
    setChecking(true)
    setHealthError(null)
    try {
      setHealth(await getAdminHealth())
    } catch (e) {
      setHealthError(e.message)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    if (allowed) loadLogs()
  }, [allowed, loadLogs])
  useEffect(() => {
    if (allowed) loadHealth()
  }, [allowed, loadHealth])

  const groups = useMemo(
    () => (logs?.groups || []).filter(g => (source === 'all' || g.source === source) && (withWarnings || g.level === 'error')),
    [logs, source, withWarnings]
  )
  const errorCount = groups.filter(g => g.level === 'error').reduce((s, g) => s + g.count, 0)
  const brokenBanks = (health?.banks || []).filter(b => b.problem)

  if (allowed === false) return <Navigate to="/" replace />
  if (allowed === null) {
    return (
      <div className="py-16 grid place-items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
      </div>
    )
  }

  const refresh = () => {
    loadLogs()
    loadHealth()
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <h1 className="text-[28px] font-bold tracking-tight">Адмінка</h1>
        <button
          type="button"
          disabled={checking}
          onClick={refresh}
          className="inline-flex items-center gap-2 px-3.5 h-10 rounded-full text-sm font-semibold bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] disabled:opacity-60 transition-colors"
        >
          <RefreshCw size={15} className={checking ? 'animate-spin' : ''} />
          Оновити
        </button>
      </div>

      {/* Right now */}
      <section className={`${card} p-4`}>
        <h2 className="text-sm font-semibold text-white/60 mb-3">Стан зараз</h2>
        {healthError ? (
          <div className="text-sm text-[#FF6B6B]">Не вдалося перевірити: {healthError}</div>
        ) : !health ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-12 rounded-2xl bg-white/[0.05] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {health.checks.map(c => (
              <div key={c.key} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.035]">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: STATE_COLOR[c.state] }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-white">{c.label}</span>
                  <span className="block text-xs mt-0.5 break-words" style={{ color: c.state === 'ok' ? 'rgba(255,255,255,0.5)' : STATE_COLOR[c.state] }}>
                    {c.text}
                  </span>
                </span>
                {c.link && (
                  <a
                    href={c.link}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-brand text-white text-xs font-bold hover:brightness-110"
                  >
                    {c.linkLabel}
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            ))}
            {brokenBanks.map((b, i) => (
              <div key={`${b.provider}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 ml-5 rounded-xl text-xs text-white/60">
                <span className="font-semibold text-white/80">{b.provider}</span>
                <span className="text-white/40">{b.mine ? 'твій' : 'інший користувач'}</span>
                <span className="min-w-0 break-words text-[#FF8C3A]">{b.problem}</span>
              </div>
            ))}
            {health.deploy?.commit && (
              <div className="pt-1.5 px-1 text-[11px] text-white/35">
                Сервер: версія {health.deploy.commit}
                {health.deploy.region ? ` · ${health.deploy.region}` : ''}
              </div>
            )}
          </div>
        )}
      </section>

      {/* What went wrong */}
      <section className={`${card} p-4`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-white/60">Помилки</h2>
          {logs && (
            <span className="text-xs text-white/45 tabular-nums">
              Помилок: {errorCount} · різних: {groups.length}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {PERIODS.map(p => (
            <button key={p.hours} type="button" onClick={() => setHours(p.hours)} className={chip(hours === p.hours)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {SOURCES.map(s => (
            <button key={s.key} type="button" onClick={() => setSource(s.key)} className={chip(source === s.key)}>
              {s.label}
            </button>
          ))}
          <button type="button" onClick={() => setWithWarnings(v => !v)} className={chip(withWarnings)}>
            Попередження
          </button>
        </div>

        {logsError ? (
          <div className="text-sm text-[#FF6B6B]">Журнал не завантажився: {logsError}</div>
        ) : !logs ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-14 rounded-2xl bg-white/[0.05] animate-pulse" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="py-8 text-center text-sm text-white/50">✓ За цей період помилок немає</div>
        ) : (
          <div className="space-y-1.5">
            {groups.map(g => (
              <ProblemRow key={g.fingerprint} group={g} />
            ))}
          </div>
        )}
        {logs?.truncated && <p className="mt-2 text-[11px] text-white/40">Показано лише найновіші записи — виберіть менший період.</p>}
      </section>
    </motion.div>
  )
}
