import { Home, CreditCard, BarChart3, Settings, Wallet, ReceiptText } from 'lucide-react'
import { motion } from 'framer-motion'

const NavItem = ({ icon:Icon, label, active=false }) => (
  <motion.button
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    className={`flex items-center gap-3 px-2 py-2 sm:px-4 sm:py-3 w-auto sm:w-full rounded-2xl text-sm font-medium ${active ? 'bg-gray-900 text-white' : 'hover:bg-white/70'} transition`}
  >
    <Icon size={18} />
    <span className="hidden sm:inline">{label}</span>
  </motion.button>
)

export default function Sidebar({ className = '' }){
  return (
    <aside className={`fixed bottom-0 left-0 w-full sm:w-60 p-0 sm:p-5 sm:pt-0 ${className} sm:sticky sm:top-6 sm:self-start sm:relative sm:left-0`}>
      <div className="glass rounded-none sm:rounded-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.15)] sm:shadow-glass border-t-2 border-gray-200/50 sm:border-0 p-3 sm:p-4 flex flex-row sm:flex-col gap-2 items-center sm:items-start justify-center sm:justify-start">
        <div className="hidden sm:flex items-center gap-3 px-2 pb-0">
          <div className="h-8 w-8 rounded-xl bg-black/90 grid place-items-center text-white font-bold">¥</div>
          <div className="hidden sm:block font-semibold">Wallet</div>
        </div>
        <div className="flex gap-2 sm:flex-col">
          <NavItem icon={Home} label="Overview" active />
          <NavItem icon={Wallet} label="Accounts" />
          <NavItem icon={CreditCard} label="Cards" />
          <NavItem icon={BarChart3} label="Analytics" />
          <NavItem icon={ReceiptText} label="Receipts" />
        </div>
        <div className="mt-auto pt-2 hidden sm:block">
          <NavItem icon={Settings} label="Settings" />
        </div>
      </div>
    </aside>
  )
}
