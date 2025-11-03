import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Sidebar from './components/Sidebar.jsx'
import DashboardPage from './pages/DashboardPage'
import ProfilePage from './pages/ProfilePage'
import Auth from './components/Auth'
import { txBus } from './utils/txBus'
import { getApiUrl } from './utils.jsx'

export default function App(){
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncLoading, setSyncLoading] = useState(false)

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
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
      // Clean up URL hash if present
      if (session && window.location.hash.includes('access_token')) {
        window.history.replaceState(null, '', window.location.pathname)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Auto-sync Binance on app load (only when authenticated)
  useEffect(() => {
    if (!session) return

    const syncBinance = async () => {
      try {
        setSyncLoading(true)
        const response = await fetch(`${getApiUrl()}/api/syncBinance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
        const data = await response.json()
        
        if (data.success && data.synced) {
          // Transaction was created, emit event to update all components
          console.log('Binance synced:', data.message)
          // Small delay to ensure components are fully mounted and subscribed
          setTimeout(() => {
            txBus.emit({ 
              card_id: data.card_id, 
              delta: data.delta 
            })
          }, 300)
        } else {
          console.log('Binance sync:', data.message)
        }
      } catch (error) {
        console.error('Binance sync failed:', error.message)
      } finally {
        setSyncLoading(false)
      }
    }

    syncBinance()
  }, [session])

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

  // Show sync loader while syncing Binance
  if (syncLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-indigo-200 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <div className="text-gray-600 font-medium">Завантаження...</div>
          <div className="text-sm text-gray-400 mt-1">Синхронізація даних</div>
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
