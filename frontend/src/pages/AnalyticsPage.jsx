import { motion } from 'framer-motion'
import CategoryPieChart from '../components/analytics/CategoryPieChart'

export default function AnalyticsPage() {
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
    </div>
  )
}

