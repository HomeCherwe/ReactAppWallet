import { Home, CreditCard, BarChart3, Settings, Wallet, ReceiptText, LogOut, User } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase, invalidateUserCache, cacheUser } from '../lib/supabase'
import { useState, useEffect } from 'react'

const NavItem = ({ icon:Icon, label, active=false, onClick }) => (
  <motion.button
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`flex items-center gap-3 px-2 py-2 sm:px-4 sm:py-3 w-auto sm:w-full rounded-2xl text-sm font-medium ${active ? 'bg-gray-900 text-white' : 'hover:bg-white/70'} transition`}
  >
    <Icon size={18} />
    <span className="hidden sm:inline">{label}</span>
  </motion.button>
)

export default function Sidebar({ className = '' }){
  const [user, setUser] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) cacheUser(user) // Кешувати user
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) cacheUser(session.user) // Кешувати при зміні
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    invalidateUserCache() // Очистити кеш користувача
  }

  const handleProfileClick = () => {
    navigate('/profile')
  }

  const isActive = (path) => location.pathname === path

  return (
    <aside className={`fixed bottom-0 left-0 w-full sm:w-60 p-0 sm:p-5 sm:pt-0 ${className} sm:sticky sm:top-6 sm:self-start sm:relative sm:left-0`}>
      <div className="glass rounded-none sm:rounded-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.15)] sm:shadow-glass border-t-2 border-gray-200/50 sm:border-0 p-3 sm:p-4 flex flex-row sm:flex-col gap-2 items-center sm:items-start justify-center sm:justify-start">
        <div className="hidden sm:flex items-center gap-3 px-2 pb-0">
          <div className="h-8 w-8 rounded-xl bg-black/90 grid place-items-center text-white font-bold">¥</div>
          <div className="hidden sm:block font-semibold">Wallet</div>
        </div>
        <div className="flex gap-2 sm:flex-col">
          <NavItem 
            icon={Home} 
            label="Dashboard" 
            active={isActive('/') || isActive('/dashboard')}
            onClick={() => navigate('/')}
          />
          <NavItem 
            icon={BarChart3} 
            label="Analytics"
            active={isActive('/analytics')}
            onClick={() => navigate('/analytics')}
          />
        </div>
        <div className="mt-auto pt-4 hidden sm:flex flex-col gap-2 border-t border-gray-400/40">
          {user && (
            <motion.button
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.8)' }}
              whileTap={{ scale: 0.98 }}
              onClick={handleProfileClick}
              className={`px-2.5 py-2 flex items-center gap-2 bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-xl mb-1 border transition-all cursor-pointer ${
                isActive('/profile') 
                  ? 'border-indigo-300 bg-gradient-to-r from-indigo-50 to-indigo-100/50' 
                  : 'border-gray-200/30 hover:border-gray-300/50'
              }`}
            >
              {user.user_metadata?.avatar_url ? (
                <img 
                  src={user.user_metadata.avatar_url} 
                  alt="Avatar" 
                  className="h-6 w-6 rounded-full object-cover shadow-sm flex-shrink-0"
                />
              ) : (
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[9px] font-bold shadow-sm flex-shrink-0">
                  {user.email?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
              <div className="flex-1 min-w-0 text-left">
                <div className={`text-xs font-medium truncate ${
                  isActive('/profile') ? 'text-indigo-900' : 'text-gray-900'
                }`}>
                  {user.user_metadata?.full_name?.split(' ')[0] || user.user_metadata?.display_name?.split(' ')[0] || (user.email ? user.email.split('@')[0] : 'User')}
                </div>
              </div>
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSignOut}
            className="flex items-center justify-center gap-2.5 px-4 py-2.5 w-full rounded-xl text-sm font-medium text-white bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 transition-all shadow-sm hover:shadow-md"
          >
            <LogOut size={16} />
            <span>Вийти</span>
          </motion.button>
        </div>
      </div>
    </aside>
  )
}
