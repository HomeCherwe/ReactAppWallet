import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, RotateCcw, Sparkles, X } from 'lucide-react'
import { askAssistant } from '../../api/assistant'
import { listCards } from '../../api/cards'
import { useAssistantStore } from '../../store/useAssistantStore'
import Row from '../transactions/Row'

const STORAGE_KEY = 'assistant_chat_v1'
// Kept in this browser (the general chat; chats about one transaction aren't kept)
const KEEP_MESSAGES = 40
const SEND_MESSAGES = 16

const GENERAL_SUGGESTIONS = [
  'Скільки я витратив цього місяця?',
  'На що йде найбільше грошей?',
  'Порівняй цей місяць з минулим',
  'Які в мене підписки?',
  'Найбільші покупки за тиждень',
  'Скільки зараз на всіх рахунках?',
]
const TX_SUGGESTIONS = ['Що це за транзакція?', 'Чи нормальна ця сума?', 'Як часто я тут витрачаю?', 'Покажи схожі транзакції']

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const txTitle = tx =>
  String(tx?.note || '').replace(/\[pinned\]/g, '').split('|')[0].split('\n')[0].trim() || tx?.merchant_name || tx?.category || 'транзакцію'

function loadSaved() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** The assistant's text: paragraphs, "- " bullets and **bold** */
function RichText({ text }) {
  return text.split('\n').map((line, i) => {
    const bullet = line.match(/^(\s*)[-•]\s+(.*)$/)
    const content = bullet ? bullet[2] : line
    if (!content.trim()) return <div key={i} className="h-1.5" />
    const parts = content
      .split(/(\*\*[^*]+\*\*)/g)
      .filter(Boolean)
      .map((p, j) => (p.startsWith('**') && p.endsWith('**') ? <strong key={j} className="font-extrabold">{p.slice(2, -2)}</strong> : p))
    if (!bullet) return <p key={i}>{parts}</p>
    return (
      <div key={i} className={`flex items-start gap-2.5 ${bullet[1].length >= 2 ? 'pl-4' : ''}`}>
        <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#C77DFF]" />
        <span className="flex-1">{parts}</span>
      </div>
    )
  })
}

/**
 * «AI-асистент» (same as the iPhone app): ask about your money in plain words. Answers come with
 * the transactions they're about. It only reads — nothing is changed.
 */
