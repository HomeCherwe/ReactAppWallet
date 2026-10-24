import { Alert, AlertButton } from 'react-native'
import Toast from 'react-native-toast-message'
import { Card } from '../api/cards'
import { listTransferLegs, Transaction } from '../api/transactions'
import { unlinkTransfer } from '../api/transfers'
import { formatMoney } from './currency'
import { triggerErrorHaptic, triggerSuccessHaptic } from './haptics'
import { cardLabel } from './cardLabel'

/**
 * «Скасувати переказ», from the long-press menu or the transaction sheet. Unlinking keeps both legs
 * as ordinary transactions; a leg that isn't a bank import (the one the app created when the
 * transfer was made, or both for a transfer made in the app) can be deleted instead, so undoing
 * doesn't leave money that never moved.
 */
export async function confirmUnlinkTransfer(tx: Transaction, cards: Card[], onDone: () => void): Promise<void> {
  const transferId = tx.transfer_id
  if (!transferId) return
  let legs: Transaction[] = []
  try {
    legs = await listTransferLegs([transferId])
  } catch {
    legs = [tx]
  }
  const cardOf = (l: Transaction) => (l.card_id ? cards.find(c => c.id === l.card_id) : undefined)
  const label = (l: Transaction) => {
    const amount = Number(l.amount)
    const card = cardOf(l)
    return `${amount < 0 ? '−' : '+'}${formatMoney(Math.abs(amount), l.currency || card?.currency || 'UAH')} · ${card ? cardLabel(card) : l.card_id ? 'рахунок' : 'Готівка'}`
  }
  // Not from a bank: made in the app (or typed in by hand) — the only legs that may be deleted
  const appMade = legs.filter(l => !(l as any).transaction_id_card)

  const run = async (deleteIds: string[]) => {
    try {
      await unlinkTransfer(transferId, deleteIds)
      triggerSuccessHaptic()
      const kept = legs.length - deleteIds.length
      Toast.show({
        type: 'success',
        text1: kept === 0 ? 'Переказ видалено' : 'Переказ скасовано',
        text2: kept > 0 ? 'Постав категорію тому, що лишилось' : undefined,
      })
      onDone()
    } catch (e: any) {
      triggerErrorHaptic()
      Toast.show({ type: 'error', text1: 'Не вдалося скасувати переказ', text2: e?.message })
    }
  }

  const buttons: AlertButton[] = []
  if (legs.length === 2 && appMade.length === 1) {
    buttons.push({ text: `Видалити ${label(appMade[0])}`, style: 'destructive', onPress: () => run([appMade[0].id]) })
  }
  if (appMade.length === legs.length && legs.length > 0) {
    buttons.push({ text: 'Видалити переказ повністю', style: 'destructive', onPress: () => run(appMade.map(l => l.id)) })
  }
  buttons.push({ text: 'Роз’єднати — лишити обидві', onPress: () => run([]) })
  buttons.push({ text: 'Ні', style: 'cancel' })

  const lines = legs.map(label).join('\n')
  const hint =
    appMade.length === 1 && legs.length === 2
      ? `\n\n«${label(appMade[0])}» — не з банку: якщо застосунок створив її для цього переказу, видали її.`
      : appMade.length === legs.length
        ? '\n\nОбидві частини зроблені в застосунку — переказ можна видалити повністю.'
        : ''
  Alert.alert(
    'Скасувати переказ?',
    `${lines}\n\nРоз’єднані частини стануть звичайними транзакціями без категорії й повернуться в статистику.${hint}`,
    buttons
  )
}
