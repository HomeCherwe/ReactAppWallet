import { create } from 'zustand'

// Right click on a transaction (like the iPhone's long press): the menu where it was clicked, and
// the «Додати в підписку» window it can open. TxContextMenuHost (in App) shows both.
export const useTxMenuStore = create(set => ({
  // { x, y, actions: [{ label, Icon, onClick, danger?, ai? }] }
  menu: null,
  subscriptionTx: null,
  openMenu: menu => set({ menu }),
  closeMenu: () => set({ menu: null }),
  openSubscriptionPicker: tx => set({ menu: null, subscriptionTx: tx }),
  closeSubscriptionPicker: () => set({ subscriptionTx: null }),
}))
