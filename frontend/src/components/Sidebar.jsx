import { Home, CreditCard, BarChart3, Repeat, Plus, Archive, HandCoins, Eye, EyeOff, Wallet } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase, cacheUser } from '../lib/supabase'
import { useState, useEffect } from 'react'
import CreateTxModal from './transactions/CreateTxModal'
import { useSettingsStore } from '../store/useSettingsStore'

export const NAV_ITEMS = [
  { path: '/', label: 'Головна', icon: Home },
  { path: '/analytics', label: 'Аналітика', icon: BarChart3 },
  { path: '/subscriptions', label: 'Підписки', icon: Repeat },
  { path: '/cards', label: 'Картки', icon: CreditCard },
  { path: '/archives', label: 'Архів', icon: Archive },
  { path: '/debts', label: 'Борги', icon: HandCoins },
]

function useIsActive() {
  const location = useLocation()
  return (path) =>
    path === '/' ? location.pathname === '/' || location.pathname === '/dashboard' : location.pathname === path
}

export function useCurrentUser() {
  const [user, setUser] = useState(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) cacheUser(user)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) cacheUser(session.user)
    })
    return () => subscription.unsubscribe()
  }, [])
  return user
}

export function userFirstName(user) {
  return (
    user?.user_metadata?.full_name?.split(' ')[0] ||
    user?.user_metadata?.display_name?.split(' ')[0] ||
    (user?.email ? user.email.split('@')[0] : 'User')
  )
}

export function Avatar({ user, size = 40 }) {
  const url = user?.user_metadata?.avatar_url
  const [broken, setBroken] = useState(false)
  return url && !broken ? (
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="rounded-full bg-gradient-to-br from-brand to-brand-deep grid place-items-center text-white font-bold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {user?.email?.[0]?.toUpperCase() || 'U'}
    </div>
  )
}

