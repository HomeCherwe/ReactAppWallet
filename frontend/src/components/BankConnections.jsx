import { useCallback, useEffect, useMemo, useState } from 'react'
import { Landmark, RefreshCw, Search, Unplug, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import ConfirmModal from './ConfirmModal'
import {
  disconnectBankConnection,
  listBankConnections,
  listBankProviders,
  startBankConnection,
  syncBankConnections,
} from '../api/bankConnections'

const COUNTRIES = {
  fr: '🇫🇷 Франція',
  uk: '🇬🇧 Велика Британія',
  de: '🇩🇪 Німеччина',
  es: '🇪🇸 Іспанія',
  nl: '🇳🇱 Нідерланди',
  ie: '🇮🇪 Ірландія',
  be: '🇧🇪 Бельгія',
  it: '🇮🇹 Італія',
  at: '🇦🇹 Австрія',
  pl: '🇵🇱 Польща',
  pt: '🇵🇹 Португалія',
  se: '🇸🇪 Швеція',
  fi: '🇫🇮 Фінляндія',
  lt: '🇱🇹 Литва',
  ee: '🇪🇪 Естонія',
}

const CONNECT_ERRORS = {
  access_denied: 'Доступ не надано в банку',
  exchange_failed: 'Банк не підтвердив підключення. Спробуйте ще раз',
}

function timeAgo(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'щойно'
  if (min < 60) return `${min} хв тому`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} год тому`
  return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
}

// Where the backend sends the user back after the bank login: the current (hash-routed) page
export function returnUrlHere() {
  const [base, hash = '#/'] = window.location.href.split('#')
  return `${base}#${hash.split('?')[0]}`
}

function BankLogo({ src, name, size = 40 }) {
  const [failed, setFailed] = useState(false)
  return (
    <div
      className="rounded-xl bg-white border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {src && !failed ? (
        <img src={src} alt="" className="w-3/4 h-3/4 object-contain" onError={() => setFailed(true)} />
      ) : (
        <span className="font-bold text-orange-500">{(name || '?').charAt(0).toUpperCase()}</span>
      )}
    </div>
  )
}

