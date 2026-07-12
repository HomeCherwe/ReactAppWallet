import { Home, CreditCard, BarChart3, Wallet, Repeat, Plus, Archive, HandCoins, Eye, EyeOff } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase, cacheUser } from '../lib/supabase'
import { useState, useEffect, useRef } from 'react'
import CreateTxModal from './transactions/CreateTxModal'
import { useSettingsStore } from '../store/useSettingsStore'

const NavItem = ({ icon:Icon, label, active=false, onClick, className = '' }) => (
  <motion.button
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`flex items-center gap-3 px-2 py-2 sm:px-4 sm:py-3 w-auto sm:w-full rounded-2xl text-sm font-medium ${active ? 'bg-gray-900 text-white' : 'hover:bg-white/70'} transition ${className}`}
  >
    <Icon size={18} />
    <span className="hidden sm:inline">{label}</span>
  </motion.button>
)

export default function Sidebar({ className = '' }){
  const [user, setUser] = useState(null)
  const [showCreateTxModal, setShowCreateTxModal] = useState(false)
  const hideAllBalances = useSettingsStore(state => state.settings.hideAllBalances ?? false)
  const updateSetting = useSettingsStore(state => state.updateSetting)
  const navigate = useNavigate()
  const location = useLocation()
  const [isVisible, setIsVisible] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(window.innerWidth < 640)
    const handleResize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    let lastScrollYVal = window.scrollY

    const handleScroll = () => {
      const currentScrollY = window.scrollY
      
      // Avoid iOS bounce effect issues
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      if (currentScrollY < 0 || currentScrollY > maxScroll) return

      // Threshold check to avoid minor jitters
      if (Math.abs(currentScrollY - lastScrollYVal) < 10) return

      if (currentScrollY > lastScrollYVal && currentScrollY > 300) {
        setIsVisible(false) // Scrolling down
      } else {
        setIsVisible(true) // Scrolling up
      }

      lastScrollYVal = currentScrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

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

  const handleProfileClick = () => {
    navigate('/profile')
  }

  const isActive = (path) => location.pathname === path

  const shouldShow = isVisible || showCreateTxModal

  return (
    <aside
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-lg sm:bottom-auto sm:left-auto sm:translate-x-0 sm:w-60 p-0 sm:p-5 sm:pt-0 ${className} sm:sticky sm:top-6 sm:self-start sm:relative z-50 sm:z-auto transform-gpu transition-all duration-300 ease-in-out ${shouldShow ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-2 opacity-100 scale-90 sm:translate-y-0 sm:opacity-100 sm:scale-100'}`}
      style={isMobile ? { bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' } : {}}
    >
      <div
        className="bg-liquid-glass sm:bg-white rounded-full sm:rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.15)] sm:shadow-sm border border-white/20 sm:border sm:border-gray-200/80 flex flex-row sm:flex-col gap-2 items-center sm:items-start justify-center sm:justify-start p-1.5 sm:p-4 relative"
      >
        <div className="hidden sm:flex items-center justify-between w-full px-2 pb-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-black/90 grid place-items-center text-white font-bold">¥</div>
            <div className="font-semibold">Wallet</div>
          </div>
          <button 
            onClick={() => updateSetting('hideAllBalances', !hideAllBalances)}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-800 transition-colors"
            title={hideAllBalances ? "Показати баланси" : "Приховати баланси"}
          >
            {hideAllBalances ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {/* Desktop-only navigation menu */}
        <div className="hidden sm:flex sm:flex-col sm:w-full sm:gap-2">
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
          <NavItem 
            icon={Repeat} 
            label="Підписки"
            active={isActive('/subscriptions')}
            onClick={() => navigate('/subscriptions')}
          />
          <NavItem 
            icon={CreditCard} 
            label="Картки"
            active={isActive('/cards')}
            onClick={() => navigate('/cards')}
          />
          <NavItem 
            icon={Archive} 
            label="Архів"
            active={isActive('/archives')}
            onClick={() => navigate('/archives')}
          />
          <NavItem 
            icon={HandCoins} 
            label="Борги"
            active={isActive('/debts')}
            onClick={() => navigate('/debts')}
          />
        </div>

        {/* Мобільна версія з відцентрованою кнопкою + та іконками навколо */}
        <div className="flex sm:hidden w-full items-center justify-between relative">
          {/* Ліва група: Dashboard, Analytics, Підписки */}
          <div className="flex items-center justify-around flex-1">
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
            <NavItem 
              icon={Repeat} 
              label="Підписки"
              active={isActive('/subscriptions')}
              onClick={() => navigate('/subscriptions')}
            />
          </div>

          {/* Центральна кнопка + */}
          <div className="flex items-center justify-center px-1">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowCreateTxModal(true)}
              className="p-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white transition-all shadow-lg flex items-center justify-center flex-shrink-0"
            >
              <Plus size={20} />
            </motion.button>
          </div>

          {/* Права група: Картки, Архів, Борги */}
          <div className="flex items-center justify-around flex-1 pr-11">
            <NavItem 
              icon={CreditCard} 
              label="Картки"
              active={isActive('/cards')}
              onClick={() => navigate('/cards')}
            />
            <NavItem 
              icon={Archive} 
              label="Архів"
              active={isActive('/archives')}
              onClick={() => navigate('/archives')}
            />
            <NavItem 
              icon={HandCoins} 
              label="Борги"
              active={isActive('/debts')}
              onClick={() => navigate('/debts')}
            />
          </div>

          {/* Аватарка справа на мобільному (абсолютно всередині відносного контейнера) */}
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1.5 flex-shrink-0">
            <button 
              onClick={() => updateSetting('hideAllBalances', !hideAllBalances)}
              className="p-2 rounded-full bg-white/70 hover:bg-white text-gray-500 hover:text-gray-800 transition-all flex items-center justify-center shadow-sm"
              title={hideAllBalances ? "Показати баланси" : "Приховати баланси"}
            >
              {hideAllBalances ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            {user && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleProfileClick}
                className={`p-1.5 rounded-full transition-all ${
                  isActive('/profile') 
                    ? 'bg-indigo-100 border-2 border-indigo-300' 
                    : 'bg-white/70 hover:bg-white border-2 border-transparent'
                }`}
              >
                {user.user_metadata?.avatar_url ? (
                  <img 
                    src={user.user_metadata.avatar_url} 
                    alt="Avatar" 
                    className="h-8 w-8 rounded-full object-cover shadow-sm"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                    {user.email?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
              </motion.button>
            )}
          </div>
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
        </div>
      </div>


      <CreateTxModal
        open={showCreateTxModal}
        onClose={() => setShowCreateTxModal(false)}
        onSaved={() => {
          setShowCreateTxModal(false)
          // Можна додати toast або інше повідомлення
        }}
      />

      <svg style={{ display: 'none' }}>
        <filter id="displacementFilter">
          <feImage
            href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAA9hAAAPYQGoP6dpAAAMoElEQVRogZ1a3ZqjyI6MkBJc3XOz7/+g+53pMoq9kJQk2K6Zs0yNGzAG/YRCSgn+/r0PYpCD2IEH+SC/yIdZfj6MD9pu3M02cjMb5KC50cycNBoJ0kiCRRk8BEWCACgCAkAAIAhQAGAAIRccNGIDBjCADdilHdilh/QAH9AX+DA+yN1sM9vAYRw2SIKg1dNJkm61Y0YzGkmDGc1A0og8JEGT1Q1gBCkQJEgArENgCi4QFDR1AABIAEEJggAIECRJogBJeblIkLK0AUEOjpQUBMzMyPk/naTRUvTUgTQMjVCcRkxgfgJGIA8poE62+HNHvSeJedzngdYgZZaASNepr1HelgQhYthuhjKrpaBmrP+MZuUHt9IqP9mKWnkEZiAxzc8UkgQFkDzFLAeohZJw7qh3InRAIYYUQAhBCOVStauHbaTBQXMaPWV2L4Sb08ytxPole1wxmaftohIEX0QkT076Fe1UcZExISB3Uhp3Ctw9CSt0i2jMSKCKmP4nBB70AYsbEudtwcx++DR/DbJi7mafh6WVs2sSPQJql+Zmxm9Y/kVPSsw1OlB/K3gIhEwI4ICqDO47QM8Lj2BShCFHMCEnTaPhXYd5TBXN3H2N/7PtjezzG/nDfzDe6kw66+cRQBsQKfaSLK2RXBU6Y84SSFtwrhCOjNcULAaEIHId/f38f37tCoQAEBCBQ0uCXO+E0N7rb5j58e+y/f339/v3462t7bDaGuTMZkwZ6RgBIEvk50d/Si1DGMi8KqHVicc8ZstEIknBAh3Aojjjw/Obzb/v7z/78ez9CVAhKiAHDv8qYLPSPfX/8+vX719f//Nr/2rd9s+FWdOPNWCk9KzpZzM7Cjdr2J0+CnPSji+yEAATAPqeCO0IRccTzie9tH//7/A+ex98hISoeAhr2SCah08wSPV/7778eX3899t/DNrdJnMVXGapW4hbceSLnZP4VP9P20jw76afUUAMqACkkQYPb+OP8j8WXjnhGxHFECBQEcPCr2JFGp49tG4992x/742GeadcIFNXgBE3zQJ1sE99wX0Q/sbXkrsvRCa+ZCxonh/jc9Y3vZ4yDT4UiEJLIkIZ9mYFmNtLGw20bY9vMh/mocAVViM/Yb7uDInlyJRfEL9C/RO881HJGEFtZQJnBLc8LDBwxxrF7wCNiZmmBw3abGcvo5u6bcTg9MzEh4sXkrUMVBLwY/oV83m7pNgEpO1sNZDSUtWAZL6ag3GKjghIVRabDdzeaZx6AmRs35yCsLTq5pUHPhW1O/LwX"
            preserveAspectRatio="none"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="600"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
    </aside>
  )
}
