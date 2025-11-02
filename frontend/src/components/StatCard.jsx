import { motion } from 'framer-motion'

export default function StatCard({ title, value, delta, accent='indigo' }){
  const badge = delta >= 0 ? 'text-emerald-600' : 'text-rose-600';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl bg-white shadow-soft p-4 sm:p-5"
    >
      <div className="text-sm text-gray-500 mb-2">{title}</div>
      <div className="text-[28px] sm:text-3xl font-bold">${value.toLocaleString()}</div>
      <div className={`mt-1 text-xs ${badge}`}>{delta}%</div>
    </motion.div>
  )
}
