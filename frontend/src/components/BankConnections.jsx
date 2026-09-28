import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, ExternalLink, Eye, EyeOff, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import BaseModal from './BaseModal'
import ConfirmModal from './ConfirmModal'
import { txBus } from '../utils/txBus'
import { useSettingsStore } from '../store/useSettingsStore'
import { formatMoney } from '../utils/cardTheme'
import {
  connectBankWithToken,
  disconnectBankConnection,
  linkBankAccountToCard,
  listBankConnections,
  listBankProviders,
  startBankConnection,
  syncBankConnections,
} from '../api/bankConnections'
import { connectBinance, disconnectBinance, isBinanceConnected, syncBinance } from '../api/binance'

const COUNTRIES = {
  fr: '🇫🇷 Франція',
  ua: '🇺🇦 Україна',
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
  crypto: '🪙 Крипто',
}

// Crypto exchanges sit in the same catalog under the "Крипто" tab
const BINANCE = { provider_id: 'binance', name: 'Binance', country: 'crypto', auth: 'binance' }

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
      className="rounded-xl bg-surface/90 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {src && !failed ? (
        <img src={src} alt="" className="w-3/4 h-3/4 object-contain" onError={() => setFailed(true)} />
      ) : (
        <span className="font-bold text-orange-400">{(name || '?').charAt(0).toUpperCase()}</span>
      )}
    </div>
  )
}

// Fired after a bank was connected without leaving the page (token banks like Monobank)
export const BANK_CONNECTED_EVENT = 'bank-connected'
// Fired when Binance was connected or disconnected ({ detail: { connected } })
export const CRYPTO_CHANGED_EVENT = 'crypto-changed'

function BinanceMark({ size = 40 }) {
  return (
    <div
      className="rounded-xl bg-[#1E2026] border border-white/10 flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} fill="#F0B90B" aria-hidden="true">
        <path d="M16.624 13.9202l2.7175 2.7154-7.353 7.353-7.353-7.352 2.7175-2.7164 4.6355 4.6595 4.6356-4.6595zm4.6366-4.6366L24 12l-2.7154 2.7164L18.5682 12l2.6924-2.7164zm-9.272.001l2.7163 2.6914-2.7164 2.7174v-.001L9.2721 12l2.7164-2.7154zm-9.2722-.001L5.4088 12l-2.6914 2.6924L0 12l2.7164-2.7164zM11.9885.0115l7.353 7.329-2.7174 2.7154-4.6356-4.6356-4.6355 4.6595-2.7174-2.7154 7.353-7.353z" />
      </svg>
    </div>
  )
}

