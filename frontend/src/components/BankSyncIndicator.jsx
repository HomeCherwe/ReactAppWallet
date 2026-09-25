import { motion } from 'framer-motion'
import { Check, RefreshCw } from 'lucide-react'
import { useBankSyncStore } from '../store/useBankSyncStore'

function formatSyncTime(ms) {
  const d = new Date(ms)
  const time = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return `сьогодні, ${time}`
  if (d.toDateString() === yesterday.toDateString()) return `вчора, ${time}`
  return `${d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}, ${time}`
}

function pluralTx(n) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'транзакція'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'транзакції'
  return 'транзакцій'
}

/**
 * Bank sync status next to the transactions title:
 * syncing → spinner; new transactions → "+N" for a few seconds; otherwise the last sync time.
 */
export default function BankSyncIndicator() {
  const phase = useBankSyncStore(s => s.phase)
  const added = useBankSyncStore(s => s.added)
  const lastSyncAt = useBankSyncStore(s => s.lastSyncAt)

  if (phase === 'idle' && !lastSyncAt) return null

  return (
    // key re-mounts on every state change → short fade-in
    <motion.span
      key={`${phase}-${added}-${lastSyncAt}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="inline-flex items-center gap-1.5 text-xs font-medium"
    >
      {phase === 'syncing' ? (
        <>
          <RefreshCw size={13} className="animate-spin text-orange-500" />
          <span className="text-gray-500">Синхронізація банків…</span>
        </>
      ) : phase === 'result' ? (
        <>
          <Check size={13} className="text-green-600" />
          <span className="text-green-600">+{added} {pluralTx(added)}</span>
        </>
      ) : (
        <span className="text-gray-400">Оновлено {formatSyncTime(lastSyncAt)}</span>
      )}
    </motion.span>
  )
}
