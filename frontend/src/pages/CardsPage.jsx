import { useState } from 'react'
import CardsManager from '../components/CardsManager'
import BankConnections from '../components/BankConnections'

export default function CardsPage() {
  // Bumped when connected banks add cards/transactions, so the cards list reloads
  const [reloadKey, setReloadKey] = useState(0)

  return (
    <div className="w-full">
      <BankConnections onChanged={() => setReloadKey(k => k + 1)} />
      <CardsManager groupByBank={true} showActions={true} reloadKey={reloadKey} />
    </div>
  )
}
