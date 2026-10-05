import { useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import BaseModal from '../BaseModal'

/** Renames a subscription (the bank's name is often something like «Orange Sa-orange») */
export default function RenameSubscriptionModal({ subscription, onSave, onCancel }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!subscription) return
    setName(subscription.name || '')
    setSaving(false)
    // After the open animation, ready to type over the old name
    const t = setTimeout(() => inputRef.current?.select(), 120)
    return () => clearTimeout(t)
  }, [subscription?.id])

  const clean = name.trim()
  const canSave = !!clean && clean !== subscription?.name && !saving

  const submit = async e => {
    e?.preventDefault()
    if (!canSave) return
    setSaving(true)
    try {
      await onSave(clean)
    } finally {
      setSaving(false)
    }
  }

  return (
    <BaseModal
      open={!!subscription}
      onClose={onCancel}
      title={
        <div className="flex items-center gap-2 text-lg">
          <Pencil className="text-brand-light" size={18} />
          <span>Назва підписки</span>
        </div>
      }
      zIndex={110}
      maxWidth="sm"
    >
      <form onSubmit={submit}>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={60}
          placeholder="Наприклад, Netflix"
          className="w-full px-3.5 py-3 border border-white/[0.14] rounded-xl text-[15px] bg-white/[0.04] focus:ring-2 focus:ring-brand focus:border-brand outline-none transition"
        />
        <p className="text-xs text-white/45 mt-2">
          Назва лише для вас — на списання з банку вона не впливає.
        </p>
        <div className="flex flex-col gap-2 mt-5">
          <button
            type="submit"
            disabled={!canSave}
            className="btn-primary rounded-xl py-2.5 font-semibold text-sm disabled:opacity-50"
          >
            {saving ? 'Зберігаю…' : 'Зберегти'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-white/[0.14] py-2.5 text-sm hover:bg-white/[0.06] transition-colors"
          >
            Скасувати
          </button>
        </div>
      </form>
    </BaseModal>
  )
}
