import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { txBus } from '../utils/txBus'
import { invalidateSumByCardCache } from '../utils/dataCache'

export function useRealtimeTransactions() {
  useEffect(() => {
    const channel = supabase
      .channel('transactions-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        (payload) => {
          invalidateSumByCardCache()
          txBus.emit({ type: 'REALTIME', payload })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
}
