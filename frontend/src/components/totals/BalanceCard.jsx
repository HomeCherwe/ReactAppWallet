import { motion } from 'framer-motion'
import { fmtAmount } from '../../utils/format'

// Accent per bucket, like the iPhone cards tab: all/savings orange, cash green, cards blue
const ACCENT = {
  cash: 'bg-green-500/15 text-green-400 border-green-500/25',
  cards: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  savings: 'bg-brand/15 text-brand-light border-brand/30',
  all: 'bg-brand/15 text-brand-light border-brand/30',
}

export default function BalanceCard({ currency, amount, isVisible, sectionType }) {
  const accent = ACCENT[sectionType] || ACCENT.all
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center justify-between gap-2 rounded-2xl bg-white/[0.05] border border-white/[0.08] px-3 py-2"
    >
      <span className={`px-2 py-0.5 rounded-full border text-[11px] font-extrabold tracking-wide ${accent}`}>
        {currency}
      </span>
      <span className={`text-sm font-extrabold tabular-nums ${amount < 0 ? 'text-[#FF6B6B]' : 'text-white'}`}>
        {isVisible ? fmtAmount(amount, currency) : '••••'}
      </span>
    </motion.div>
  )
}
