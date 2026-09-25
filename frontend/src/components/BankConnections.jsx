import { useCallback, useEffect, useMemo, useState } from 'react'
import { Landmark, Plus, RefreshCw, Search, Unplug, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import BaseModal from './BaseModal'
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

// Where the backend sends the user back after the bank login (hash-routed profile page)
function profileReturnUrl() {
  return window.location.href.split('#')[0] + '#/profile'
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

function AddBankModal({ open, onClose, connectedIds, defaultCountry }) {
  const [providers, setProviders] = useState(null)
  const [error, setError] = useState(false)
  const [country, setCountry] = useState(defaultCountry || 'fr')
  const [query, setQuery] = useState('')
  const [connectingId, setConnectingId] = useState(null)

  useEffect(() => {
    if (!open || providers) return
    setError(false)
    listBankProviders().then(setProviders).catch(() => setError(true))
  }, [open, providers])

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
      window.location.href = await startBankConnection(p.provider_id, profileReturnUrl())
    } catch (e) {
      toast.error(`Не вдалося підключити ${p.name}: ${e.message}`)
      setConnectingId(null)
    }
  }

  return (
    <BaseModal open={open} onClose={onClose} title="Додати банк" maxWidth="lg">
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
    </BaseModal>
  )
}

/** Profile section: banks connected through TrueLayer. */
export default function BankConnections() {
  const [connections, setConnections] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
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
    } catch (e) {
      toast.error(`${c.provider_name}: ${e.message}`)
    } finally {
      setBusyId(null)
      load()
    }
  }, [load])

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
          .finally(load)
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
      window.location.href = await startBankConnection(c.provider_id, profileReturnUrl())
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
    } catch (e) {
      toast.error(`Не вдалося відключити: ${e.message}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="pt-6 border-t border-gray-200">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Landmark size={20} className="text-orange-500" />
          <h3 className="text-lg font-semibold text-gray-900">Банки</h3>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus size={16} />
          Додати банк
        </button>
      </div>

      <div className="bg-gray-50 rounded-lg p-2">
        {connections === null ? (
          <div className="py-6 flex justify-center">
            <RefreshCw size={18} className="animate-spin text-orange-500" />
          </div>
        ) : connections.length === 0 ? (
          <p className="text-sm text-gray-600 px-2 py-4">
            Підключіть банк через TrueLayer — нові транзакції підтягуватимуться автоматично. Доступні Revolut, Wise,
            BNP Paribas, Société Générale, Monzo та інші.
          </p>
        ) : (
          connections.map(c => {
            const expired = c.status === 'expired'
            return (
              <div key={c.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3 mb-2 last:mb-0">
                <BankLogo src={c.provider_logo} name={c.provider_name} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{c.provider_name}</div>
                  <div className={`text-xs ${expired ? 'text-amber-700' : c.last_error ? 'text-red-600' : 'text-gray-500'}`}>
                    {expired
                      ? 'Термін доступу (90 днів) сплив — підключіть знову'
                      : c.last_error
                      ? 'Помилка останньої синхронізації'
                      : [c.last_sync_at ? `Синхронізовано ${timeAgo(c.last_sync_at)}` : 'Ще не синхронізовано',
                          c.accounts?.length ? `рахунків: ${c.accounts.length}` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {expired ? (
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => reconnect(c)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-md"
                  >
                    <AlertTriangle size={14} />
                    Підключити знову
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => syncOne(c)}
                    title="Синхронізувати"
                    className="p-2 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={busyId === c.id ? 'animate-spin' : ''} />
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => setToDisconnect(c)}
                  title="Відключити"
                  className="p-2 rounded-md text-red-500 hover:bg-red-50 disabled:opacity-50"
                >
                  <Unplug size={16} />
                </button>
              </div>
            )
          })
        )}
      </div>

      <AddBankModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        connectedIds={(connections || []).filter(c => c.status === 'active').map(c => c.provider_id)}
        defaultCountry={connections?.[0]?.country || 'fr'}
      />

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
