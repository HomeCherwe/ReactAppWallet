import { useEffect, useMemo, useState } from 'react'
import { Repeat, Search, Plus, Check, Link2Off } from 'lucide-react'
import toast from 'react-hot-toast'
import BaseModal from '../BaseModal'
import { listCards } from '../../api/cards'
import { isBankSubscription, linkToSubscription, listSubscriptions, subscriptionFromTransaction } from '../../api/insights'
import { formatMoney } from '../../utils/cardTheme'
import { txBus } from '../../utils/txBus'

const FREQS = [
  { key: 'weekly', label: 'Щотижня' },
  { key: 'monthly', label: 'Щомісяця' },
  { key: 'yearly', label: 'Щороку' },
]
const FREQ_TEXT = { weekly: 'щотижня', monthly: 'щомісяця', yearly: 'щороку' }

/** What the bank called the charge: "NETFLIX.COM | Конвертовано…" → "Netflix.com" */
function chargeName(tx) {
  const raw = String(tx?.merchant_name || '').trim() || String(tx?.note || '').split('|')[0].split('\n')[0].trim()
  const s = raw.slice(0, 40)
  return s && s === s.toUpperCase() ? s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()) : s
}

/**
 * «Додати в підписку» (a transaction's right-click menu; the iPhone's long press has the same):
 * the charge goes into one of the subscriptions — for when the bank names it differently and it
 * wasn't found as part of it — or a new subscription starts from it.
 */
export default function AddToSubscriptionModal({ tx, onClose }) {
  const [subs, setSubs] = useState(null)
  const [cards, setCards] = useState([])
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [frequency, setFrequency] = useState('monthly')
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    if (!tx) return
    setSubs(null)
    setQuery('')
    setName(chargeName(tx))
    setFrequency('monthly')
    setBusy(null)
    listSubscriptions().then(list => setSubs(list || [])).catch(() => setSubs([]))
    listCards().then(setCards).catch(() => {})
  }, [tx?.id])

  const currencyOf = cardId => String(cards.find(c => c.id === cardId)?.currency || 'UAH').toUpperCase()
  const amount = Math.abs(Number(tx?.amount || 0))
  const txCurrency = String(tx?.currency || currencyOf(tx?.card_id)).toUpperCase()
  const current = (subs || []).find(s => s.id === tx?.subscription_id)

  // Bank subscriptions; about this charge's price first, then the active ones
  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    const near = s => Number(s.amount) > 0 && Math.abs(Number(s.amount) - amount) <= Number(s.amount) * 0.3
    return (subs || [])
      .filter(s => isBankSubscription(s) && !s.hidden && s.id !== tx?.subscription_id)
      .filter(s => !q || String(s.name).toLowerCase().includes(q))
      .map(s => ({ ...s, near: near(s) }))
      .sort((a, b) => b.near - a.near || b.is_active - a.is_active || String(a.name).localeCompare(String(b.name), 'uk'))
  }, [subs, query, amount, tx?.subscription_id])

  const done = (subscriptionId, message) => {
    txBus.emit({ type: 'UPDATE', transaction: { ...tx, subscription_id: subscriptionId } })
    toast.success(message)
    onClose()
  }

  const link = async sub => {
    setBusy(sub?.id || 'unlink')
    try {
      await linkToSubscription(tx.id, sub?.id || null)
      done(sub?.id || null, sub ? `Додано до «${sub.name}»` : 'Прибрано з підписки')
    } catch (e) {
      toast.error(`Не вдалося: ${e.message}`)
      setBusy(null)
    }
  }

  const create = async e => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy('new')
    try {
      const { subscription } = await subscriptionFromTransaction(tx.id, { name: name.trim(), frequency })
      done(subscription?.id || null, `Нова підписка «${subscription?.name || name.trim()}»`)
    } catch (err) {
      toast.error(`Не вдалося: ${err.message}`)
      setBusy(null)
    }
  }

  return (
    <BaseModal
      open={!!tx}
      onClose={busy ? () => {} : onClose}
      title={
        <div className="flex items-center gap-2 text-lg">
          <Repeat className="text-brand-light" size={18} />
          <span>{tx?.subscription_id ? 'Підписка' : 'Додати в підписку'}</span>
        </div>
      }
      zIndex={1100}
      maxWidth="sm"
    >
      {tx && (
        <div className="space-y-4">
          {/* The charge */}
          <div className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{chargeName(tx) || tx.category || 'Списання'}</div>
              <div className="text-xs text-white/45">
                {new Date(tx.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
            <div className="text-sm font-bold tabular-nums whitespace-nowrap">−{formatMoney(amount, txCurrency)}</div>
          </div>

          {current && (
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl bg-brand/10 border border-brand/25">
              <div className="min-w-0 text-sm">
                <span className="text-white/60">Зараз у </span>
                <span className="font-semibold text-white">«{current.name}»</span>
              </div>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => link(null)}
                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                <Link2Off size={13} />
                {busy === 'unlink' ? 'Прибираю…' : 'Прибрати'}
              </button>
            </div>
          )}

          {/* Into one of the subscriptions */}
          <div>
            <div className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-2">
              {current ? 'Перенести в іншу' : 'До підписки'}
            </div>
            {(subs?.length ?? 0) > 6 && (
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Пошук підписки"
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-sm bg-white/[0.04] border border-white/[0.12] focus:border-brand outline-none"
                />
              </div>
            )}
            <div className="max-h-[240px] overflow-y-auto -mx-1 px-1 space-y-1">
              {subs == null ? (
                [0, 1, 2].map(i => <div key={i} className="h-12 rounded-xl bg-white/[0.05] animate-pulse" />)
              ) : options.length === 0 ? (
                <div className="text-sm text-white/45 py-2">{query ? 'Нічого не знайдено' : 'Поки що жодної підписки'}</div>
              ) : (
                options.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!!busy}
                    onClick={() => link(s)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-left transition-colors disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white truncate">{s.name}</span>
                      <span className="block text-xs text-white/45">
                        {formatMoney(s.amount, String(s.currency || currencyOf(s.card_id)).toUpperCase())} · {FREQ_TEXT[s.frequency] || ''}
                        {s.near ? ' · схожа сума' : ''}
                        {!s.is_active ? ' · не списується' : ''}
                      </span>
                    </span>
                    {busy === s.id ? (
                      <span className="h-4 w-4 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
                    ) : (
                      <Check size={16} className="text-white/25 shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
            <p className="text-xs text-white/40 mt-2">
              Наступні списання з такою назвою і схожою сумою додаватимуться до неї самі.
            </p>
          </div>

          {/* Or a new one from this charge */}
          {!current && (
            <form onSubmit={create} className="pt-3 border-t border-white/[0.08]">
              <div className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-2">Або нова підписка</div>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={60}
                placeholder="Назва, наприклад Netflix"
                className="w-full px-3.5 py-2.5 border border-white/[0.14] rounded-xl text-sm bg-white/[0.04] focus:ring-2 focus:ring-brand focus:border-brand outline-none transition"
              />
              <div className="grid grid-cols-3 gap-1.5 mt-2">
                {FREQS.map(f => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFrequency(f.key)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      frequency === f.key ? 'bg-brand/15 border-brand/50 text-white' : 'bg-white/[0.03] border-white/[0.1] text-white/60 hover:bg-white/[0.06]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={!!busy || !name.trim()}
                className="btn-primary w-full mt-3 rounded-xl py-2.5 font-semibold text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Plus size={15} />
                {busy === 'new' ? 'Створюю…' : 'Створити підписку'}
              </button>
            </form>
          )}
        </div>
      )}
    </BaseModal>
  )
}