/** Desktop: glass side panel like the iPhone app's surfaces */
export default function Sidebar() {
  const user = useCurrentUser()
  const hideAllBalances = useSettingsStore(state => state.settings.hideAllBalances ?? false)
  const updateSetting = useSettingsStore(state => state.updateSetting)
  const navigate = useNavigate()
  const isActive = useIsActive()
  const [showCreateTxModal, setShowCreateTxModal] = useState(false)

  return (
    <aside className="sticky top-6 self-start w-full">
      <div className="bg-liquid-glass rounded-[28px] p-3 flex flex-col gap-1">
        <div className="flex items-center justify-between px-2 pt-1 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand to-brand-deep grid place-items-center shadow-brand">
              <Wallet size={18} className="text-white" />
            </div>
            <div className="font-bold tracking-tight">MyWallet</div>
          </div>
          <button
            onClick={() => updateSetting('hideAllBalances', !hideAllBalances)}
            className="h-8 w-8 grid place-items-center rounded-full bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title={hideAllBalances ? 'Показати баланси' : 'Приховати баланси'}
          >
            {hideAllBalances ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        <button
          onClick={() => setShowCreateTxModal(true)}
          className="mb-2 flex items-center justify-center gap-2 h-11 rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-white font-semibold shadow-brand hover:brightness-110 active:scale-[0.98] transition"
        >
          <Plus size={18} strokeWidth={2.6} />
          Нова транзакція
        </button>

        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const active = isActive(path)
          return (
            <motion.button
              key={path}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(path)}
              className={`relative flex items-center gap-3 px-3.5 h-11 w-full rounded-2xl text-sm font-semibold transition-colors ${
                active ? 'text-white' : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-2xl bg-brand/15 border border-brand/40"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <Icon size={18} className={`relative ${active ? 'text-brand' : ''}`} />
              <span className="relative">{label}</span>
            </motion.button>
          )
        })}

        {user && (
          <button
            onClick={() => navigate('/profile')}
            className={`mt-3 flex items-center gap-2.5 p-2 rounded-2xl border transition-colors ${
              isActive('/profile') ? 'bg-brand/10 border-brand/40' : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.07]'
            }`}
          >
            <Avatar user={user} size={30} />
            <div className="min-w-0 text-left">
              <div className="text-sm font-semibold truncate">{userFirstName(user)}</div>
              <div className="text-[11px] text-white/45">Профіль</div>
            </div>
          </button>
        )}
      </div>

      <CreateTxModal
        open={showCreateTxModal}
        onClose={() => setShowCreateTxModal(false)}
        onSaved={() => setShowCreateTxModal(false)}
      />
    </aside>
  )
}

/**
 * Phone: the iPhone app's bottom dock (dark glass pill, orange active tab) plus the big orange +
 * floating above it on the right.
 */
export function MobileDock() {
  const navigate = useNavigate()
  const isActive = useIsActive()
  const [showCreateTxModal, setShowCreateTxModal] = useState(false)

  return (
    <>
      <nav
        className="fixed left-0 right-0 z-50 px-3 flex justify-center pointer-events-none"
        style={{ bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="pointer-events-auto relative w-full max-w-[440px] h-[66px] rounded-full bg-[rgba(12,12,16,0.85)] backdrop-blur-2xl border border-white/[0.12] shadow-[0_10px_24px_rgba(0,0,0,0.55)] flex items-center px-1.5">
          {/* Specular line + warm glow under the dock */}
          <span className="absolute top-0 left-[14%] right-[14%] h-px bg-white/25 rounded-full" />
          <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-40 h-8 rounded-full bg-brand/20 blur-xl -z-10" />
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const active = isActive(path)
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="relative flex-1 h-[54px] flex flex-col items-center justify-center gap-0.5"
              >
                {active && (
                  <motion.span
                    layoutId="dock-active"
                    className="absolute inset-0 rounded-[24px] bg-gradient-to-br from-brand to-brand-deep shadow-[0_4px_10px_rgba(255,107,0,0.5)]"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  >
                    <span className="absolute top-0 left-2 right-2 h-px bg-white/50 rounded-full" />
                  </motion.span>
                )}
                <Icon size={19} strokeWidth={2.2} className={`relative ${active ? 'text-white' : 'text-white/55'}`} />
                <span className={`relative text-[10px] font-semibold leading-none ${active ? 'text-white' : 'text-white/50'}`}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Big orange + (like the iPhone FAB) */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setShowCreateTxModal(true)}
        className="fixed right-4 z-50 h-16 w-16 overflow-hidden rounded-full grid place-items-center bg-gradient-to-br from-[#FF7A00] to-brand-deep text-white shadow-[0_6px_18px_rgba(255,107,0,0.65)] border border-[rgba(255,200,140,0.6)]"
        style={{ bottom: 'calc(92px + env(safe-area-inset-bottom, 0px))' }}
        aria-label="Нова транзакція"
      >
        <span className="absolute top-0 left-[20%] right-[20%] h-0.5 bg-[rgba(255,220,180,0.75)] rounded-full" />
        <Plus size={30} strokeWidth={2.4} />
      </motion.button>

      <CreateTxModal
        open={showCreateTxModal}
        onClose={() => setShowCreateTxModal(false)}
        onSaved={() => setShowCreateTxModal(false)}
      />
    </>
  )
}

/** Phone: greeting header of the iPhone Home screen (eye toggle + avatar → profile) */
export function MobileHeader() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const hideAllBalances = useSettingsStore(state => state.settings.hideAllBalances ?? false)
  const updateSetting = useSettingsStore(state => state.updateSetting)
  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Доброї ночі' : hour < 12 ? 'Доброго ранку' : hour < 18 ? 'Доброго дня' : 'Доброго вечора'

  return (
    <div className="flex items-center justify-between mb-1 lg:hidden">
      <div>
        <div className="text-[13px] text-white/60">{greeting}</div>
        <div className="text-[22px] font-semibold leading-tight mt-0.5">{userFirstName(user)}</div>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => updateSetting('hideAllBalances', !hideAllBalances)}
          className="h-10 w-10 rounded-full bg-white/[0.08] grid place-items-center text-white/80"
          title={hideAllBalances ? 'Показати баланси' : 'Приховати баланси'}
        >
          {hideAllBalances ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
        <button onClick={() => navigate('/profile')} className="relative">
          <Avatar user={user} size={44} />
          <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-ink" />
        </button>
      </div>
    </div>
  )
}
