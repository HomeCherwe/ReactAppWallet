import React, { useCallback, useMemo, useState } from 'react'
import Toast from 'react-native-toast-message'
import { Card } from '../api/cards'
import { linkRefund, unlinkRefund, updateTransaction, Transaction } from '../api/transactions'
import AddToSubscriptionSheet from '../components/AddToSubscriptionSheet'
import AssistantSheet from '../components/AssistantSheet'
import SplitTxModal from '../components/SplitTxModal'
import TransferFromTxSheet from '../components/TransferFromTxSheet'
import { useSettingsStore } from '../store/useSettingsStore'
import { isSyncCategory } from '../utils/cardExclusion'
import { triggerLightHaptic } from '../utils/haptics'
import { hasPinTag, pinStateOf, withPinTag } from '../utils/pinned'
import { confirmDeleteTx } from '../utils/txActions'
import { confirmUnlinkTransfer } from '../utils/transferActions'
import { TxMenuHandlers } from '../utils/txMenu'

export type TxChange = 'deleted' | 'changed'

interface Options {
  cards: Card[]
  hidden?: boolean
  /** Something changed: 'deleted' (deleted or archived — gone from the list) or 'changed' */
  onChanged: (change: TxChange, tx?: Transaction) => void
}

/**
 * Everything the long-press menu and the swipe can do with a transaction, for lists outside Home
 * (a card's transactions, a category in Analytics): the handlers, the refund being picked, and the
 * sheets those actions open (render `sheets` inside the list's own sheet, so iOS shows them on top).
 */
export function useTxActions({ cards, hidden, onChanged }: Options) {
  const [splitTx, setSplitTx] = useState<Transaction | null>(null)
  const [transferFor, setTransferFor] = useState<Transaction | null>(null)
  // undefined = closed; the chat opens about one transaction
  const [askTx, setAskTx] = useState<Transaction | null | undefined>(undefined)
  const [subscriptionTx, setSubscriptionTx] = useState<Transaction | null>(null)
  const [refundFor, setRefundFor] = useState<Transaction | null>(null)
  // A stable selector (zustand 5 re-renders forever on a fresh [] every time)
  const pinnedRaw = useSettingsStore(s => s.settings?.dashboard?.pinnedCategories)
  const pinnedCategories = useMemo<string[]>(() => (Array.isArray(pinnedRaw) ? pinnedRaw : []), [pinnedRaw])
  const activeCards = useMemo(() => cards.filter(c => !c.archived), [cards])

  const changed = useCallback((tx?: Transaction) => onChanged('changed', tx), [onChanged])

  const togglePin = useCallback(
    async (tx: Transaction) => {
      triggerLightHaptic()
      if (pinStateOf(tx, pinnedCategories) === 'category') {
        Toast.show(
          tx.category && isSyncCategory(tx.category)
            ? {
                type: 'info',
                text1: 'Чекає на категорію',
                text2: 'Відкрийте транзакцію й оберіть категорію — вона перейде в загальний список',
                visibilityTime: 4500,
              }
            : { type: 'info', text1: 'Закріплено через категорію', text2: `«${tx.category}» — змінюється в налаштуваннях` }
        )
        return
      }
      const pin = !hasPinTag(tx.note)
      try {
        await updateTransaction(tx.id, { note: withPinTag(tx.note, pin) } as Partial<Transaction>)
        Toast.show({ type: 'success', text1: pin ? '📌 Закріплено' : 'Відкріплено' })
        changed(tx)
      } catch (e: any) {
        Toast.show({ type: 'error', text1: 'Не вдалося змінити закріплення', text2: e?.message })
      }
    },
    [pinnedCategories, changed]
  )

  const handlers: TxMenuHandlers & {
    onLinkRefund: (expense: Transaction, refund: Transaction) => Promise<void>
    onUnlinkRefund: (refund: Transaction) => Promise<void>
  } = {
    onAskAI: tx => setAskTx(tx),
    pinnedCategories,
    onTogglePin: togglePin,
    onSplitTx: setSplitTx,
    onAddToSubscription: setSubscriptionTx,
    onMakeTransfer: setTransferFor,
    onUnlinkTransfer: tx => confirmUnlinkTransfer(tx, cards, () => changed(tx)),
    onDeleteTx: tx => confirmDeleteTx(tx, t => onChanged('deleted', t)),
    onLinkRefund: async (expense, refund) => {
      await linkRefund(expense.id, refund.id)
      changed(expense)
    },
    onUnlinkRefund: async refund => {
      await unlinkRefund(refund.id)
      changed(refund)
    },
  }

  const sheets = (
    <>
      <SplitTxModal
        visible={!!splitTx}
        tx={splitTx}
        cards={cards}
        onClose={() => setSplitTx(null)}
        onDone={() => changed(splitTx ?? undefined)}
      />
      <TransferFromTxSheet
        tx={transferFor}
        cards={activeCards}
        hidden={hidden}
        onClose={() => setTransferFor(null)}
        onDone={() => changed(transferFor ?? undefined)}
      />
      <AssistantSheet
        visible={askTx !== undefined}
        tx={askTx}
        cards={cards}
        hidden={hidden}
        onClose={() => setAskTx(undefined)}
        onChanged={() => changed()}
      />
      <AddToSubscriptionSheet tx={subscriptionTx} cards={cards} onClose={() => setSubscriptionTx(null)} />
    </>
  )

  return { handlers, refundFor, setRefundFor, sheets }
}
