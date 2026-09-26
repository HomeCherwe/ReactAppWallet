import EarningsStatCard from '../components/EarningsStatCard'
import TotalsCard from '../components/totals/TotalsCard'
import EarningsChart from '../charts/EarningsChart'
import MonthlyPayment from '../components/transactions/MonthlyPayment'
import CardsManager from '../components/CardsManager'
import { MobileHeader } from '../components/Sidebar'

export default function DashboardPage() {
  return (
    <>
      {/* Middle column */}
      <div className="space-y-4">
        <MobileHeader />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 [&>*:last-child]:col-span-full md:[&>*:last-child]:col-span-1">
          <EarningsStatCard title="Доходи" mode="earning" />
          <EarningsStatCard title="Витрати" mode="spending" />
          <TotalsCard title="Загальний баланс" />
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

