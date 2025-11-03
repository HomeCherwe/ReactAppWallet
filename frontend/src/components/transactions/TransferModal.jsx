import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { createTransfer, markExistingAsTransfer } from '../../api/transfers'
import { txBus } from '../../utils/txBus'
import BaseModal from '../BaseModal'

export default function TransferModal({ open, onClose, onDone }) {
  const [cards, setCards] = useState([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [amountTo, setAmountTo] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [txOptions, setTxOptions] = useState([])
  const [fromOptions, setFromOptions] = useState([])
  const [toOptions, setToOptions] = useState([])
  const [fromTxId, setFromTxId] = useState('')
  const [toTxId, setToTxId] = useState('')
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    ;(async () => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase.from('cards').select('id, bank, name, currency').eq('user_id', user.id).order('created_at', { ascending: false })
      setCards(data || [])
      // Load recent transactions for selection (last 200)
      const { data: txs } = await supabase
        .from('transactions')
        .select('id, amount, card, created_at, note')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200)
      const opts = (txs || []).map(t => {
        const amt = Number(t.amount || 0)
        return {
          id: t.id,
          amount: amt,
          sign: amt === 0 ? 0 : (amt > 0 ? 1 : -1),
          label: `${new Date(t.created_at).toLocaleDateString('uk-UA')} · ${t.card || '—'} · ${amt > 0 ? '+' : ''}${amt.toFixed(2)}${t.note ? ` (${t.note})` : ''}`
        }
      })
      setTxOptions(opts)
      setFromOptions(opts.filter(o => o.sign < 0))
      setToOptions(opts.filter(o => o.sign > 0))
    })()
  }, [open])

  useEffect(() => {
    if (!open) {
      setFrom('')
      setTo('')
      setAmount('')
      setAmountTo('')
      setNote('')
      setFromTxId('')
      setToTxId('')
    }
  }, [open])

  const fromCard = cards.find(c => String(c.id) === String(from))
  const toCard = cards.find(c => String(c.id) === String(to))
  const differentCurrency = Boolean(fromCard?.currency && toCard?.currency && fromCard.currency !== toCard.currency)

  const submit = async (e) => {
    e?.preventDefault?.()
    setFromOpen(false); setToOpen(false)
    // If both existing tx selected -> mark them as transfer
    if (fromTxId && toTxId) {
      setSaving(true)
      try {
        const res = await markExistingAsTransfer({ fromTxId, toTxId, note })
        // emit deltas based on updated tx amounts
        try {
          const src = res.find(r => r.transfer_role === 'from')
          const tgt = res.find(r => r.transfer_role === 'to')
          if (src) txBus.emit({ card_id: src.card_id || null, delta: 0 })
          if (tgt) txBus.emit({ card_id: tgt.card_id || null, delta: 0 })
        } catch {}
        onDone?.(res)
        onClose()
      } catch (err) {
        console.error('mark existing transfer failed', err)
        alert(err?.message || 'Не вдалося позначити як трансфер')
      } finally {
        setSaving(false)
      }
      return
    }

    const a = Number(amount || 0)
    if (!a || a <= 0) return alert('Введіть суму > 0')
    if (from === to) return alert('Оберіть різні рахунки')

    setSaving(true)
    try {
      const res = await createTransfer({ fromCardId: from || null, toCardId: to || null, amount: a, amountTo: differentCurrency ? Number(amountTo || 0) : null, note })
      // emit events for UI refresh
      try {
        const src = res.find(r => r.transfer_role === 'from')
        const tgt = res.find(r => r.transfer_role === 'to')
        if (src) txBus.emit({ card_id: src.card_id || null, delta: Number(src.amount || 0) })
        if (tgt) txBus.emit({ card_id: tgt.card_id || null, delta: Number(tgt.amount || 0) })
      } catch (e) { console.error('emit transfer events failed', e) }

      onDone?.(res)
      onClose()
    } catch (e) {
      console.error('create transfer failed', e)
      alert(e?.message || 'Не вдалося створити трансфер')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title="Переказ між рахунками"
      zIndex={100}
      maxWidth="md"
    >
      <form onSubmit={submit} className="grid gap-3">
              <select className="border rounded px-3 py-2" value={from} onChange={e=>setFrom(e.target.value)}>
                <option value="">— Готівка —</option>
                {cards.map(c => <option key={c.id} value={c.id}>{c.bank} — {c.name}</option>)}
              </select>

              <select className="border rounded px-3 py-2" value={to} onChange={e=>setTo(e.target.value)}>
                <option value="">— Готівка —</option>
                {cards.map(c => <option key={c.id} value={c.id}>{c.bank} — {c.name}</option>)}
              </select>

              <input type="number" step="0.01" className="border rounded px-3 py-2" placeholder={`Сума ${fromCard?.currency || ''}`.trim()} value={amount} onChange={e=>setAmount(e.target.value)} />

              <AnimatePresence initial={false}>
                {differentCurrency && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <input type="number" step="0.01" className="border rounded px-3 py-2 mt-1" placeholder={`Сума ${toCard?.currency || ''}`.trim()} value={amountTo} onChange={e=>setAmountTo(e.target.value)} />
                  </motion.div>
                )}
              </AnimatePresence>

              <input className="border rounded px-3 py-2" placeholder="Нотатка" value={note} onChange={e=>setNote(e.target.value)} />

              <div className="h-px bg-gray-200 my-1" />
              <div className="text-xs text-gray-600">Або виберіть існуючі транзакції:</div>
              <div className="grid grid-cols-1 gap-3">
                <div className="max-w-full">
                  <div className="text-[11px] text-gray-500 mb-1">From (−)</div>
                  <div className="relative">
                    <button type="button" onClick={()=>{setFromOpen(v=>!v); setToOpen(false)}} className="border rounded px-3 py-2 text-sm w-full flex items-center justify-between">
                      <span className="truncate mr-2">{fromOptions.find(o=>o.id===fromTxId)?.label || '— Оберіть вихідну —'}</span>
                      <span className="text-gray-400">▾</span>
                    </button>
                    {fromOpen && (
                      <div className="absolute z-20 bottom-full mb-1 w-full max-h-[40vh] overflow-y-auto overflow-x-auto bg-white border border-gray-200 rounded-md shadow-soft">
                        <div className="p-1 text-[11px] text-gray-500 sticky bottom-0 bg-white">Оберіть вихідну</div>
                        <div className="min-w-full">
                          {fromOptions.map(o => (
                            <button key={o.id} type="button" onClick={()=>{setFromTxId(o.id); setFromOpen(false)}} className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${fromTxId===o.id?'bg-gray-50':''}`}>
                              <span className="inline-block">{o.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="max-w-full">
                  <div className="text-[11px] text-gray-500 mb-1">To (+)</div>
                  <div className="relative">
                    <button type="button" onClick={()=>{setToOpen(v=>!v); setFromOpen(false)}} className="border rounded px-3 py-2 text-sm w-full flex items-center justify-between">
                      <span className="truncate mr-2">{toOptions.find(o=>o.id===toTxId)?.label || '— Оберіть вхідну —'}</span>
                      <span className="text-gray-400">▾</span>
                    </button>
                    {toOpen && (
                      <div className="absolute z-20 bottom-full mb-1 w-full max-w-[22rem] max-h-[40vh] overflow-y-auto overflow-x-auto bg-white border border-gray-200 rounded-md shadow-soft">
                        <div className="p-1 text-[11px] text-gray-500 sticky bottom-0 bg-white">Оберіть вхідну</div>
                        <div className="min-w-full">
                          {toOptions.map(o => (
                            <button key={o.id} type="button" onClick={()=>{setToTxId(o.id); setToOpen(false)}} className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${toTxId===o.id?'bg-gray-50':''}`}>
                              <span className="inline-block">{o.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn btn-primary flex-1" disabled={saving}>{saving ? 'Збереження…' : 'Переказати'}</button>
                <button type="button" className="btn btn-soft" onClick={onClose}>Скасувати</button>
              </div>
            </form>
    </BaseModal>
  )
}
