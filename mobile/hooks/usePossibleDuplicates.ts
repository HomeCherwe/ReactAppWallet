import { useCallback, useEffect, useMemo, useState } from 'react'
import { DuplicatePair, listPossibleDuplicates, pairKey } from '../api/duplicates'
import { useSettingsStore } from '../store/useSettingsStore'
import { txBus } from '../utils/txBus'

const DISMISSED_PATH = 'duplicates.dismissed'
const NO_DISMISSED: string[] = []

/** Possible duplicates minus the pairs the user marked "Не дубль" (kept in settings, same as the web) */
export function usePossibleDuplicates(enabled = true) {
  const [pairs, setPairs] = useState<DuplicatePair[]>([])
  const dismissed = useSettingsStore(s => s.getNestedSetting<string[]>(DISMISSED_PATH, NO_DISMISSED))

  const reload = useCallback(async () => {
    try {
      setPairs(await listPossibleDuplicates())
    } catch (e) {
      console.warn('[Duplicates] load failed:', e)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    reload()
    // A bank sync can bring new pairs (or settle them)
    return txBus.subscribe(ev => {
      if (ev?.type === 'SYNCED' && ev?.source !== 'duplicates') reload()
    })
  }, [enabled, reload])

  const visible = useMemo(() => pairs.filter(p => !dismissed.includes(pairKey(p))), [pairs, dismissed])

  const dismiss = useCallback(
    (pair: DuplicatePair) => {
      const current = useSettingsStore.getState().getNestedSetting<string[]>(DISMISSED_PATH, NO_DISMISSED)
      useSettingsStore.getState().updateNestedSetting(DISMISSED_PATH, [...current, pairKey(pair)])
    },
    []
  )

  /** Drops pairs that involve these transactions (merged or deleted just now) */
  const forget = useCallback((ids: string[]) => {
    setPairs(prev => prev.filter(p => !ids.includes(p.manual.id) && !ids.includes(p.bank.id)))
  }, [])

  return { pairs: visible, reload, dismiss, forget }
}
