import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { txBus } from '../utils/txBus'

/**
 * Хук для підписки на Realtime зміни транзакцій
 * Автоматично оновлює компоненти через txBus коли з'являються нові транзакції
 */
export function useRealtimeTransactions() {
  const subscriptionRef = useRef(null)

  useEffect(() => {
    let mounted = true
    
    // Отримуємо поточного користувача
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !mounted) return

      console.log('[Realtime] Підписуюсь на зміни транзакцій для user:', user.id)

      // Підписуємось на зміни в таблиці transactions для поточного користувача
      const channel = supabase
        .channel(`transactions-changes-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*', // INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'transactions',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('[Realtime] Transaction change detected:', payload.eventType, payload.new || payload.old)
            
            // Викликаємо txBus для сповіщення всіх компонентів
            if (payload.eventType === 'INSERT' && payload.new) {
              // Нова транзакція додана - перевіряємо чи не архівована
              const newTx = payload.new
              // Пропускаємо архівовані транзакції
              if (newTx.archives === true || newTx.archives === 'true') {
                return
              }
              console.log('[Realtime] Нова транзакція додана:', newTx.id)
              txBus.emit({ 
                type: 'INSERT',
                transaction: newTx,
                card_id: newTx.card_id || null,
                delta: Number(newTx.amount || 0)
              })
            } else if (payload.eventType === 'UPDATE' && payload.new) {
              // Транзакція оновлена
              const updatedTx = payload.new
              const oldTx = payload.old
              // Якщо транзакцію архівовано, це еквівалентно видаленню
              if (updatedTx.archives === true || updatedTx.archives === 'true') {
                console.log('[Realtime] Транзакція архівована:', updatedTx.id)
                txBus.emit({ 
                  type: 'DELETE',
                  transaction: updatedTx,
                  card_id: updatedTx.card_id || null,
                  delta: -Number(updatedTx.amount || 0)
                })
              } else {
                console.log('[Realtime] Транзакція оновлена:', updatedTx.id)
                txBus.emit({ 
                  type: 'UPDATE',
                  transaction: updatedTx,
                  oldTransaction: oldTx,
                  card_id: updatedTx.card_id || null,
                  delta: Number(updatedTx.amount || 0) - Number(oldTx?.amount || 0)
                })
              }
            } else if (payload.eventType === 'DELETE' && payload.old) {
              // Транзакція видалена
              const deletedTx = payload.old
              console.log('[Realtime] Транзакція видалена:', deletedTx.id)
              txBus.emit({ 
                type: 'DELETE',
                transaction: deletedTx,
                card_id: deletedTx.card_id || null,
                delta: -Number(deletedTx.amount || 0)
              })
            }
          }
        )
        .subscribe((status) => {
          console.log('[Realtime] Subscription status:', status)
          if (status === 'SUBSCRIBED') {
            console.log('[Realtime] ✅ Успішно підписано на зміни транзакцій')
          } else if (status === 'CHANNEL_ERROR') {
            console.error('[Realtime] ❌ Помилка підписки на зміни транзакцій')
          }
        })
      
      subscriptionRef.current = channel
    })

    // Очищення при розмонтуванні
    return () => {
      mounted = false
      if (subscriptionRef.current) {
        console.log('[Realtime] Відписуюсь від змін транзакцій')
        supabase.removeChannel(subscriptionRef.current)
        subscriptionRef.current = null
      }
    }
  }, [])
}

