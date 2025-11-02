import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import StatCard from './components/StatCard.jsx'
import EarningsStatCard from './components/EarningsStatCard'
import CardsManager from './components/CardsManager'
import TotalsCard from './components/totals/TotalsCard'
import MonthlyPayment from './components/transactions/MonthlyPayment'
import EarningsChart from './charts/EarningsChart.jsx'
import { txBus } from './utils/txBus'

export default function App(){
  const [loading, setLoading] = useState(true)

  // Auto-sync Binance on app load
  useEffect(() => {
    const syncBinance = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8787'
        const response = await fetch(`${apiUrl}/api/syncBinance`, {
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
        // Hide loader after sync completes (success or failure)
        setLoading(false)
      }
    }

    syncBinance()
  }, [])

  // Show fullscreen loader while syncing
  if (loading) {
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
        {/* Middle column */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 [&>*:last-child]:col-span-full md:[&>*:last-child]:col-span-1">
            <EarningsStatCard title="Earning" mode="earning" />
            <EarningsStatCard title="Spending" mode="spending" />
            <TotalsCard title="Total balance" />
          </div>
          <EarningsChart />
          <MonthlyPayment />
        </div>

        {/* Right column */}
        <div className="space-y-4 sticky top-6 self-start">
          <CardsManager />
        </div>
      </div>
    </div>
  )
}
