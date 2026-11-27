import { apiFetch } from '../utils.jsx'
import { primeCards, primeCash, primeSumByCard } from '../utils/dataCache'
import { fetchCardsFresh } from './cards'
import { _sumTransactionsByCardInternal } from './transactions'

/**
 * At launch: the accounts, their sums and cash in one request (GET /api/home), started before the
 * widgets ask for them — they share it through the caches instead of asking one by one. If it
 * fails, each widget's usual request runs instead.
 */
export function startHomePrefetch() {
  const home = apiFetch('/api/home?months=0')
  primeCards(home.then(h => h.cards), fetchCardsFresh)
  primeSumByCard(home.then(h => h.sums), _sumTransactionsByCardInternal)
  primeCash(home.then(h => h.cash))
  return home
}
