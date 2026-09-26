import { motion } from 'framer-motion'

export default function StatCard({ title, value, delta, accent='indigo' }){
  const badge = delta >= 0 ? 'text-emerald-400' : 'text-rose-400';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-3xl bg-gradient-to-b from-white/[0.075] to-white/[0.025] backdrop-blur-xl shadow-glass p-4 sm:p-5 border border-white/10"
    >
      <div className="text-sm text-white/55 mb-2">{title}</div>
      <div className="text-[28px] sm:text-3xl font-bold">${value.toLocaleString()}</div>
      <div className={`mt-1 text-xs ${badge}`}>{delta}%</div>
    </motion.div>
  )
}
