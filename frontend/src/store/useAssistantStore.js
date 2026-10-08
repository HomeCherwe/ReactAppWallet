import { create } from 'zustand'

// «AI-асистент» panel: opened from the + (general chat) or a transaction («Запитати AI»)
export const useAssistantStore = create(set => ({
  open: false,
  tx: null,
  show: (tx = null) => set({ open: true, tx }),
  hide: () => set({ open: false }),
}))
