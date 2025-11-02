import { motion } from 'framer-motion'
import { Wallet, CreditCard, PiggyBank } from 'lucide-react'
import { fmtAmount } from '../../utils/format'

export default function BalanceCard({ currency, amount, isVisible, sectionType }) {
  const icon = sectionType==='cash' ? <Wallet size={12} className="text-green-600"/> :
               sectionType==='cards'? <CreditCard size={12} className="text-blue-600"/> :
               <PiggyBank size={12} className="text-purple-600"/>
  const grad = sectionType==='cash' ? 'from-green-500 to-emerald-600' :
               sectionType==='cards'? 'from-blue-500 to-indigo-600' :
               'from-purple-500 to-pink-600'

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`relative overflow-hidden rounded-lg bg-gradient-to-r ${grad} p-2 text-white shadow-sm`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {icon}
          <span className="text-xs font-medium">{currency}</span>
        </div>
        <div className="text-xs font-bold">
          {isVisible ? fmtAmount(amount, currency) : '••••'}
        </div>
      </div>
    </motion.div>
  )
}
