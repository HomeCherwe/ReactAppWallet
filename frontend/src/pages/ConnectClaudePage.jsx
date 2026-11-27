import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Wallet, Check, Search, PlusCircle, ShieldCheck } from 'lucide-react'
import { getClaudeRequest, answerClaudeRequest, clearPendingConnect } from '../api/claude'
import { supabase } from '../lib/supabase'

// Claude asked to connect to MyWallet (claude.ai → Connectors → Add custom connector → Connect).
// The user is signed in here; they approve or decline and go back to Claude.

const CAN = [
  { icon: Search, text: 'Бачити транзакції, баланси, підписки й підсумки витрат' },
  { icon: PlusCircle, text: 'Додавати транзакції — лише на рахунок, який ти назвеш' },
  { icon: ShieldCheck, text: 'Не бачить номерів карток, CVV і ключів банків; нічого не видаляє' },
]

export default function ConnectClaudePage({ req, onClose }) {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    getClaudeRequest(req)
      .then(setInfo)
      .catch(e => setError(e.message || 'Запит застарів — почни підключення в Claude ще раз'))
    supabase.auth.getUser().then(({ data }) => setEmail(data?.user?.email || ''))
  }, [req])

  const answer = async approve => {
    setBusy(approve ? 'yes' : 'no')
    try {
      const { redirect } = await answerClaudeRequest(req, approve)
      clearPendingConnect()
      window.location.href = redirect
    } catch (e) {
      setError(e.message || 'Не вдалося — спробуй ще раз')
      setBusy(null)
    }
  }

  const close = () => {
    clearPendingConnect()
    onClose()
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-liquid-glass rounded-[32px] p-7 w-full max-w-md mx-4"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-brand to-brand-deep rounded-2xl mb-4 shadow-brand">
            <Wallet className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1.5">Підключити до Claude?</h1>
          {info ? (
            <p className="text-white/65 text-sm">
              <span className="text-white font-semibold">{info.client_name}</span> ({info.redirect_host}) просить доступ до
              твого MyWallet{email && <> — {email}</>}
            </p>
          ) : (
            !error && <p className="text-white/50 text-sm">Перевіряю запит…</p>
          )}
        </div>

        {error ? (
          <>
            <p className="text-sm text-[#FF453A] text-center mb-5">{error}</p>
            <button type="button" onClick={close} className="w-full h-12 rounded-full btn-soft font-semibold">
              На головну
            </button>
          </>
        ) : (
          <>
            <ul className="grid gap-2.5 mb-6">
              {CAN.map(({ icon: Icon, text }) => (
                <li key={text} className="flex gap-3 items-start rounded-2xl bg-white/[0.04] border border-white/10 p-3">
                  <Icon size={18} className="text-brand shrink-0 mt-0.5" />
                  <span className="text-[13px] text-white/80 leading-snug">{text}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-white/45 text-center mb-4">Відключити можна будь-коли: Налаштування → Claude.</p>
            <button
              type="button"
              onClick={() => answer(true)}
              disabled={!info || !!busy}
              className="btn-primary w-full h-12 rounded-full font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Check size={18} />
              {busy === 'yes' ? 'Підключаю…' : 'Дозволити'}
            </button>
            <button
              type="button"
              onClick={() => answer(false)}
              disabled={!info || !!busy}
              className="w-full h-11 mt-2 rounded-full text-white/70 font-semibold hover:bg-white/[0.06] disabled:opacity-50"
            >
              {busy === 'no' ? 'Скасовую…' : 'Не дозволяти'}
            </button>
          </>
        )}
      </motion.div>
    </div>
  )
}
