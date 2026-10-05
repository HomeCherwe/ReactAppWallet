import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import CategoryPieChart from '../components/analytics/CategoryPieChart'
import MonthlyReportCard from '../components/analytics/MonthlyReportCard'
import WrappedModal, { defaultWrappedYear } from '../components/analytics/WrappedModal'

export default function AnalyticsPage() {
  const [wrappedOpen, setWrappedOpen] = useState(false)
  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-b from-white/[0.075] to-white/[0.025] backdrop-blur-xl rounded-3xl p-5 shadow-glass border border-white/10"
      >
        <h1 className="text-[28px] font-bold tracking-tight mb-4">Аналітика</h1>
        <CategoryPieChart />
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <MonthlyReportCard />

        {/* The year as stories */}
        <button
          onClick={() => setWrappedOpen(true)}
          className="text-left rounded-3xl p-5 bg-gradient-to-br from-[#FF6B00] to-[#7A1FA2] shadow-glass hover:brightness-110 transition flex items-center gap-4"
        >
          <span className="text-4xl">🎁</span>
          <span className="flex-1 min-w-0">
            <span className="block text-lg font-black text-white">MyWallet Wrapped {defaultWrappedYear()}</span>
            <span className="block text-sm text-white/85 mt-0.5">Твій рік у цифрах: улюблене місце, найдорожчий день, кава…</span>
          </span>
          <ChevronRight className="text-white shrink-0" />
        </button>
      </div>

      <WrappedModal open={wrappedOpen} onClose={() => setWrappedOpen(false)} />
    </div>
  )
}
