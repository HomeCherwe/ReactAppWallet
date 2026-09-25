type TxBusListener = (event: any) => void
const listeners: TxBusListener[] = []

export const txBus = {
  emit(event: any) {
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
