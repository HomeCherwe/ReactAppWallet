import EarningsStatCard from '../components/EarningsStatCard'
import TotalsCard from '../components/totals/TotalsCard'
import SavingsCard from '../components/totals/SavingsCard'
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
        <div className="grid grid-cols-2 gap-3">
          <EarningsStatCard title="Доходи" mode="earning" />
          <EarningsStatCard title="Витрати" mode="spending" />
        </div>
        {/* The same two blocks as the iPhone Home: the whole balance and the piggy banks */}
        <div className="grid md:grid-cols-2 gap-3 items-start">
          <TotalsCard title="Загальний баланс" />
          <SavingsCard />
        </div>
        <EarningsChart />
        <MonthlyPayment />
      </div>

      {/* Right column - тільки для десктопу */}
      <div className="space-y-4 sticky top-6 self-start hidden sm:block">
        <CardsManager />
      </div>
    </>
  )
}

