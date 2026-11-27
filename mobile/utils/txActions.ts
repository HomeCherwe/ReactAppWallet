import { Alert } from 'react-native'
import Toast from 'react-native-toast-message'
import { archiveTransaction, deleteTransaction, Transaction } from '../api/transactions'

/**
 * «Видалити» (swipe, long press or the transaction's sheet): delete for good, or put it in the
 * archive, where it leaves the lists and the balance but can come back (Налаштування → Архів).
 */
export function confirmDeleteTx(tx: Transaction, onDone: (tx: Transaction) => void) {
  Alert.alert(
    'Видалити транзакцію?',
    'Видалення не можна скасувати. В архіві вона зникне зі списку й балансу, але її можна повернути (Налаштування → Архів).',
    [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'В архів',
        onPress: async () => {
          try {
            await archiveTransaction(tx.id)
            Toast.show({ type: 'success', text1: 'Транзакцію заархівовано', text2: 'Повернути: Налаштування → Архів' })
            onDone(tx)
          } catch (e: any) {
            Alert.alert('Помилка', e.message || 'Не вдалося заархівувати')
          }
        },
      },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTransaction(tx.id)
            onDone(tx)
          } catch (e: any) {
            Alert.alert('Помилка', e.message || 'Не вдалося видалити')
          }
        },
      },
    ]
  )
}
