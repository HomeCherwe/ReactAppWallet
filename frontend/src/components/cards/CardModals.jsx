import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import BaseModal from '../BaseModal'
import { ACCOUNT_KINDS, KIND_META, accountKind, isEmptyBalance } from '../../utils/accountKind'

/** Картка / Скарбничка / Готівка / Інвестиції — what the account is for (the iPhone has the same chips) */
export function KindPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {ACCOUNT_KINDS.map(k => {
        const m = KIND_META[k]
        const active = value === k
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className={`flex flex-col items-start gap-0.5 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
              active ? 'border-transparent text-white' : 'border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.07]'
            }`}
            style={active ? { background: `linear-gradient(135deg, ${m.accent[0]}38, ${m.accent[1]}1f)`, boxShadow: `inset 0 0 0 1.5px ${m.accent[0]}` } : undefined}
          >
            <span className="text-sm font-bold">{m.icon} {m.one}</span>
            <span className="text-[11px] leading-tight text-white/50">{m.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

/** "10 000,50" → 10000.5; empty or not above zero → no goal */
export function parseGoal(text) {
  const n = parseFloat(String(text || '').replace(/\s/g, '').replace(',', '.'))
  return n > 0 ? Math.round(n * 100) / 100 : null
}

/**
 * What CardModal's form changes. Kind, goal and archive go only when they change, so editing a
 * name keeps working on a database without those columns yet.
 */
export function cardPatchFromForm(form, initial) {
  const patch = {
    bank_id: form.bank_id || null,
    name: form.name,
    currency: form.currency || 'EUR',
    exclude_from_stats: !!form.exclude_from_stats,
  }
  if (form.kind !== accountKind(initial)) patch.kind = form.kind
  const goal = form.kind === 'savings' ? parseGoal(form.goal) : null
  if (goal !== (initial?.goal_amount ? Number(initial.goal_amount) : null)) patch.goal_amount = goal
  if (!!form.archived !== !!initial?.archived) patch.archived = !!form.archived
  return patch
}

export function BankModal({ open, initial, onClose, onSubmit, onDelete }) {
  const [form, setForm] = useState({ name: '', exclude_from_stats: false })

  useEffect(() => {
    setForm(initial ? {
      name: initial.name || '',
      exclude_from_stats: !!initial.exclude_from_stats
    } : { name: '', exclude_from_stats: false })
  }, [initial, open])

  const submit = async (e) => {
    e?.preventDefault?.()
    if (!form.name.trim()) {
      toast.error('Введіть назву банку')
      return
    }
    await onSubmit(form)
  }

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={initial ? 'Редагувати банк' : 'Новий банк'}
      zIndex={100}
      maxWidth="md"
    >
      <form onSubmit={submit} className="grid gap-3">
        <input 
          className="border rounded-xl px-3 py-2" 
          placeholder="Назва банку *" 
          value={form.name}
          onChange={(e)=>setForm({...form, name:e.target.value})}
          required
        />
        <label className="flex items-center gap-2.5 py-1.5 text-sm cursor-pointer select-none border rounded-xl px-3 bg-white/[0.015] hover:bg-white/[0.03] transition-colors">
          <input 
            type="checkbox"
            checked={form.exclude_from_stats}
            onChange={(e) => setForm({ ...form, exclude_from_stats: e.target.checked })}
            className="accent-brand w-4 h-4 rounded border-white/[0.14] focus:ring-brand"
          />
          <span className="text-white/85 font-medium">Виключити весь банк та всі його картки зі статистики</span>
        </label>
        <div className="mt-2 flex gap-2">
          <button className="btn btn-primary flex-1" type="submit">{initial ? 'Зберегти' : 'Додати'}</button>
          <button type="button" className="btn btn-soft" onClick={onClose}>Скасувати</button>
        </div>
        {initial?.id && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(initial)}
            className="w-full py-2.5 rounded-xl bg-red-500/10 text-[#FF6B6B] text-sm font-semibold hover:bg-red-500/15 transition-colors"
          >
            Видалити банк з усіма картками
          </button>
        )}
      </form>
    </BaseModal>
  )
}

const EMPTY_CARD_FORM = { bank_id: '', name: '', currency: 'EUR', exclude_from_stats: false, kind: 'card', goal: '', archived: false }

export function CardModal({ open, initial, onClose, onSubmit, banks = [] }) {
  const [form, setForm] = useState(EMPTY_CARD_FORM)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  useEffect(() => {
    setForm(initial ? {
      bank_id: initial.bank_id || '',
      name: initial.name || '',
      currency: initial.currency || 'EUR',
      exclude_from_stats: !!initial.exclude_from_stats,
      kind: accountKind(initial),
      goal: initial.goal_amount ? String(initial.goal_amount) : '',
      archived: !!initial.archived,
    } : EMPTY_CARD_FORM)
    setFile(null)
    setPreviewUrl(initial?.bg_url || null)
  }, [initial, open])

  // Handle file selection and preview
  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0] || null
    setFile(selectedFile)
    
    if (selectedFile) {
      const reader = new FileReader()
      reader.onload = (ev) => setPreviewUrl(ev.target.result)
      reader.readAsDataURL(selectedFile)
    }
  }

  const removeImage = () => {
    setFile(null)
    setPreviewUrl(null)
  }

  const submit = async (e) => {
    e?.preventDefault?.()
    
    // Валідація форми
    if (!form.name || !form.name.trim()) {
      toast.error('Введіть назву картки')
      return
    }
    
    try {
      let fileToSubmit = null
      if (previewUrl === null && initial) {
        fileToSubmit = 'REMOVE'
      } else if (file && file instanceof File) {
        fileToSubmit = file
      }
      
      await onSubmit(form, fileToSubmit)
    } catch (error) {
      console.error('[CardModal] Error in submit:', error)
      toast.error(error?.message || 'Помилка збереження картки')
    }
  }

  // Only an empty account goes to the archive (its balance would vanish from the lists otherwise)
  const balance = initial?._balance
  const canArchive = balance !== undefined && isEmptyBalance(balance)

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={initial ? 'Налаштування рахунку' : 'Новий рахунок'}
      zIndex={100}
      maxWidth="md"
    >
      <form onSubmit={submit} className="grid gap-3">
        <KindPicker value={form.kind} onChange={kind => setForm({ ...form, kind })} />
        {banks.length > 0 && (
          <select 
            className="border rounded-xl px-3 py-2" 
            value={form.bank_id} 
            onChange={(e)=>setForm({...form, bank_id:e.target.value})}
          >
            <option value="">Виберіть банк (опц.)</option>
            {banks.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        <div>
          <input 
            className={`border rounded-xl px-3 py-2 w-full ${
              form.name.length > 50 ? 'border-rose-400 focus:ring-rose-400' :
              form.name.length > 35 ? 'border-yellow-400 focus:ring-yellow-400' : ''
            }`}
            placeholder={form.kind === 'savings' ? 'Назва скарбнички *, напр. Подушка безпеки' : 'Назва картки *'} 
            value={form.name}
            onChange={(e)=>setForm({...form, name:e.target.value})}
            required
          />
          {form.name.length > 0 && (
            <div className={`flex justify-between items-center mt-1 text-xs px-1 ${
              form.name.length > 50 ? 'text-rose-400' :
              form.name.length > 35 ? 'text-yellow-400' : 'text-white/40'
            }`}>
              <span>
                {form.name.length > 50
                  ? '⚠ Назва занадто довга — спробуйте скоротити'
                  : form.name.length > 35
                  ? '⚠ Назва досить довга'
                  : ''}
              </span>
              <span>{form.name.length} символів</span>
            </div>
          )}
        </div>
        <select 
          className="border rounded-xl px-3 py-2" 
          value={form.currency} 
          onChange={(e)=>setForm({...form, currency:e.target.value})}
        >
          <option>UAH</option><option>EUR</option><option>USD</option><option>GBP</option><option>PLN</option>
          {!['UAH', 'EUR', 'USD', 'GBP', 'PLN'].includes(form.currency) && <option>{form.currency}</option>}
        </select>
        {form.kind === 'savings' && (
          <div>
            <label className="text-sm text-white/70 mb-1 block">Ціль (не обов'язково)</label>
            <div className="flex items-center gap-2">
              <input
                className="border rounded-xl px-3 py-2 flex-1"
                inputMode="decimal"
                placeholder="напр. 10 000"
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
              />
              <span className="text-sm font-semibold text-white/55 w-12">{form.currency}</span>
            </div>
            <div className="text-xs text-white/45 mt-1 px-1">Скільки хочете зібрати — покажемо, яку частину вже відкладено</div>
          </div>
        )}
        <label className="flex items-start gap-2.5 py-2 text-sm cursor-pointer select-none border rounded-xl px-3 bg-white/[0.015] hover:bg-white/[0.03] transition-colors">
          <input
            type="checkbox"
            checked={form.exclude_from_stats}
            onChange={(e) => setForm({ ...form, exclude_from_stats: e.target.checked })}
            className="accent-brand w-4 h-4 mt-0.5 rounded border-white/[0.14] focus:ring-brand"
          />
          <span>
            <span className="text-white/85 font-medium block">Виключити картку зі статистики</span>
            <span className="text-white/55 text-xs">Її транзакції не враховуються в доходах, витратах і аналітиці. Баланс картки не змінюється.</span>
          </span>
        </label>
        {initial && (
          <label
            className={`flex items-start gap-2.5 py-2 text-sm select-none border rounded-xl px-3 bg-white/[0.015] transition-colors ${
              canArchive || form.archived ? 'cursor-pointer hover:bg-white/[0.03]' : 'opacity-60'
            }`}
          >
            <input
              type="checkbox"
              checked={form.archived}
              disabled={!canArchive && !form.archived}
              onChange={(e) => setForm({ ...form, archived: e.target.checked })}
              className="accent-brand w-4 h-4 mt-0.5 rounded border-white/[0.14] focus:ring-brand"
            />
            <span>
              <span className="text-white/85 font-medium block">Сховати в архів</span>
              <span className="text-white/55 text-xs">
                {canArchive || form.archived
                  ? 'Рахунок зникне зі списків і з вибору рахунку, історія залишиться. Повернути — «Рахунки та картки» → Архів.'
                  : 'В архів можна сховати лише порожній рахунок — спершу переведіть залишок.'}
              </span>
            </span>
          </label>
        )}
        <div>
          <label className="text-sm text-white/70 mb-1 block">Фонова картинка (опц.)</label>
          <input type="file" accept="image/*" onChange={handleFileChange} className="text-sm"/>
          
          {previewUrl && (
            <div className="mt-2 relative">
              <img 
                src={previewUrl} 
                alt="Preview" 
                className="w-full h-32 object-cover rounded-xl"
              />
              <button
                type="button"
                onClick={removeImage}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600"
                title="Видалити зображення"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        <div className="mt-2 flex gap-2">
          <button className="btn btn-primary flex-1" type="submit">{initial ? 'Зберегти' : 'Додати'}</button>
          <button type="button" className="btn btn-soft" onClick={onClose}>Скасувати</button>
        </div>
      </form>
    </BaseModal>
  )
}
