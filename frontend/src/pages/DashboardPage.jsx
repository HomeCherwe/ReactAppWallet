import EarningsStatCard from '../components/EarningsStatCard'
import TotalsCard from '../components/totals/TotalsCard'
import EarningsChart from '../charts/EarningsChart'
import MonthlyPayment from '../components/transactions/MonthlyPayment'
import CardsManager from '../components/CardsManager'

export default function DashboardPage() {
  return (
    <>
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

      {/* Right column - тільки для десктопу */}
      <div className="space-y-4 sticky top-6 self-start hidden sm:block">
        <CardsManager showActions={false} />
      </div>
    </>
  )
}