/** Bank catalog (TrueLayer): country tabs, search, logos. Tapping a bank starts the connection. */
export function ConnectBankCatalog({ active = true, connectedIds = [], defaultCountry }) {
  const [providers, setProviders] = useState(null)
  const [error, setError] = useState(false)
  const [country, setCountry] = useState(defaultCountry || 'fr')
  const [query, setQuery] = useState('')
  const [connectingId, setConnectingId] = useState(null)

  useEffect(() => {
    if (!active || providers) return
    setError(false)
    listBankProviders().then(setProviders).catch(() => setError(true))
  }, [active, providers])

  const countries = useMemo(() => {
    const present = new Set((providers || []).map(p => p.country))
    return Object.keys(COUNTRIES).filter(c => present.has(c))
  }, [providers])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = providers || []
    return q ? list.filter(p => p.name.toLowerCase().includes(q)) : list.filter(p => p.country === country)
  }, [providers, country, query])

  const connect = async (p) => {
    setConnectingId(p.provider_id)
    try {
      // Leaves the page for the bank login; the backend returns the user to the profile page
      window.location.href = await startBankConnection(p.provider_id, returnUrlHere())
    } catch (e) {
      toast.error(`Не вдалося підключити ${p.name}: ${e.message}`)
      setConnectingId(null)
    }
  }

  return (
      <div className="grid gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full border border-gray-300 rounded-xl pl-9 pr-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="Пошук банку"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {!query && countries.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {countries.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setCountry(c)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  c === country
                    ? 'bg-orange-50 border-orange-400 text-orange-700'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {COUNTRIES[c]}
              </button>
            ))}
          </div>
        )}

        <div className="max-h-[50vh] overflow-y-auto -mx-1">
          {error ? (
            <div className="py-8 text-center text-sm text-gray-500">
              Не вдалося завантажити список банків.{' '}
              <button className="text-orange-600 font-medium" onClick={() => setProviders(null)}>
                Спробувати ще раз
              </button>
            </div>
          ) : !providers ? (
            <div className="py-10 flex justify-center">
              <RefreshCw size={20} className="animate-spin text-orange-500" />
            </div>
          ) : visible.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">Нічого не знайдено</div>
          ) : (
            visible.map(p => {
              const connected = connectedIds.includes(p.provider_id)
              return (
                <button
                  key={p.provider_id}
                  type="button"
                  disabled={connected || !!connectingId}
                  onClick={() => connect(p)}
                  className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left hover:bg-gray-50 disabled:hover:bg-transparent disabled:cursor-default"
                >
                  <BankLogo src={p.logo} name={p.name} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{p.name}</div>
                    {query && <div className="text-xs text-gray-500">{COUNTRIES[p.country] || p.country.toUpperCase()}</div>}
                  </div>
                  {connectingId === p.provider_id ? (
                    <RefreshCw size={16} className="animate-spin text-orange-500" />
                  ) : connected ? (
                    <span className="text-xs font-semibold text-green-600">Підключено</span>
                  ) : (
                    <span className="text-gray-400 text-lg">›</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        <p className="text-xs text-gray-400">
          Підключення через TrueLayer (Open Banking). Ви входите у свій банк напряму — застосунок не бачить ваш
          пароль. Доступ лише на читання, діє 90 днів.
        </p>
      </div>
  )
}

/**
 * Cards page block: banks connected through TrueLayer (status, sync, reconnect, disconnect).
 * Also finishes a connection when the user comes back from the bank login.
 * `onChanged` is called when cards/transactions may have changed (to reload the cards list).
 */
export default function BankConnections({ onChanged }) {
  const [connections, setConnections] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [toDisconnect, setToDisconnect] = useState(null)

  const load = useCallback(async () => {
    try {
      setConnections(await listBankConnections())
    } catch (e) {
      console.error('Failed to load bank connections:', e)
      setConnections([])
    }
  }, [])

  const syncOne = useCallback(async (c) => {
    setBusyId(c.id)
    try {
      const { added, results } = await syncBankConnections(c.id)
      const failed = results.find(r => r.error)
      if (failed) throw new Error(failed.error === 'consent_expired' ? 'термін доступу сплив' : failed.error)
      toast.success(added > 0 ? `${c.provider_name}: додано ${added} транзакцій` : `${c.provider_name}: нових транзакцій немає`)
      if (added > 0) onChanged?.()
    } catch (e) {
      toast.error(`${c.provider_name}: ${e.message}`)
    } finally {
      setBusyId(null)
      load()
    }
  }, [load, onChanged])

  // Back from the bank login: ?bank_status=… in the hash query
  useEffect(() => {
    const [path, query] = window.location.hash.split('?')
    if (!query) {
      load()
      return
    }
    const params = new URLSearchParams(query)
    const status = params.get('bank_status')
    if (!status) {
      load()
      return
    }
    // Clean the URL so a reload doesn't repeat the toast
    params.delete('bank_status')
    params.delete('bank_name')
    params.delete('bank_message')
    const rest = params.toString()
    window.history.replaceState({}, document.title, window.location.href.split('#')[0] + path + (rest ? `?${rest}` : ''))

    if (status === 'ok') {
      const name = new URLSearchParams(query).get('bank_name') || 'Банк'
      toast.success(`${name} підключено! Завантажуємо транзакції…`)
      // First sync right away (pulls ~90 days of history)
      load().then(() =>
        syncBankConnections()
          .then(({ added }) => toast.success(added > 0 ? `Додано ${added} транзакцій` : 'Нових транзакцій немає'))
          .catch(e => toast.error(`Синхронізація: ${e.message}`))
          .finally(() => {
            load()
            onChanged?.() // new cards appear on the cards page
          })
      )
    } else {
      const msg = new URLSearchParams(query).get('bank_message') || ''
      toast.error(`Не вдалося підключити банк${msg ? `: ${CONNECT_ERRORS[msg] || msg}` : ''}`)
      load()
    }
  }, [load])

  const reconnect = async (c) => {
    setBusyId(c.id)
    try {
      window.location.href = await startBankConnection(c.provider_id, returnUrlHere())
    } catch (e) {
      toast.error(`Не вдалося підключити ${c.provider_name}: ${e.message}`)
      setBusyId(null)
    }
  }

  const confirmDisconnect = async () => {
    const c = toDisconnect
    setToDisconnect(null)
    setBusyId(c.id)
    try {
      await disconnectBankConnection(c.id)
      toast.success(`${c.provider_name} відключено`)
      await load()
      onChanged?.()
    } catch (e) {
      toast.error(`Не вдалося відключити: ${e.message}`)
    } finally {
      setBusyId(null)
    }
  }

  // Hidden while loading and when nothing is connected (connecting starts from "Додати банк"),
  // so the cards page doesn't jump for users without connected banks
  if (!connections || connections.length === 0) return null

  const banksLabel = (n) => {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return `${n} банк`
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} банки`
    return `${n} банків`
  }

  return (
    // Same card look as the other blocks on the cards page (white, rounded, soft shadow)
    <div className="bg-white rounded-2xl shadow-soft p-4 sm:p-5 mb-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white flex items-center justify-center shadow-sm flex-shrink-0">
            <Landmark size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 leading-tight">Підключені банки</h3>
            <p className="text-xs text-gray-500">Автоматична синхронізація через Open Banking</p>
          </div>
        </div>
        <span className="text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-full whitespace-nowrap">
          {banksLabel(connections.length)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {connections.map(c => {
          const expired = c.status === 'expired'
          const hasError = !expired && !!c.last_error
          const busy = busyId === c.id
          return (
            <div
              key={c.id}
              className={`relative flex items-center gap-3 rounded-xl border p-3 pl-4 transition-colors ${
                expired
                  ? 'border-amber-300 bg-amber-50/60'
                  : hasError
                  ? 'border-red-200 bg-red-50/50'
                  : 'border-gray-200 bg-gray-50/70 hover:border-orange-300 hover:bg-orange-50/40'
              }`}
            >
              {/* Status accent on the left edge */}
              <span
                className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${
                  expired ? 'bg-amber-400' : hasError ? 'bg-red-400' : 'bg-green-500'
                }`}
              />
              <BankLogo src={c.provider_logo} name={c.provider_name} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{c.provider_name}</div>
                <div className={`text-xs truncate ${expired ? 'text-amber-700' : hasError ? 'text-red-600' : 'text-gray-500'}`}>
                  {expired
                    ? 'Доступ (90 днів) сплив'
                    : hasError
                    ? 'Помилка синхронізації'
                    : [c.last_sync_at ? `Синхр. ${timeAgo(c.last_sync_at)}` : 'Ще не синхронізовано',
                        c.accounts?.length ? `рахунків: ${c.accounts.length}` : null].filter(Boolean).join(' · ')}
                </div>
              </div>

              {expired ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => reconnect(c)}
                  title="Підключити знову"
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-60"
                >
                  <AlertTriangle size={13} />
                  Знову
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => syncOne(c)}
                  title="Синхронізувати"
                  className="p-2 rounded-lg text-gray-600 bg-white border border-gray-200 hover:border-orange-300 hover:text-orange-600 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => setToDisconnect(c)}
                title="Відключити"
                className="p-2 rounded-lg text-gray-400 bg-white border border-gray-200 hover:border-red-300 hover:text-red-500 disabled:opacity-50 transition-colors"
              >
                <Unplug size={15} />
              </button>
            </div>
          )
        })}
      </div>

      <ConfirmModal
        open={!!toDisconnect}
        title={toDisconnect ? `Відключити ${toDisconnect.provider_name}?` : ''}
        message="Нові транзакції більше не підтягуватимуться. Картки й уже імпортовані транзакції залишаться."
        confirmLabel="Відключити"
        danger
        onConfirm={confirmDisconnect}
        onCancel={() => setToDisconnect(null)}
      />
    </div>
  )
}
