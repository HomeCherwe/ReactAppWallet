import React, { useEffect, useState } from 'react'
import { BankProvider, listBankConnections } from '../api/bankConnections'
import { syncBanks } from '../store/useBankSyncStore'
import AddAccountModal from './AddAccountModal'
import AddCardModal from './AddCardModal'

// Time for a sheet to finish closing before the next one opens (iOS can't present over a closing one)
const SHEET_SWAP_DELAY_MS = 380

interface AddAccountFlowProps {
  visible: boolean
  onClose: () => void
  /** A bank was connected ('bank') or an own account created ('card') */
  onChanged?: (what: 'bank' | 'card') => void
  /** Open straight on this bank's token form (reconnecting Monobank) */
  initialProvider?: BankProvider | null
  defaultCurrency?: string
}

/**
 * "Додати рахунок" — the same flow everywhere (cards screen, the + button): connect a bank with
 * automatic sync, or create your own account.
 */
export default function AddAccountFlow({
  visible,
  onClose,
  onChanged,
  initialProvider = null,
  defaultCurrency,
}: AddAccountFlowProps) {
  const [connectedIds, setConnectedIds] = useState<string[]>([])
  const [country, setCountry] = useState('fr')
  const [manualVisible, setManualVisible] = useState(false)

  // Mark already connected banks in the catalog and start it on the user's country
  useEffect(() => {
    if (!visible) return
    listBankConnections()
      .then(list => {
        setConnectedIds(list.filter(c => c.status === 'active').map(c => c.provider_id))
        if (list[0]?.country) setCountry(list[0].country)
      })
      .catch(() => {})
  }, [visible])

  return (
    <>
      <AddAccountModal
        visible={visible}
        onClose={onClose}
        initialProvider={initialProvider}
        connectedProviderIds={connectedIds}
        defaultCountry={country}
        onManual={() => {
          onClose()
          setTimeout(() => setManualVisible(true), SHEET_SWAP_DELAY_MS)
        }}
        onConnected={() => {
          onChanged?.('bank')
          // First sync pulls the history and creates the bank's cards; progress shows on Home
          syncBanks().catch(() => {})
        }}
      />

      <AddCardModal
        visible={manualVisible}
        onClose={() => setManualVisible(false)}
        defaultCurrency={defaultCurrency}
        onSuccess={() => onChanged?.('card')}
      />
    </>
  )
}
