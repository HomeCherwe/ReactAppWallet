import { useEffect, useState, useRef } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase, cacheUser, getUserCacheStats } from './lib/supabase'
import Sidebar, { MobileDock } from './components/Sidebar.jsx'
import QuickAddFab from './components/QuickAddFab'
import DashboardPage from './pages/DashboardPage'
import ProfilePage from './pages/ProfilePage'
import AnalyticsPage from './pages/AnalyticsPage'
import SubscriptionsPage from './pages/SubscriptionsPage'
import AdminPage from './pages/AdminPage'
import CardsPage from './pages/CardsPage'
import ArchivesPage from './pages/ArchivesPage'
import DebtsPage from './pages/DebtsPage'
import Auth from './components/Auth'
import { txBus } from './utils/txBus'
import { getApiUrl, apiFetch } from './utils.jsx'
import { startHomePrefetch } from './api/home'
import { useRealtimeTransactions } from './hooks/useRealtimeTransactions'
import { useBankAutoSync } from './hooks/useBankAutoSync'
import { useSettingsStore } from './store/useSettingsStore'
import AssistantPanel from './components/assistant/AssistantPanel'
import TxContextMenuHost from './components/transactions/TxContextMenu'
import ConnectClaudePage from './pages/ConnectClaudePage'
import { takeConnectFromUrl, pendingConnect } from './api/claude'

// Claude sent the user here to approve a connection (#/connect?req=…): kept through the Google sign-in
takeConnectFromUrl()

