import { invalidateSumByCardCache } from './dataCache'

type TxBusListener = (event: any) => void
const listeners: TxBusListener[] = []

export const txBus = {
  emit(event: any) {
    // Transactions changed (a bank sync too, on the server): balances are counted again
    invalidateSumByCardCache()
    listeners.forEach((fn) => fn(event))
  },
  subscribe(fn: TxBusListener) {
    listeners.push(fn)
    return () => {
      const idx = listeners.indexOf(fn)
      if (idx !== -1) listeners.splice(idx, 1)
    }
  },
}