/** Binance: a read-only API key; the balance goes into the "Binance · Spot" card */
function BinanceConnectForm({ connected, onBack, onChanged }) {
  const [apiKey, setApiKey] = useState('')
  const [secret, setSecret] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!apiKey.trim() || !secret.trim()) return
    setBusy(true)
    try {
      await connectBinance(apiKey.trim(), secret.trim())
      setApiKey('')
      setSecret('')
      toast.success('Binance підключено! Баланс з’явиться на картці Binance')
      onChanged(true)
    } catch (err) {
      toast.error(`Binance: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    try {
      await disconnectBinance()
      toast.success('Binance відключено. Картка й історія залишились')
      onChanged(false)
    } catch (err) {
      toast.error(`Не вдалося відключити Binance: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const steps = [
    <>
      Відкрийте в Binance{' '}
      <a
        href="https://www.binance.com/uk-UA/my/settings/api-management"
        target="_blank"
        rel="noreferrer"
        className="text-orange-400 font-medium inline-flex items-center gap-0.5 hover:underline"
      >
        Профіль → API Management <ExternalLink size={12} />
      </a>
    </>,
    <>Натисніть <b>Create API</b> → <b>System generated</b>, назвіть ключ (наприклад, MyWallet) і пройдіть перевірку</>,
    <>Залиште увімкненим лише <b>Enable Reading</b> — без торгівлі й виведення коштів</>,
    <>Скопіюйте <b>API Key</b> і <b>Secret Key</b> і вставте нижче. Secret показується тільки один раз</>,
  ]

  const input = 'w-full border border-white/[0.14] rounded-xl px-3 py-2.5 font-mono text-sm focus:ring-2 focus:ring-orange-400 outline-none'

  return (
    <form onSubmit={submit} className="grid gap-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-white/55 hover:text-white w-fit"
      >
        <ArrowLeft size={15} /> Назад
      </button>

      <div className="flex items-center gap-3">
        <BinanceMark size={48} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white">Binance</div>
          <div className="text-xs text-white/55">Криптобіржа · API-ключ лише для читання</div>
        </div>
        {connected && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-400">
            <CheckCircle2 size={14} /> Підключено
          </span>
        )}
      </div>

      <ol className="grid gap-2 text-sm text-white/85">
        {steps.map((text, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="w-5 h-5 rounded-full bg-orange-500/15 text-orange-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-2">
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          className={input}
          placeholder="API Key"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
        />
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            className={`${input} pr-10`}
            placeholder="Secret Key"
            value={secret}
            onChange={e => setSecret(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/85"
            title={show ? 'Сховати' : 'Показати'}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={busy || !apiKey.trim() || !secret.trim()}
        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold shadow-sm hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy && <RefreshCw size={16} className="animate-spin" />}
        {busy ? 'Перевіряємо ключ…' : connected ? 'Оновити ключі' : 'Підключити Binance'}
      </button>

      {connected && (
        <button
          type="button"
          disabled={busy}
          onClick={disconnect}
          className="w-full py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-[#FF453A] font-semibold hover:bg-white/[0.08] disabled:opacity-50"
        >
          Відключити Binance
        </button>
      )}

      <p className="text-xs text-white/40 flex gap-1.5">
        <ShieldCheck size={14} className="flex-shrink-0 mt-px" />
        Ключ лише для читання: застосунок бачить тільки баланс і не може торгувати чи виводити кошти. Видалити ключ можна
        будь-коли в Binance → API Management.
      </p>
    </form>
  )
}

/** Monobank: connected with a personal token from api.monobank.ua (read-only: balance and statement). */
function TokenConnectForm({ provider, onBack, onDone }) {
  const [token, setToken] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!token.trim()) return
    setBusy(true)
    try {
      const res = await connectBankWithToken(provider.provider_id, token.trim())
      setToken('')
      onDone(res?.bank_name || provider.name)
    } catch (err) {
      toast.error(`Не вдалося підключити ${provider.name}: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const steps = [
    <>
      Відкрийте{' '}
      <a
        href="https://api.monobank.ua/"
        target="_blank"
        rel="noreferrer"
        className="text-orange-400 font-medium inline-flex items-center gap-0.5 hover:underline"
      >
        api.monobank.ua <ExternalLink size={12} />
      </a>
    </>,
    'Відскануйте QR-код у застосунку Monobank і підтвердьте вхід',
    'Скопіюйте токен і вставте його нижче',
  ]

  return (
    <form onSubmit={submit} className="grid gap-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-white/55 hover:text-white w-fit"
      >
        <ArrowLeft size={15} /> Назад
      </button>

      <div className="flex items-center gap-3">
        <BankLogo src={provider.logo} name={provider.name} size={48} />
        <div>
          <div className="font-semibold text-white">{provider.name}</div>
          <div className="text-xs text-white/55">🇺🇦 Підключення через персональний токен</div>
        </div>
      </div>

      <ol className="grid gap-2 text-sm text-white/85">
        {steps.map((text, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="w-5 h-5 rounded-full bg-orange-500/15 text-orange-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ol>

      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          className="w-full border border-white/[0.14] rounded-xl px-3 py-2.5 pr-10 font-mono text-sm focus:ring-2 focus:ring-orange-400 outline-none"
          placeholder="Токен Monobank"
          value={token}
          onChange={e => setToken(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/85"
          title={show ? 'Сховати' : 'Показати'}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      <button
        type="submit"
        disabled={busy || !token.trim()}
        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold shadow-sm hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy && <RefreshCw size={16} className="animate-spin" />}
        {busy ? 'Підключаємо…' : `Підключити ${provider.name}`}
      </button>

      <p className="text-xs text-white/40 flex gap-1.5">
        <ShieldCheck size={14} className="flex-shrink-0 mt-px" />
        Токен дає доступ лише на читання — баланс і виписка, жодних платежів. Зберігається зашифрованим; відкликати
        можна будь-коли на api.monobank.ua.
      </p>
    </form>
  )
}

/** Bank catalog (TrueLayer + Monobank): country tabs, search, logos. Tapping a bank starts the connection. */
export function ConnectBankCatalog({ active = true, connectedIds = [], defaultCountry, onConnected, onFormOpenChange }) {
  const [providers, setProviders] = useState(null)
  const [error, setError] = useState(false)
  const [country, setCountry] = useState(defaultCountry || 'fr')
  const [query, setQuery] = useState('')
  const [connectingId, setConnectingId] = useState(null)
  const [tokenProvider, setTokenProvider] = useState(null)
  const [binanceOpen, setBinanceOpen] = useState(false)
  const [binanceConnected, setBinanceConnected] = useState(false)

  useEffect(() => {
    if (!active) {
      setTokenProvider(null)
      setBinanceOpen(false)
      return
    }
    isBinanceConnected().then(setBinanceConnected)
  }, [active])

  // A connect form has its own "Назад", so the modal can hide its one
  const formOpen = binanceOpen || !!tokenProvider
  useEffect(() => {
    onFormOpenChange?.(formOpen)
  }, [formOpen, onFormOpenChange])

  useEffect(() => {
    if (!active || providers) return
    setError(false)
    listBankProviders().then(setProviders).catch(() => setError(true))
  }, [active, providers])

  const countries = useMemo(() => {
    const present = new Set([...(providers || []).map(p => p.country), 'crypto'])
    return Object.keys(COUNTRIES).filter(c => present.has(c))
  }, [providers])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...(providers || []), BINANCE]
    return q ? list.filter(p => p.name.toLowerCase().includes(q)) : list.filter(p => p.country === country)
  }, [providers, country, query])
  // The crypto tab doesn't need the bank list from the server
  const waitsForProviders = query.trim() !== '' || country !== 'crypto'

  const connect = async (p) => {
    if (p.auth === 'binance') {
      setBinanceOpen(true)
      return
    }
    if (p.auth === 'token') {
      setTokenProvider(p)
      return
    }
    setConnectingId(p.provider_id)
    try {
      // Leaves the page for the bank login; the backend returns the user to the profile page
      window.location.href = await startBankConnection(p.provider_id, returnUrlHere())
    } catch (e) {
      toast.error(`Не вдалося підключити ${p.name}: ${e.message}`)
      setConnectingId(null)
    }
  }

  if (binanceOpen) {
    return (
      <BinanceConnectForm
        connected={binanceConnected}
        onBack={() => setBinanceOpen(false)}
        onChanged={(connected) => {
          setBinanceOpen(false)
          setBinanceConnected(connected)
          window.dispatchEvent(new CustomEvent(CRYPTO_CHANGED_EVENT, { detail: { connected } }))
          if (connected) onConnected?.('Binance')
        }}
      />
    )
  }

  if (tokenProvider) {
    return (
      <TokenConnectForm
        provider={tokenProvider}
        onBack={() => setTokenProvider(null)}
        onDone={(name) => {
          setTokenProvider(null)
          window.dispatchEvent(new CustomEvent(BANK_CONNECTED_EVENT, { detail: { name } }))
          onConnected?.(name)
        }}
      />
    )
  }

  return (
      <div className="grid gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            className="w-full border border-white/[0.14] rounded-xl pl-9 pr-3 py-2 focus:ring-2 focus:ring-brand outline-none"
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
                    ? 'bg-orange-500/10 border-orange-400 text-orange-300'
                    : 'bg-white/[0.03] border-white/10 text-white/85 hover:bg-white/[0.06]'
                }`}
              >
                {COUNTRIES[c]}
              </button>
            ))}
          </div>
        )}

        <div className="max-h-[50vh] overflow-y-auto -mx-1">
          {error && waitsForProviders ? (
            <div className="py-8 text-center text-sm text-white/55">
              Не вдалося завантажити список банків.{' '}
              <button className="text-orange-400 font-medium" onClick={() => setProviders(null)}>
                Спробувати ще раз
              </button>
            </div>
          ) : !providers && waitsForProviders ? (
            <div className="py-10 flex justify-center">
              <RefreshCw size={20} className="animate-spin text-orange-400" />
            </div>
          ) : visible.length === 0 ? (
            <div className="py-8 text-center text-sm text-white/55">Нічого не знайдено</div>
          ) : (
            visible.map(p => {
              const isBinance = p.auth === 'binance'
              const connected = isBinance ? binanceConnected : connectedIds.includes(p.provider_id)
              return (
                <button
                  key={p.provider_id}
                  type="button"
                  // Binance stays clickable when connected: that's where its keys are changed or removed
                  disabled={(connected && !isBinance) || !!connectingId}
                  onClick={() => connect(p)}
                  className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left hover:bg-white/[0.03] disabled:hover:bg-transparent disabled:cursor-default"
                >
                  {isBinance ? <BinanceMark /> : <BankLogo src={p.logo} name={p.name} />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate">{p.name}</div>
                    {(query || p.auth === 'token' || isBinance) && (
                      <div className="text-xs text-white/55">
                        {[
                          query && (COUNTRIES[p.country] || p.country.toUpperCase()),
                          p.auth === 'token' && 'через токен api.monobank.ua',
                          isBinance && 'API-ключ лише для читання',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                  </div>
                  {connectingId === p.provider_id ? (
                    <RefreshCw size={16} className="animate-spin text-orange-400" />
                  ) : connected ? (
                    <span className="text-xs font-semibold text-green-400">Підключено</span>
                  ) : (
                    <span className="text-white/40 text-lg">›</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        <p className="text-xs text-white/40">
          {country === 'crypto' && !query
            ? 'Binance підключається через API-ключ лише для читання — застосунок бачить тільки баланс, він з’являється на картці Binance.'
            : country === 'ua' && !query
            ? 'Monobank підключається через персональний токен — лише читання, без терміну дії.'
            : 'Підключення через TrueLayer (Open Banking). Ви входите у свій банк напряму — застосунок не бачить ваш пароль. Доступ лише на читання, діє 90 днів.'}
        </p>
      </div>
  )
}

function accountsLabel(n) {
  if (n === 0) return ''
  const mod10 = n % 10
  const mod100 = n % 100
  const word = mod10 === 1 && mod100 !== 11 ? 'рахунок' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'рахунки' : 'рахунків'
  return `${n} ${word}`
}

// Status under a bank's name (same wording as the iPhone)
function statusLine(c) {
  if (c.auth === 'binance') return { text: 'Криптобіржа · баланс через API', color: 'rgba(255,255,255,0.55)' }
  if (c.status === 'expired') {
    return {
      text: c.auth === 'token' ? 'Токен відкликано — підключіть знову' : 'Термін доступу сплив — підключіть знову',
      color: '#FF8C3A',
    }
  }
  if (c.last_error) return { text: 'Помилка останньої синхронізації', color: '#FF6B6B' }
  const parts = [c.last_sync_at ? `Синхронізовано ${timeAgo(c.last_sync_at)}` : 'Ще не синхронізовано', accountsLabel(c.accounts?.length || 0)]
  return { text: parts.filter(Boolean).join(' · '), color: 'rgba(255,255,255,0.55)' }
}

const fmtBalance = (v, currency) => `${v < 0 ? '−' : ''}${formatMoney(v, currency)}`

/** Tap on a connected bank: which accounts it brings in, their cards and balances (iPhone BankAccountsSheet). */
function BankAccountsModal({ connection, cards, balances, busy, onClose, onSync, onReconnect, onDisconnect, onOpenCard, onLinkCard }) {
  const [linking, setLinking] = useState(null) // account being linked to one of the cards
  const [confirmLink, setConfirmLink] = useState(null) // card picked for it
  const [linkBusy, setLinkBusy] = useState(false)
  useEffect(() => {
    setLinking(null)
    setConfirmLink(null)
  }, [connection?.id])

  // Keep showing the last bank while the modal closes
  const last = useRef(null)
  if (connection) last.current = connection
  const c = connection || last.current
  if (!c) return null

  const cardsById = Object.fromEntries(cards.map(card => [card.id, card]))
  const balanceOf = (card) => balances[card.id] ?? Number(card.initial_balance || 0)
  const status = statusLine(c)
  const expired = c.status === 'expired'
  const accountLabel = (a) => a.display_name || (a.kind === 'card' ? 'Картка' : 'Рахунок')
  // Accounts with a card first; the ones without a card yet after
  const accounts = [...(c.accounts || [])].sort((a, b) => Number(!!b.card_id) - Number(!!a.card_id))

  const group = 'rounded-[18px] overflow-hidden border border-white/[0.08] bg-white/[0.05] divide-y divide-white/10'
  const row = 'w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/[0.05] disabled:hover:bg-transparent'
  const iconTile = (active) =>
    `h-[38px] w-[38px] shrink-0 rounded-xl grid place-items-center text-lg ${active ? 'bg-brand/[0.14]' : 'bg-white/[0.06] opacity-60'}`

  const logo = c.auth === 'binance' ? <BinanceMark size={48} /> : <BankLogo src={c.provider_logo} name={c.provider_name} size={48} />

  let body
  if (linking) {
    // Cards already filled by this bank's other accounts can't take a second one; same currency first
    const taken = new Set((c.accounts || []).map(a => a.card_id).filter(Boolean))
    const options = cards
      .filter(card => !taken.has(card.id))
      .sort((x, y) => Number(y.currency === linking.currency) - Number(x.currency === linking.currency) || String(x.name).localeCompare(String(y.name)))
    body = (
      <>
        <button type="button" onClick={() => setLinking(null)} className="text-[15px] font-semibold text-brand mb-1">
          ‹ Назад
        </button>
        <div className="mb-3">
          <div className="text-[17px] font-extrabold text-white">Прив’язати до картки</div>
          <div className="text-xs text-white/45 mt-0.5">{c.provider_name} · {accountLabel(linking)}</div>
        </div>
        {options.length === 0 ? (
          <div className="py-6 text-center text-sm text-white/55">Немає вільних карток. Створіть картку через «+ Додати».</div>
        ) : (
          <div className={`${group} max-h-[50vh] overflow-y-auto`}>
            {options.map(card => {
              const sameCur = card.currency === linking.currency
              return (
                <button key={card.id} type="button" disabled={linkBusy} onClick={() => setConfirmLink(card)} className={row}>
                  <span className={iconTile(sameCur)}>💳</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-bold text-white truncate">{card.name}</span>
                    <span className={`block text-xs truncate mt-0.5 ${sameCur ? 'text-white/45' : 'text-[#FF8C3A]'}`}>
                      {[card.bank, sameCur ? card.currency : `${card.currency} ≠ ${linking.currency}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="text-[15px] font-bold tabular-nums text-white">{fmtBalance(balanceOf(card), card.currency)}</span>
                </button>
              )
            })}
          </div>
        )}
      </>
    )
  } else {
    body = (
      <>
        <div className="text-xs font-bold uppercase tracking-[0.04em] text-white/60 mb-2 px-1">Рахунки · {accounts.length}</div>
        {accounts.length === 0 ? (
          <div className="py-6 text-center text-sm text-white/55">Рахунки з’являться після першої синхронізації</div>
        ) : (
          <div className={`${group} max-h-[45vh] overflow-y-auto`}>
            {accounts.map(a => {
              const card = a.card_id ? cardsById[a.card_id] : null
              const bal = card ? balanceOf(card) : null
              return (
                <button
                  key={a.account_id}
                  type="button"
                  disabled={card ? !onOpenCard : !onLinkCard || c.auth === 'binance'}
                  onClick={() => (card ? onOpenCard(card) : setLinking(a))}
                  className={row}
                >
                  <span className={iconTile(!!card)}>{a.kind === 'card' ? '💳' : '🏦'}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-bold text-white truncate">{card?.name || accountLabel(a)}</span>
                    <span className="block text-xs text-white/45 truncate mt-0.5">
                      {card
                        ? [a.display_name && a.display_name !== card.name ? a.display_name : null, a.currency].filter(Boolean).join(' · ')
                        : `${a.currency ?? ''} · картку ще не створено`}
                    </span>
                  </span>
                  {!card && onLinkCard && c.auth !== 'binance' && (
                    <span className="px-2.5 py-1 rounded-full bg-brand/[0.16] text-xs font-bold text-brand">Прив’язати</span>
                  )}
                  {bal != null && (
                    <span className="flex items-center gap-1.5">
                      <span className={`text-[15px] font-bold tabular-nums ${bal < 0 ? 'text-[#FF6B6B]' : 'text-white'}`}>
                        {fmtBalance(bal, card?.currency || a.currency)}
                      </span>
                      <span className="text-xl leading-none text-white/35">›</span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        <div className="grid gap-2.5 mt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => (expired ? onReconnect(c) : onSync(c))}
            className="h-[50px] rounded-2xl bg-brand text-white text-base font-extrabold flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-75"
          >
            {busy ? <RefreshCw size={18} className="animate-spin" /> : expired ? '🔑 Підключити знову' : '🔄 Синхронізувати зараз'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDisconnect(c)}
            className="h-[46px] rounded-2xl bg-red-500/[0.12] text-[#FF6B6B] text-[15px] font-bold hover:bg-red-500/[0.18] disabled:opacity-75"
          >
            {c.auth === 'binance' ? 'Відключити Binance' : 'Відключити банк'}
          </button>
        </div>
      </>
    )
  }

  return (
    <BaseModal
      open={!!connection}
      onClose={onClose}
      maxWidth="md"
      zIndex={100}
      title={
        <div className="flex items-center gap-3 min-w-0">
          {logo}
          <div className="min-w-0">
            <div className="text-xl font-extrabold text-white truncate">{c.provider_name}</div>
            <div className="text-xs mt-0.5 line-clamp-2" style={{ color: status.color }}>{status.text}</div>
          </div>
        </div>
      }
    >
      {body}
      <ConfirmModal
        open={!!confirmLink}
        title={confirmLink ? `Прив’язати до «${confirmLink.name}»?` : ''}
        message={
          linking && confirmLink
            ? `Транзакції рахунку «${accountLabel(linking)}» підтягуватимуться в цю картку. Якщо ви вже вносили їх вручну, можуть з’явитися дублікати.`
            : ''
        }
        confirmLabel="Прив’язати"
        onCancel={() => setConfirmLink(null)}
        onConfirm={async () => {
          const card = confirmLink
          setConfirmLink(null)
          setLinkBusy(true)
          try {
            await onLinkCard(c, linking.account_id, card)
            setLinking(null)
          } catch {
            // the toast explains it; stay on the picker
          } finally {
            setLinkBusy(false)
          }
        }}
      />
    </BaseModal>
  )
}

/**
 * Cards page: "🔄 Підключені банки" like on the iPhone — one row per bank (TrueLayer, Monobank, Binance);
 * a tap opens the bank's accounts and the cards they fill. Also finishes a connection when the user
 * comes back from the bank login. `onChanged` is called when cards/transactions may have changed.
 */
export default function BankConnections({ onChanged, reloadKey = 0, cards = [], balances = {}, onOpenCard }) {
  const [connections, setConnections] = useState(null)
  const [binance, setBinance] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [toDisconnect, setToDisconnect] = useState(null)
  const [reconnectToken, setReconnectToken] = useState(null)

  const load = useCallback(async () => {
    isBinanceConnected().then(setBinance)
    try {
      setConnections(await listBankConnections())
    } catch (e) {
      console.error('Failed to load bank connections:', e)
      setConnections([])
    }
  }, [])

  useEffect(() => {
    if (reloadKey) load()
  }, [reloadKey, load])

  const syncBinanceNow = useCallback(async () => {
    setBusyId('binance')
    try {
      const res = await syncBinance()
      toast.success(res?.synced ? 'Binance: баланс оновлено' : 'Binance: змін немає')
      if (res?.synced) {
        onChanged?.()
        txBus.emit({ type: 'SYNC' })
      }
    } catch (e) {
      toast.error(`Binance: ${e.message}`)
    } finally {
      setBusyId(null)
    }
  }, [onChanged])

  // Binance connected or disconnected from the "Додати" catalog
  useEffect(() => {
    const onCrypto = (e) => {
      setBinance(!!e.detail?.connected)
      if (e.detail?.connected) {
        onChanged?.() // the Binance card may be new
        txBus.emit({ type: 'SYNC' })
      }
    }
    window.addEventListener(CRYPTO_CHANGED_EVENT, onCrypto)
    return () => window.removeEventListener(CRYPTO_CHANGED_EVENT, onCrypto)
  }, [onChanged])

  const syncOne = useCallback(async (c) => {
    if (c.auth === 'binance') return syncBinanceNow()
    setBusyId(c.id)
    try {
      const { added, changed, results } = await syncBankConnections(c.id)
      const failed = results.find(r => r.error)
      if (failed) throw new Error(failed.error === 'consent_expired' ? 'термін доступу сплив' : failed.error)
      toast.success(added > 0 ? `${c.provider_name}: +${added}` : `${c.provider_name}: нових транзакцій немає`)
      if (added > 0 || changed > 0) onChanged?.()
    } catch (e) {
      toast.error(`Не вдалося синхронізувати ${c.provider_name}: ${e.message}`)
    } finally {
      setBusyId(null)
      load()
    }
  }, [load, onChanged, syncBinanceNow])

  // Just connected: first sync right away (pulls the history), then refresh the lists
  const afterConnected = useCallback((name) => {
    toast.success(`${name} підключено! Завантажуємо транзакції…`)
    // The backend pinned "<Bank> Sync" (Налаштування → Закріплені категорії)
    useSettingsStore.getState().refreshFromDatabase()
    load().then(() =>
      syncBankConnections()
        .then(({ added }) => toast.success(added > 0 ? `Додано ${added} транзакцій` : 'Нових транзакцій немає'))
        .catch(e => toast.error(`Синхронізація: ${e.message}`))
        .finally(() => {
          load()
          onChanged?.() // new cards appear on the cards page
        })
    )
  }, [load, onChanged])

  // A bank deleted on the cards page may have taken its connection with it
  useEffect(() => txBus.subscribe(({ type }) => type === 'SYNC' && load()), [load])

  // Token banks (Monobank) connect inside the catalog modal, without leaving the page
  useEffect(() => {
    const onConnected = (e) => afterConnected(e.detail?.name || 'Банк')
    window.addEventListener(BANK_CONNECTED_EVENT, onConnected)
    return () => window.removeEventListener(BANK_CONNECTED_EVENT, onConnected)
  }, [afterConnected])

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
      afterConnected(new URLSearchParams(query).get('bank_name') || 'Банк')
    } else {
      const msg = new URLSearchParams(query).get('bank_message') || ''
      toast.error(`Не вдалося підключити банк${msg ? `: ${CONNECT_ERRORS[msg] || msg}` : ''}`)
      load()
    }
  }, [load])

  const reconnect = async (c) => {
    if (c.auth === 'token') {
      setOpenId(null)
      setReconnectToken(c) // a new token instead of a bank login
      return
    }
    setBusyId(c.id)
    try {
      window.location.href = await startBankConnection(c.provider_id, returnUrlHere())
    } catch (e) {
      toast.error(`Не вдалося підключити ${c.provider_name}: ${e.message}`)
      setBusyId(null)
    }
  }

  // Account without a card → one of the user's cards; then pull its transactions there
  const linkCard = async (c, accountId, card) => {
    try {
      await linkBankAccountToCard(c.id, accountId, card.id)
      toast.success(`Прив’язано до «${card.name}». Підтягуємо транзакції…`)
      await load()
      syncOne(c)
    } catch (e) {
      toast.error(`Не вдалося прив’язати: ${e.message}`)
      throw e
    }
  }

  const confirmDisconnect = async () => {
    const c = toDisconnect
    setToDisconnect(null)
    setBusyId(c.id)
    try {
      if (c.auth === 'binance') await disconnectBinance()
      else await disconnectBankConnection(c.id)
      setOpenId(null)
      toast.success(`${c.provider_name} відключено. Картки й транзакції залишились`)
      await load()
      onChanged?.()
    } catch (e) {
      toast.error(`Не вдалося відключити: ${e.message}`)
    } finally {
      setBusyId(null)
    }
  }

  // Binance shows up as one more "bank": its accounts are the Binance cards
  const rows = useMemo(() => {
    const list = [...(connections || [])]
    if (binance) {
      const binanceCards = cards.filter(card => String(card.bank || '').toLowerCase().includes('binance'))
      list.push({
        id: 'binance',
        provider_id: 'binance',
        provider_name: 'Binance',
        auth: 'binance',
        status: 'active',
        accounts: binanceCards.map(card => ({ account_id: card.id, kind: 'card', display_name: card.name, currency: card.currency, card_id: card.id })),
      })
    }
    return list
  }, [connections, binance, cards])

  const opened = rows.find(r => r.id === openId) || null

  // Hidden while loading and when nothing is connected (connecting starts from "+ Додати")
  if (!connections || rows.length === 0) return null

  return (
    <div className="mb-6">
      <h3 className="text-[15px] font-bold text-white/80 mb-2.5 px-1">🔄 Підключені банки</h3>
      <div className="rounded-[20px] overflow-hidden border border-white/[0.14] bg-white/[0.04] backdrop-blur-xl divide-y divide-white/10">
        {rows.map(c => {
          const status = statusLine(c)
          const ok = c.status === 'active' && !c.last_error
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setOpenId(c.id)}
              className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-white/[0.05] transition-colors"
            >
              {c.auth === 'binance' ? <BinanceMark size={38} /> : <BankLogo src={c.provider_logo} name={c.provider_name} size={38} />}
              <span className="flex-1 min-w-0">
                <span className="block text-base font-bold text-white truncate">{c.provider_name}</span>
                <span className="block text-xs truncate mt-0.5" style={{ color: status.color }}>{status.text}</span>
              </span>
              {busyId === c.id ? (
                <RefreshCw size={18} className="animate-spin text-brand" />
              ) : (
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: ok ? '#34C759' : '#FF8C3A' }} />
                  <span className="text-xl leading-none text-white/35">›</span>
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-white/40 text-center mt-2">Натисніть — рахунки банку й картки</p>

      <BankAccountsModal
        connection={opened}
        cards={cards}
        balances={balances}
        busy={!!opened && busyId === opened.id}
        onClose={() => setOpenId(null)}
        onSync={syncOne}
        onReconnect={reconnect}
        onDisconnect={setToDisconnect}
        onLinkCard={linkCard}
        onOpenCard={
          onOpenCard
            ? (card) => {
                setOpenId(null)
                onOpenCard(card)
              }
            : undefined
        }
      />

      <BaseModal
        open={!!reconnectToken}
        onClose={() => setReconnectToken(null)}
        title={reconnectToken ? `Підключити ${reconnectToken.provider_name} знову` : ''}
        maxWidth="lg"
        zIndex={100}
      >
        {reconnectToken && (
          <TokenConnectForm
            provider={{ provider_id: reconnectToken.provider_id, name: reconnectToken.provider_name, logo: reconnectToken.provider_logo }}
            onBack={() => setReconnectToken(null)}
            onDone={(name) => {
              setReconnectToken(null)
              afterConnected(name)
            }}
          />
        )}
      </BaseModal>

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