export default function App(){
  const [session, setSession] = useState(null)
  const [connectReq, setConnectReq] = useState(pendingConnect)
  // …also when the link opens in a tab that already has MyWallet
  useEffect(() => {
    const onHash = () => {
      takeConnectFromUrl()
      setConnectReq(pendingConnect())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const [loading, setLoading] = useState(true)
  // Home's accounts, sums and cash in one request, started before the widgets ask for them
  const primedFor = useRef(null)
  if (session?.user?.id && primedFor.current !== session.user.id) {
    primedFor.current = session.user.id
    startHomePrefetch()
  }
  
  // Підписка на Realtime зміни транзакцій (тільки для авторизованих користувачів)
  useRealtimeTransactions()
  // Sync every bank on page load / return to the tab (like the iPhone app)
  useBankAutoSync(!!session)

  // Check authentication state and handle OAuth callback
  useEffect(() => {
    // Handle OAuth callback (if redirected from OAuth provider)
    const handleAuthCallback = async () => {
      const hashParams = window.location.hash
      if (hashParams.includes('access_token') || hashParams.includes('error')) {
        try {
          // Exchange the code/token for a session
          const { data: { session }, error } = await supabase.auth.getSession()
          
          if (error) {
            console.error('Auth callback error:', error)
            // Clean up URL hash
            window.history.replaceState(null, '', window.location.pathname)
            return
          }

          if (session) {
            setSession(session)
            // Кешувати user після успішної аутентифікації
            if (session.user) {
              cacheUser(session.user)
            }
            // Clean up URL hash after successful auth
            window.history.replaceState(null, '', window.location.pathname)
          }
        } catch (err) {
          console.error('Error handling auth callback:', err)
        }
      }
    }

    handleAuthCallback()

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      // Кешувати user з session
      if (session?.user) {
        cacheUser(session.user)
      }
      // Ініціалізувати settings store
      if (session?.user) {
        useSettingsStore.getState().initialize()
      }
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      // Оновлювати кеш при зміні session
      if (session?.user) {
        cacheUser(session.user)
        // Ініціалізувати settings store
        useSettingsStore.getState().initialize()
      } else {
        // Користувач вийшов - скидаємо store
        useSettingsStore.getState().reset()
      }
      setLoading(false)
      // Clean up URL hash if present
      if (session && window.location.hash.includes('access_token')) {
        window.history.replaceState(null, '', window.location.pathname)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Signed in: the Binance balance syncs in the background and Home updates when it lands. The
  // screen no longer waits for it (up to 20 s) or for anything else before showing up; the
  // widgets load their own data, sharing one /api/home request (started below).
  useEffect(() => {
    if (!session?.user?.id) return
    const controller = new AbortController()
    apiFetch('/api/syncBinance', { method: 'POST', signal: controller.signal })
      .then(data => {
        if (data?.success && data.synced) setTimeout(() => txBus.emit({ card_id: data.card_id, delta: data.delta }), 300)
      })
      .catch(e => {
        if (e?.name !== 'AbortError') console.warn('Binance sync failed:', e?.message)
      })
    return () => controller.abort()
  }, [session?.user?.id])

  // Логування статистики кешу після повного завантаження
  useEffect(() => {
    const timer = setTimeout(() => {
      const stats = getUserCacheStats()
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  // Періодична перевірка підписок (кожні 5 хвилин)
  useEffect(() => {
    if (!session?.user) return

    const checkSubscriptions = async () => {
      try {
        const response = await apiFetch('/api/subscriptions/process', {
          method: 'POST'
        })
        if (response?.processed > 0) {
          
          // Emit txBus event to refresh components
          txBus.emit({ type: 'SUBSCRIPTIONS_PROCESSED', count: response.processed })
        }
      } catch (error) {
        console.error('[Auto] Failed to process subscriptions:', error)
      }
    }

    // Перевіряємо одразу при завантаженні (вже робиться в loadAllData, але для надійності)
    // І потім кожні 5 хвилин
    const interval = setInterval(checkSubscriptions, 5 * 60 * 1000) // 5 хвилин

    return () => clearInterval(interval)
  }, [session?.user?.id])

  // Show loader while checking auth
  if (loading) {
    return (
      <AppLoader />
    )
  }

  // Show auth screen if not authenticated
  if (!session) {
    return <Auth />
  }

  // Approving a Claude connection: just that, without loading the whole app
  if (connectReq) {
    return <ConnectClaudePage req={connectReq} onClose={() => setConnectReq(null)} />
  }

  
  

  return (
    <div className="app-container min-h-dvh pt-4 sm:pt-6 pb-40 lg:pb-6">
      {/* Phone & tablet: bottom dock like the iPhone app */}
      <div className="lg:hidden"><MobileDock /></div>
      {/* Phone & tablet: the floating + (on desktop it sits in the sidebar) */}
      <div className="lg:hidden"><QuickAddFab /></div>
      {/* «AI-асистент»: from the + or a transaction's «Запитати AI» */}
      <AssistantPanel />
      {/* A transaction's right-click menu and «Додати в підписку» */}
      <TxContextMenuHost />

      <div className="max-w-[1300px] mx-auto grid grid-cols-1 lg:grid-cols-[230px_1fr_360px] gap-4">
        <div className="hidden lg:block"><Sidebar /></div>
        
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/analytics" element={
            <div className="lg:col-span-2">
              <AnalyticsPage />
            </div>
          } />
          <Route path="/profile" element={
            <div className="lg:col-span-2">
              <ProfilePage />
            </div>
          } />
          <Route path="/subscriptions" element={
            <div className="lg:col-span-2">
              <SubscriptionsPage />
            </div>
          } />
            <Route path="/cards" element={
              <div className="lg:col-span-2">
                <CardsPage />
              </div>
            } />
            <Route path="/archives" element={
              <div className="lg:col-span-2">
                <ArchivesPage />
              </div>
            } />
          <Route path="/admin" element={
            <div className="lg:col-span-2">
              <AdminPage />
            </div>
          } />
          <Route path="/debts" element={
            <div className="lg:col-span-2">
              <DebtsPage />
            </div>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}

/** Full-screen loader on the dark background (orange ring, like the iPhone app) */
function AppLoader({ subtitle }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="text-center">
        <div className="relative w-14 h-14 mx-auto mb-4">
          <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-brand rounded-full border-t-transparent animate-spin"></div>
        </div>
        <div className="text-white/85 font-semibold">Завантаження...</div>
        {subtitle && <div className="text-sm text-white/45 mt-1">{subtitle}</div>}
      </div>
    </div>
  )
}
