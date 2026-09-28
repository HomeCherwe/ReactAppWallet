import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import BaseModal from '../BaseModal'
import { listPossibleDuplicates, mergeDuplicate, pairKey } from '../../api/duplicates'
import { deleteTransaction } from '../../api/transactions'
import { useSettingsStore } from '../../store/useSettingsStore'
import { fmtAmount } from '../../utils/format'
import { txBus } from '../../utils/txBus'

const DISMISSED_PATH = 'duplicates.dismissed'
const NO_DISMISSED = []

const plural = n =>
  n % 10 === 1 && n % 100 !== 11 ? 'пара' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'пари' : 'пар'

const dateOf = t => new Date(t.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: '2-digit' })
const noteOf = t => String(t.note || '').replace(/\s*\[pinned\]/g, '').trim() || t.merchant_name || '—'

/**
 * "Можливі дублі" over the transactions list (same as the iPhone app): a bank transaction and one
 * entered by hand (or by a subscription) on the same card, same amount, within 3 days. The user
 * decides for each pair — nothing is removed automatically. Hidden while there are none.
 */
export default function PossibleDuplicates() {
  const [pairs, setPairs] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const hidden = useSettingsStore(s => s.settings?.hideAllBalances ?? false)
  const dismissed = useSettingsStore(s => s.settings?.duplicates?.dismissed) || NO_DISMISSED

  const reload = useCallback(async () => {
    try {
      setPairs(await listPossibleDuplicates())
    } catch (e) {
      console.warn('[Duplicates] load failed:', e?.message || e)
    }
  }, [])

  useEffect(() => {
    reload()
    // A bank sync can bring new pairs (or settle them)
    return txBus.subscribe(ev => {
      if (ev?.type === 'SYNC' && ev?.source !== 'duplicates') reload()
    })
  }, [reload])

  const visible = useMemo(() => pairs.filter(p => !dismissed.includes(pairKey(p))), [pairs, dismissed])

  useEffect(() => {
    if (open && visible.length === 0) setOpen(false)
  }, [open, visible.length])

  if (visible.length === 0) return null

  const run = async (pair, action) => {
    if (busy) return
    if (action === 'dismiss') {
      const current = useSettingsStore.getState().settings?.duplicates?.dismissed || []
      useSettingsStore.getState().updateNestedSetting(DISMISSED_PATH, [...current, pairKey(pair)])
      return
    }
    setBusy(pairKey(pair))
    try {
      if (action === 'merge') {
        await mergeDuplicate(pair)
        toast.success('Об’єднано: лишилась ваша транзакція, банківську копію прибрано')
      } else {
        await deleteTransaction(pair.manual.id)
        toast.success('Ручну транзакцію видалено, лишилась банківська')
      }
      const gone = action === 'merge' ? [pair.manual.id, pair.bank.id] : [pair.manual.id]
      setPairs(prev => prev.filter(p => !gone.includes(p.manual.id) && !gone.includes(p.bank.id)))
      txBus.emit({ type: 'SYNC', source: 'duplicates' }) // lists and balances reload
      reload()
    } catch (e) {
      toast.error(`Не вдалося: ${e?.message || e}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left bg-amber-400/10 border border-amber-400/35 hover:bg-amber-400/15 transition-colors"
      >
        <AlertTriangle size={18} className="text-amber-300 shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-amber-200">
            Можливі дублі: {visible.length} {plural(visible.length)}
          </span>
          <span className="block text-xs text-white/60">Та сама сума з банку і вручну — перегляньте</span>
        </span>
        <ChevronRight size={18} className="text-white/40 shrink-0" />
      </button>

      <BaseModal open={open} onClose={() => setOpen(false)} maxWidth="lg" zIndex={100} title="Можливі дублі">
        <div className="grid gap-4">
          <p className="text-[13px] text-white/60 leading-snug">
            Та сама сума на тій самій картці, різниця до 3 днів: одна транзакція прийшла з банку, інша додана вручну чи
            підпискою. «Об’єднати» лишає вашу (з категорією й нотаткою) і прибирає банківську копію.
          </p>
          {visible.map(pair => {
            const amount = Number(pair.bank.amount)
            const working = busy === pairKey(pair)
            return (
              <div key={pairKey(pair)} className="rounded-2xl p-4 grid gap-2.5 bg-white/[0.04] border border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-white truncate">{pair.card_name || 'Картка'}</span>
                  <span className={`font-bold tabular-nums ${amount > 0 ? 'text-green-400' : 'text-white'}`}>
                    {hidden ? '***' : `${amount > 0 ? '+' : ''}${fmtAmount(amount, pair.card_currency || undefined)}`}
                  </span>
                </div>
                <Side label="Вручну" tx={pair.manual} />
                <Side label="З банку" tx={pair.bank} />
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => run(pair, 'merge')}
                    className="btn-primary h-10 px-4 rounded-xl text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60"
                  >
                    {working && <Loader2 size={15} className="animate-spin" />}
                    Об’єднати
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => run(pair, 'keep-bank')}
                    className="h-10 px-4 rounded-xl text-sm font-semibold bg-white/[0.06] border border-white/10 text-white/85 hover:bg-white/10 transition-colors disabled:opacity-60"
                  >
                    Лишити банківську
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => run(pair, 'dismiss')}
                    className="h-10 px-4 rounded-xl text-sm font-semibold text-white/60 hover:text-white transition-colors disabled:opacity-60"
                  >
                    Не дубль
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </BaseModal>
    </>
  )
}

function Side({ label, tx }) {
  return (
    <div className="rounded-xl px-3 py-2 bg-white/[0.04]">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-brand-light">{label}</span>
        <span className="flex-1 text-right text-xs text-white/40 truncate">{[tx.category, dateOf(tx)].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="text-sm text-white/80 mt-0.5 line-clamp-2">{noteOf(tx)}</div>
    </div>
  )
}