export default function AssistantPanel() {
  const { open, tx, hide } = useAssistantStore()
  const [general, setGeneral] = useState(loadSaved)
  const [txChat, setTxChat] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [cards, setCards] = useState([])
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const messages = tx ? txChat : general
  const setMessages = tx ? setTxChat : setGeneral

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(general.filter(m => !m.error).slice(-KEEP_MESSAGES)))
    } catch {}
  }, [general])

  useEffect(() => {
    if (!open) return
    if (tx) setTxChat([])
    listCards().then(setCards).catch(() => {})
    const t = setTimeout(() => inputRef.current?.focus(), 250)
    const onKey = e => e.key === 'Escape' && hide()
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, tx?.id])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, sending])

  const currencyOf = useMemo(() => {
    const map = Object.fromEntries(cards.map(c => [c.id, c.currency || 'UAH']))
    return t => t.currency || map[t.card_id] || 'UAH'
  }, [cards])

  const send = async (text, history = messages) => {
    const q = text.trim()
    if (!q || sending) return
    const next = [...history.filter(m => !m.error), { id: newId(), role: 'user', text: q }]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      const reply = await askAssistant(next.slice(-SEND_MESSAGES).map(m => ({ role: m.role, content: m.text })), tx?.id)
      setMessages(prev => [...prev, { id: newId(), role: 'assistant', text: reply.answer, transactions: reply.transactions }])
    } catch (e) {
      setMessages(prev => [...prev, { id: newId(), role: 'assistant', text: e?.message || 'Не вдалося отримати відповідь', error: true }])
    } finally {
      setSending(false)
    }
  }

  const retry = () => {
    const idx = messages.map(m => m.role).lastIndexOf('user')
    if (idx >= 0) send(messages[idx].text, messages.slice(0, idx))
  }

  const suggestions = tx ? TX_SUGGESTIONS : GENERAL_SUGGESTIONS

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="assistant-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={hide}
          className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[140]"
        />
      )}
      {open && (
        <motion.aside
          key="assistant-panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          className="fixed inset-y-0 right-0 z-[141] w-full sm:w-[460px] flex flex-col bg-[#141418] border-l border-white/10 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.08]">
            <span className="relative h-9 w-9 grid place-items-center">
              <span className="ai-ring-halo" />
              <span className="ai-ring" />
              <span className="relative h-9 w-9 rounded-full bg-[#141418] grid place-items-center">
                <Sparkles size={18} className="text-[#C77DFF]" />
              </span>
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-white text-[17px]">AI-асистент</div>
              <div className="text-xs text-white/45 truncate">Читає твої транзакції — нічого не змінює</div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="px-3 py-1.5 rounded-full text-[13px] font-semibold bg-white/[0.07] hover:bg-white/[0.12] text-white/80 transition"
              >
                Нова
              </button>
            )}
            <button onClick={hide} className="h-8 w-8 grid place-items-center rounded-full bg-white/[0.07] hover:bg-white/[0.12] text-white/70" title="Закрити">
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {tx && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1.5 px-1">Про транзакцію</div>
                <div className="rounded-2xl border border-[#C77DFF]/40 overflow-hidden">
                  <Row tx={tx} currency={currencyOf(tx)} showEditButton={false} />
                </div>
              </div>
            )}

            {messages.length === 0 && !sending && (
              <div className="pt-3">
                <div className="text-xl font-extrabold text-white">{tx ? `Що цікавить про «${txTitle(tx)}»?` : 'Запитай про свої гроші'}</div>
                <p className="text-sm text-white/60 mt-1.5">
                  {tx
                    ? 'Можу пояснити, що це за списання, порівняти з минулими й показати схожі.'
                    : 'Скільки, де, коли й на що — асистент сам знайде транзакції й порахує.'}
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="px-3.5 py-2 rounded-full text-[13.5px] font-semibold text-white bg-[#C77DFF]/10 border border-[#C77DFF]/45 hover:bg-[#C77DFF]/20 transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(m =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] px-3.5 py-2.5 rounded-[20px] rounded-br-md bg-gradient-to-br from-[#FF7A1A] to-[#FF5A00] text-white text-[15px] leading-relaxed whitespace-pre-wrap">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="space-y-2">
                  <div
                    className={`max-w-[94%] px-3.5 py-2.5 rounded-[20px] rounded-bl-md text-[15px] leading-relaxed text-white space-y-0.5 border ${
                      m.error ? 'bg-rose-500/[0.08] border-rose-500/40' : 'bg-white/[0.06] border-white/10'
                    }`}
                  >
                    <RichText text={m.text} />
                    {m.error && (
                      <button onClick={retry} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold bg-white/10 hover:bg-white/15">
                        <RotateCcw size={13} /> Спробувати ще раз
                      </button>
                    )}
                  </div>
                  {!!m.transactions?.length && (
                    <div className="rounded-2xl border border-white/[0.08] bg-[#1A1A1E] p-1.5 space-y-1">
                      {m.transactions.map(t => (
                        <Row key={t.id} tx={t} currency={currencyOf(t)} compact showEditButton={false} />
                      ))}
                    </div>
                  )}
                </div>
              )
            )}

            {sending && (
              <div className="flex items-center gap-1.5 px-1.5 py-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-[#C77DFF] animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
                <span className="ml-2 text-[13px] text-white/40">Дивлюсь твої транзакції…</span>
              </div>
            )}
          </div>

          {/* Input with the AI's running contour */}
          <form
            onSubmit={e => {
              e.preventDefault()
              send(input)
            }}
            className="px-3 pt-2 pb-[calc(16px+env(safe-area-inset-bottom,0px))]"
          >
            <div className="ai-frame" style={{ '--ai-radius': '22px' }}>
              <div className="flex items-end gap-2 bg-[#1C1B22] pl-4 pr-1.5 py-1.5">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send(input)
                    }
                  }}
                  rows={1}
                  maxLength={1000}
                  disabled={sending}
                  placeholder={tx ? 'Запитай про цю транзакцію…' : 'Запитай про свої гроші…'}
                  className="flex-1 resize-none bg-transparent outline-none border-0 focus:ring-0 text-[15px] text-white placeholder:text-white/35 py-2 max-h-28"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || sending}
                  className="h-9 w-9 shrink-0 grid place-items-center rounded-full text-white bg-gradient-to-br from-[#FF6B00] via-[#FF3D7F] to-[#3D7BFF] disabled:opacity-40 transition"
                  title="Надіслати"
                >
                  {sending ? <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <ArrowUp size={18} strokeWidth={2.6} />}
                </button>
              </div>
            </div>
          </form>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body
  )
}
