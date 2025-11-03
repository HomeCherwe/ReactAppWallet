import { useMemo } from 'react'
import BalanceCard from './BalanceCard'

const ORDER = ['UAH','EUR','USD','PLN','GBP','CHF','CZK','HUF']

export default function TotalsGrid({ totals, sectionType, isVisible }) {
  const entries = useMemo(() => {
    // Filter out null, undefined, and zero values
    const list = Object.entries(totals || {}).filter(([,v]) => v != null && v !== 0)
    const ordered = [], rest = []
    for (const [k,v] of list) (ORDER.includes(k) ? ordered : rest).push([k,v])
    ordered.sort((a,b)=>ORDER.indexOf(a[0])-ORDER.indexOf(b[0]))
    rest.sort((a,b)=>a[0].localeCompare(b[0]))
    return [...ordered, ...rest]
  }, [totals])

  if (!entries.length) {
    return (
      <div className="text-center py-8 text-sm text-gray-500">Немає даних</div>
    )
  }

  return (
    <div className="grid gap-2">
      {entries.map(([code, val], i) => (
        <BalanceCard
          key={code}
          currency={code}
          amount={val}
          isVisible={isVisible}
          sectionType={sectionType}
        />
      ))}
    </div>
  )
}
