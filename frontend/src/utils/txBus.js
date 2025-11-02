const subs = new Set()

export const txBus = {
  // legacy / alternative name
  on(fn) { subs.add(fn); return () => subs.delete(fn) },
  // CardsManager expects subscribe()
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
  // alias for clarity
  off(fn) { return subs.delete(fn) },
  emit(evt) { subs.forEach(fn => fn(evt)) },
}
