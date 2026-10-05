import { useEffect, useMemo, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSettingsStore } from '../store/useSettingsStore'
import {
  AUTO_CATEGORIES_MODE_PATH,
  autoCategorize,
  deleteCategoryRule,
  listCategoryRules,
  ruleIsSure,
} from '../api/insights'
import { txBus } from '../utils/txBus'

const MODES = [
  { id: 'auto', label: 'Ставити одразу', desc: 'Знайомі продавці отримують категорію одразу (з позначкою «авто»), решта — підказку з ✓.' },
  { id: 'suggest', label: 'Тільки підказувати', desc: 'Лише підказка з ✓ — категорію ставите ви.' },
  { id: 'off', label: 'Вимкнено', desc: 'Імпорт з банку чекає в закріплених, як раніше.' },
]

const SOURCE_LABEL = { learned: 'ваше', history: 'з історії', gpt: 'GPT' }

/** Налаштування → «Автокатегорії» (same as the iPhone app): mode, sort now, the rules */
export default function AutoCategoriesSettings({ sectionClass, SectionTitle }) {
  const mode = useSettingsStore(s => s.settings?.autoCategories?.mode) || 'auto'
  const updateNestedSetting = useSettingsStore(s => s.updateNestedSetting)
  const [running, setRunning] = useState(false)
  const [rules, setRules] = useState(null)
  const [showRules, setShowRules] = useState(false)
  const [q, setQ] = useState('')
  const current = MODES.find(m => m.id === mode) ?? MODES[0]

  useEffect(() => {
    if (!showRules || rules) return
    listCategoryRules()
      .then(setRules)
      .catch(e => {
        setRules([])
        toast.error(`Не вдалося завантажити правила: ${e.message}`)
      })
  }, [showRules, rules])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = rules ?? []
    const found = s
      ? list.filter(r => r.merchant_key.includes(s) || (r.example || '').toLowerCase().includes(s) || (r.category || '').toLowerCase().includes(s))
      : list
    return [...found].sort((a, b) => Number(b.source === 'learned') - Number(a.source === 'learned') || b.hits - a.hits || b.samples - a.samples)
  }, [rules, q])

  const runNow = async () => {
    setRunning(true)
    try {
      const r = await autoCategorize()
      toast.success(r.applied || r.suggested ? `Поставлено: ${r.applied} · підказок: ${r.suggested}` : 'Нічого нового — закріплені вже розкладені')
      txBus.emit({ type: 'REFRESH' })
    } catch (e) {
      toast.error(`Не вдалося: ${e.message}`)
    } finally {
      setRunning(false)
    }
  }

  const remove = async r => {
    setRules(prev => prev?.filter(x => x.id !== r.id) ?? prev)
    try {
      await deleteCategoryRule(r.id)
    } catch (e) {
      toast.error(`Не вдалося видалити: ${e.message}`)
      listCategoryRules().then(setRules).catch(() => {})
    }
  }

  return (
    <section className={sectionClass}>
      <SectionTitle
        icon={Sparkles}
        color="#FF9500"
        title="Автокатегорії"
        subtitle="Імпорт з банку отримує категорію за вашими звичками — як ви ставили її цьому продавцю раніше. Нових продавців підказує GPT, лише з ваших категорій. Змінили категорію — застосунок запам’ятав. Те саме на iPhone."
      />

      <div className="inline-flex flex-wrap rounded-xl bg-white/[0.06] p-1 gap-1">
        {MODES.map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => m.id !== mode && updateNestedSetting(AUTO_CATEGORIES_MODE_PATH, m.id)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition ${m.id === mode ? 'bg-brand/25 text-brand-light' : 'text-white/60 hover:text-white/85'}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-white/55 mt-2">{current.desc}</p>

      <div className="flex flex-wrap gap-2 mt-4">
        <button
          type="button"
          onClick={runNow}
          disabled={running || mode === 'off'}
          className="btn-primary px-4 py-2 rounded-full text-sm font-semibold disabled:opacity-50"
        >
          {running ? 'Розкладаю…' : 'Розкласти закріплені'}
        </button>
        <button
          type="button"
          onClick={() => setShowRules(v => !v)}
          className="px-4 py-2 rounded-full text-sm font-semibold bg-white/[0.07] hover:bg-white/[0.12] text-white/85 transition"
        >
          {showRules ? 'Сховати правила' : 'Правила'}
        </button>
      </div>

      {showRules && (
        <div className="mt-4">
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Продавець або категорія"
            className="w-full px-3.5 py-2.5 border border-white/[0.14] rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-brand outline-none transition mb-2"
          />
          {rules === null ? (
            <div className="text-sm text-white/50 py-4">Завантаження…</div>
          ) : shown.length === 0 ? (
            <div className="text-sm text-white/50 py-4">{q ? 'Нічого не знайдено' : 'Правил поки немає'}</div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto divide-y divide-white/[0.06] rounded-xl border border-white/[0.08]">
              {shown.slice(0, 300).map(r => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">{r.example || r.merchant_key}</div>
                    <div className="text-xs text-white/50 truncate">
                      → <span className="text-brand-light font-semibold">{r.category}</span> · {SOURCE_LABEL[r.source]}
                      {r.source === 'history' ? ` (${r.samples}×, ${Math.round(r.confidence * 100)}%)` : ''}
                      {ruleIsSure(r) ? '' : ' · підказка'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(r)}
                    className="h-7 w-7 shrink-0 grid place-items-center rounded-full bg-white/[0.06] hover:bg-white/[0.14] text-white/60"
                    title="Забути це правило"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {shown.length > 300 && <p className="text-xs text-white/40 mt-2">Показано 300 з {shown.length} — уточніть пошук.</p>}
        </div>
      )}
    </section>
  )
}
