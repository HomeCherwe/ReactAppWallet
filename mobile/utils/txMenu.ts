import { Transaction } from '../api/transactions'
import { MenuAction } from '../store/useMenuOverlay'
import { pinStateOf } from './pinned'

/** What a list can do with a transaction; a missing handler leaves its item out */
export interface TxMenuHandlers {
  onAskAI?: (tx: Transaction) => void
  /** «Вибрати»: selection mode (Home only) */
  onStartSelect?: (tx: Transaction) => void
  /** Categories pinned in Settings: their transactions are pinned by category, not one by one */
  pinnedCategories?: string[]
  /** Opens the transaction (here: to pick its category) */
  onPressTx?: (tx: Transaction) => void
  onTogglePin?: (tx: Transaction) => void
  onSplitTx?: (tx: Transaction) => void
  onAddToSubscription?: (tx: Transaction) => void
  onMakeTransfer?: (tx: Transaction) => void
  onUnlinkTransfer?: (tx: Transaction) => void
  /** Starts linking a refund to an expense, or offers to undo it on a refund */
  onStartRefund?: (tx: Transaction) => void
  canLinkRefund?: boolean
  canUnlinkRefund?: boolean
  onDeleteTx?: (tx: Transaction) => void
}

/** The long-press menu of a transaction — the same on Home, on a card and in a category */
export function txMenuActions(tx: Transaction, h: TxMenuHandlers): MenuAction[] {
  const out: MenuAction[] = []
  if (h.onAskAI) out.push({ label: 'Запитати AI', icon: 'sparkles', ai: true, onPress: () => h.onAskAI!(tx) })
  if (h.onStartSelect) out.push({ label: 'Вибрати', icon: 'check', onPress: () => h.onStartSelect!(tx) })
  const pin = pinStateOf(tx, h.pinnedCategories ?? [])
  if (pin === 'category') {
    out.push({ label: 'Обрати категорію', icon: 'tag', onPress: () => h.onPressTx?.(tx) })
  } else if (h.onTogglePin) {
    out.push({ label: pin === 'tag' ? 'Відкріпити' : 'Закріпити', icon: pin === 'tag' ? 'pinOff' : 'pin', onPress: () => h.onTogglePin!(tx) })
  }
  if (h.onSplitTx && !tx.refund_for) out.push({ label: 'Розділити', icon: 'split', onPress: () => h.onSplitTx!(tx) })
  // A charge the bank named differently than its subscription (the web's right click has the same)
  if (h.onAddToSubscription && Number(tx.amount) < 0 && !tx.is_transfer && tx.status !== 'pending') {
    out.push({ label: tx.subscription_id ? 'Підписка…' : 'Додати в підписку', icon: 'repeat', onPress: () => h.onAddToSubscription!(tx) })
  }
  if (tx.is_transfer && tx.transfer_id) {
    if (h.onUnlinkTransfer) out.push({ label: 'Скасувати переказ', icon: 'transfer', onPress: () => h.onUnlinkTransfer!(tx) })
  } else if (h.onMakeTransfer && !tx.refund_for && !tx.is_debt && tx.status !== 'pending') {
    out.push({ label: 'Зробити переказом', icon: 'transfer', onPress: () => h.onMakeTransfer!(tx) })
  }
  if (h.onStartRefund && h.canLinkRefund && Number(tx.amount) < 0 && !tx.is_transfer) {
    out.push({ label: 'Прив’язати повернення', icon: 'undo', onPress: () => h.onStartRefund!(tx) })
  }
  if (h.onStartRefund && h.canUnlinkRefund && tx.refund_for) {
    out.push({ label: 'Скасувати повернення', icon: 'close', onPress: () => h.onStartRefund!(tx) })
  }
  if (h.onDeleteTx) out.push({ label: 'Видалити', icon: 'trash', destructive: true, onPress: () => h.onDeleteTx!(tx) })
  return out
}
