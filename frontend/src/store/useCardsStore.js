import { useCallback, useEffect } from 'react'
import { create } from 'zustand'
import { listCards } from '../api/cards'
import { onCardsInvalidated } from '../utils/dataCache'
import { txCardLabel } from '../utils/cardLabel'

/** The user's cards by id, for naming a transaction's account anywhere (rows, details, pickers) */
export const useCardsStore = create((set, get) => ({
  byId: {},
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const cards = await listCards()
      set({ byId: Object.fromEntries((cards || []).map(c => [c.id, c])), loaded: true })
    } catch (e) {
      console.error('Failed to load cards for labels:', e)
    } finally {
      set({ loading: false })
    }
  },
}))

// A card was added, renamed or removed: names follow
onCardsInvalidated(() => {
  if (useCardsStore.getState().loaded) useCardsStore.getState().load()
})

/** (tx) => its account's name, from the card (see txCardLabel) */
export function useCardLabeler() {
  const byId = useCardsStore(s => s.byId)
  useEffect(() => {
    const s = useCardsStore.getState()
    if (!s.loaded && !s.loading) s.load()
  }, [])
  return useCallback(tx => txCardLabel(tx, byId), [byId])
}
