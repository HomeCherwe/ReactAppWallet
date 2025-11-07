import { motion } from 'framer-motion'
import CategoryPieChart from '../components/analytics/CategoryPieChart'

export default function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl p-5 shadow-soft"
      >
        <h1 className="text-2xl font-semibold mb-4">Analytics</h1>
        <CategoryPieChart />
      </motion.div>
    </div>
  )
}

