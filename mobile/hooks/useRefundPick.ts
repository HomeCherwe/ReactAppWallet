import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Animated } from 'react-native'
import Toast from 'react-native-toast-message'
import { Transaction } from '../api/transactions'
import { RowMode, fmtMoney } from '../components/TxRow'
import { triggerErrorHaptic, triggerMediumHaptic, triggerSuccessHaptic } from '../utils/haptics'
import { txDisplayTitle } from '../utils/pinned'

/** Can this transaction be picked as the refund of an expense? */
export function canBeRefund(t: Transaction): boolean {
  return Number(t.amount) > 0 && !t.refund_for && !t.is_transfer && !t.archives
}

interface Options {
  /** The expense being given a refund (null when not picking); the screen keeps it */
  refundFor: Transaction | null
  onRefundForChange: (tx: Transaction | null) => void
  /** Links `refund` (income) as a refund of `expense` */
  onLinkRefund?: (expense: Transaction, refund: Transaction) => Promise<void>
  /** Unlinks a refund: it counts as regular income again */
  onUnlinkRefund?: (refund: Transaction) => Promise<void>
}

/**
 * Linking a refund, the same in every list (Home, a card, a category): swipe an expense or long-press
 * → «Прив’язати повернення», then tap the income that returned the money. On a refund the same
 * action offers to undo it.
 */
export function useRefundPick({ refundFor, onRefundForChange, onLinkRefund, onUnlinkRefund }: Options) {
  const setRefundFor = (tx: Transaction | null) => onRefundForChange(tx)
  const [linking, setLinking] = useState(false)

  // Pickable rows jiggle while picking (one shared native-driven value)
  const wiggle = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!refundFor) {
      wiggle.stopAnimation()
      wiggle.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wiggle, { toValue: 1, duration: 110, useNativeDriver: true }),
        Animated.timing(wiggle, { toValue: -1, duration: 220, useNativeDriver: true }),
        Animated.timing(wiggle, { toValue: 0, duration: 110, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [refundFor])

  const cancelRefundPick = useCallback(() => {
    setRefundFor(null)
  }, [])

  const startRefund = useCallback(
    (tx: Transaction) => {
      if (tx.refund_for) {
        // Already a refund: offer to unlink it
        Alert.alert(
          'Скасувати повернення?',
          `«${txDisplayTitle(tx)}» знову рахуватиметься як звичайний дохід у статистиці.`,
          [
            { text: 'Ні', style: 'cancel' },
            {
              text: 'Скасувати повернення',
              style: 'destructive',
              onPress: async () => {
                try {
                  await onUnlinkRefund?.(tx)
                  triggerSuccessHaptic()
                  Toast.show({ type: 'success', text1: 'Повернення скасовано', text2: 'Транзакція знову враховується як дохід' })
                } catch (e: any) {
                  triggerErrorHaptic()
                  Toast.show({ type: 'error', text1: 'Не вдалося скасувати повернення', text2: e?.message })
                }
              },
            },
          ]
        )
        return
      }
      if (Number(tx.amount) >= 0) {
        triggerErrorHaptic()
        Toast.show({
          type: 'info',
          text1: 'Повернення — тільки для витрат',
          text2: 'Потягніть уліво витрату (−), а потім оберіть дохід, яким її повернули',
          visibilityTime: 4500,
        })
        return
      }
      if (tx.is_transfer) {
        triggerErrorHaptic()
        Toast.show({ type: 'info', text1: 'Переказ не може мати повернення', text2: 'Оберіть звичайну витрату' })
        return
      }
      triggerMediumHaptic()
      setTimeout(() => setRefundFor(tx), 180)
    },
    [onUnlinkRefund]
  )

  const pickRefund = useCallback(
    async (refund: Transaction) => {
      const expense = refundFor
      if (!expense || linking) return
      if (refund.id === expense.id) return
      if (!canBeRefund(refund)) {
        triggerErrorHaptic()
        Toast.show({
          type: 'error',
          text1: refund.refund_for ? 'Це вже повернення іншої витрати' : 'Оберіть дохід (+)',
          text2: refund.refund_for
            ? 'Спершу скасуйте його повернення свайпом уліво'
            : 'Повернення — це гроші, що прийшли назад: від магазину, сервісу чи друга',
          visibilityTime: 4000,
        })
        return
      }
      setLinking(true)
      try {
        await onLinkRefund?.(expense, refund)
        triggerSuccessHaptic()
        setRefundFor(null)
        const refundAmount = Number(refund.amount)
        // What's left after all its refunds (earlier ones are already in amount_stat)
        const left = -(Number(expense.amount_stat ?? expense.amount) + refundAmount)
        Toast.show({
          type: 'success',
          text1: 'Повернення прив’язано',
          text2:
            left > 0.005
              ? `«${txDisplayTitle(expense)}»: у статистиці тепер −${fmtMoney(left)}`
              : `«${txDisplayTitle(expense)}» повністю повернено`,
        })
      } catch (e: any) {
        triggerErrorHaptic()
        Toast.show({ type: 'error', text1: 'Не вдалося прив’язати повернення', text2: e?.message })
      } finally {
        setLinking(false)
      }
    },
    [refundFor, linking, onLinkRefund]
  )

  const modeFor = (t: Transaction): RowMode => {
    if (!refundFor) return 'normal'
    if (t.id === refundFor.id) return 'target'
    return canBeRefund(t) ? 'pickable' : 'dimmed'
  }

  return { linking, wiggle, cancelRefundPick, startRefund, pickRefund, modeFor }
}
