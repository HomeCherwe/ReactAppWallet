import { useEffect, useState, useRef } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase, cacheUser, getUserCacheStats } from './lib/supabase'
import Sidebar from './components/Sidebar.jsx'
import DashboardPage from './pages/DashboardPage'
import ProfilePage from './pages/ProfilePage'
import Auth from './components/Auth'
import { txBus } from './utils/txBus'
import { getApiUrl, apiFetch } from './utils.jsx'
import { listCards } from './api/cards'
import { sumTransactionsByCard, listTransactions } from './api/transactions'
import { fetchTotalsByBucket } from './api/totals'

export default function App(){
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncLoading, setSyncLoading] = useState(false)
  const [initialDataLoading, setInitialDataLoading] = useState(true)
  const loadedUserIdRef = useRef(null)

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
      }
      setLoading(false)
      // Clean up URL hash if present
      if (session && window.location.hash.includes('access_token')) {
        window.history.replaceState(null, '', window.location.pathname)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Auto-sync Binance and load all initial data on app load (only when authenticated)
  useEffect(() => {
    if (!session) {
      // If no session, still allow components to load (for non-authenticated users)
      setInitialDataLoading(false)
      loadedUserIdRef.current = null
      return
    }

    const currentUserId = session.user?.id
    
    // If data is already loaded for this user, do not reload
    if (loadedUserIdRef.current === currentUserId) {
      setInitialDataLoading(false)
      return
    }

    const loadAllData = async () => {
      try {
        setSyncLoading(true)
        setInitialDataLoading(true)

        // Sync Binance first
        const syncBinancePromise = apiFetch('/api/syncBinance', {
          method: 'POST'
        }).then(response => {
          const data = response || {}
          if (data.success && data.synced) {
            console.log('Binance synced:', data.message)
            // Small delay to ensure components are fully mounted and subscribed
            setTimeout(() => {
              txBus.emit({ 
                card_id: data.card_id, 
                delta: data.delta 
              })
            }, 300)
          } else {
            console.log('Binance sync:', data.message || 'No message')
          }
          return data
        }).catch(error => {
          console.error('Binance sync failed:', error.message)
          return null
        })

        // Load all critical data in parallel
        const dataPromises = [
          syncBinancePromise,
          listCards().catch(e => { console.error('listCards error:', e); return [] }),
          sumTransactionsByCard().catch(e => { console.error('sumTransactionsByCard error:', e); return {} }),
          fetchTotalsByBucket().catch(e => { console.error('fetchTotalsByBucket error:', e); return { cash: {}, cards: {}, savings: {} } }),
          listTransactions({ from: 0, to: 9, search: '' }).catch(e => { console.error('listTransactions error:', e); return [] })
        ]

        // Wait for all promises to complete (including the last one)
        await Promise.all(dataPromises)
        
        console.log('All initial data loaded')
        loadedUserIdRef.current = currentUserId // Mark user as loaded
      } catch (error) {
        console.error('Error loading initial data:', error)
      } finally {
        setSyncLoading(false)
        setInitialDataLoading(false)
      }
    }

    loadAllData()
  }, [session]) // Dependency on session to re-run if user changes

  // Логування статистики кешу після повного завантаження
  useEffect(() => {
    const timer = setTimeout(() => {
      const stats = getUserCacheStats()
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  // Show loader while checking auth
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-pink-400 via-fuchsia-500 to-sky-500">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-white/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-white rounded-full border-t-transparent animate-spin"></div>
          </div>
          <div className="text-white font-medium">Завантаження...</div>
        </div>
      </div>
    )
  }

  // Show auth screen if not authenticated
  if (!session) {
    return <Auth />
  }

  // Show loader while syncing Binance or loading initial data
  if (syncLoading || initialDataLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-indigo-200 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <div className="text-gray-600 font-medium">Завантаження...</div>
          <div className="text-sm text-gray-400 mt-1">
            {syncLoading ? 'Синхронізація даних' : 'Завантаження даних'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container min-h-dvh sm:pt-6 pb-20 sm:pb-2">
      {/* Mobile sidebar - fixed at bottom */}
      <Sidebar className="sm:hidden" />
      
      <div className="max-w-[1300px] mx-auto grid grid-cols-1 lg:grid-cols-[220px_1fr_360px] gap-4 sm:gap-4">
        <div className="hidden sm:block"><Sidebar /></div>
        
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile" element={
            <div className="lg:col-span-2">
              <ProfilePage />
            </div>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}
