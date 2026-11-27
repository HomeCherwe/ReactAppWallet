import { useEffect, useState } from 'react'
import { Sparkles, Copy, Unplug } from 'lucide-react'
import toast from 'react-hot-toast'
import ConfirmModal from './ConfirmModal'
import { getClaudeConnections, removeClaudeConnection } from '../api/claude'

// Settings → «Claude» (same as the iPhone app): the address to add MyWallet as a connector in Claude,
// and the Claude apps already connected, each can be cut off.

const fmt = iso =>
  iso ? new Date(iso).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export default function ClaudeConnectorSettings({ sectionClass, SectionTitle }) {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  const [removing, setRemoving] = useState(null)

  const load = () =>
    getClaudeConnections()
      .then(d => {
        setData(d)
        setFailed(false)
      })
      .catch(() => setFailed(true))

  useEffect(() => {
    load()
    // Back from Claude after approving: show the new connection
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.url)
      toast.success('Адресу скопійовано')
    } catch {
      toast.error('Не вдалося скопіювати')
    }
  }

  const remove = async () => {
    const id = removing.id
    setRemoving(null)
    try {
      await removeClaudeConnection(id)
      setData(d => ({ ...d, connections: d.connections.filter(c => c.id !== id) }))
      toast.success('Claude відключено')
    } catch (e) {
      toast.error(e.message || 'Не вдалося відключити')
    }
  }

  const steps = [
    'У Claude: Налаштування → Коннектори → «Додати свій коннектор».',
    'Назва — MyWallet, адреса — та, що нижче. Натисни «Додати».',
    '«Підключити» → відкриється MyWallet: увійди й натисни «Дозволити».',
    'Готово: питай Claude про витрати чи проси додати транзакцію. Працює і в застосунку Claude на телефоні.',
  ]

  return (
    <section className={sectionClass}>
      <SectionTitle
        icon={Sparkles}
        color="#D97757"
        title="Claude"
        subtitle="Підключи свій MyWallet до Claude як коннектор. Кожен бачить тільки свій гаманець."
      />

      <ol className="grid gap-2 mb-4">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] text-white/80 leading-snug">
            <span className="h-5 w-5 shrink-0 rounded-full bg-brand/20 text-brand-light text-[11px] font-extrabold grid place-items-center">
              {i + 1}
            </span>
            <span className="min-w-0 break-words">{step}</span>
          </li>
        ))}
      </ol>

      {failed ? (
        <p className="text-sm text-[#FF453A]">Не вдалося завантажити — спробуй пізніше.</p>
      ) : !data ? (
        <div className="flex justify-center py-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand" />
        </div>
      ) : (
        <>
          <label className="block text-xs font-semibold text-white/55 mb-1.5 px-1">Адреса коннектора</label>
          <div className="flex items-center gap-2 mb-4">
            <input
              type="text"
              value={data.url}
              readOnly
              onFocus={e => e.target.select()}
              className="flex-1 min-w-0 px-4 py-2.5 border border-white/[0.14] rounded-xl font-mono text-sm outline-none"
            />
            <button
              type="button"
              onClick={copy}
              className="p-2.5 border border-white/[0.14] rounded-xl hover:bg-white/[0.06] transition-colors"
              title="Скопіювати"
            >
              <Copy size={18} className="text-white/70" />
            </button>
          </div>

          <div className="text-xs font-semibold text-white/55 mb-1.5 px-1">Підключено</div>
          {data.connections.length === 0 ? (
            <p className="text-sm text-white/50 px-1">Поки нічого не підключено.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {data.connections.map(c => (
                <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] border border-white/10 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white truncate">{c.client_name}</div>
                    <div className="text-xs text-white/50 break-words">
                      {c.redirect_host} · з {fmt(c.created_at)} · востаннє {fmt(c.last_used_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemoving(c)}
                    className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-semibold text-[#FF453A] hover:bg-white/[0.06]"
                  >
                    <Unplug size={15} />
                    Відключити
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={!!removing}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
        title="Відключити Claude?"
        message={`${removing?.client_name || 'Claude'} більше не матиме доступу до MyWallet. Підключити знову можна в Claude.`}
        confirmLabel="Відключити"
        cancelLabel="Скасувати"
        danger={true}
      />
    </section>
  )
}
