import { apiFetch } from '../utils.jsx'
import { listCards, createCard } from './cards'
import { listBanks, createBank } from './banks'
import { invalidateCardsCache } from '../utils/dataCache'
import { useSettingsStore } from '../store/useSettingsStore'

// Keys live in user_preferences.binance_api; the backend never returns them, only masked
const saveKeys = (api_key, api_secret) =>
  apiFetch('/api/preferences/apis', {
    method: 'POST',
    body: JSON.stringify({ apis: { binance: { api_key, api_secret } } }),
  })

/** True when read-only Binance keys are saved (the backend masks an empty key as "********") */
export async function isBinanceConnected() {
  const apis = await apiFetch('/api/preferences/apis').catch(() => null)
  const key = apis?.binance?.api_key
  return !!key && key !== '********'
}

/** Pulls the Binance balance into the Binance card (the backend adds a "Binance Sync" transaction) */
export async function syncBinance() {
  const res = await apiFetch('/api/syncBinance', { method: 'POST' })
  if (res && res.success === false) {
    throw new Error(String(res.message || 'не вдалося отримати баланс').replace(/^Binance sync failed:\s*/, ''))
  }
  return res
}

/** Saves the keys, makes sure there is a "Binance · Spot" card and pulls the balance into it */
export async function connectBinance(apiKey, apiSecret) {
  await saveKeys(apiKey, apiSecret)
  // The backend pinned "Binance Sync" (Налаштування → Закріплені категорії)
  useSettingsStore.getState().refreshFromDatabase()

  invalidateCardsCache()
  const cards = await listCards()
  if (!cards.some(c => String(c.bank || '').toLowerCase().includes('binance'))) {
    const banks = await listBanks()
    const bank = banks.find(b => String(b.name || '').toLowerCase().includes('binance')) ||
      await createBank({ name: 'Binance' })
    await createCard({ bank_id: bank.id, name: 'Spot', currency: 'USDT' })
  }

  return syncBinance()
}

/** Forgets the keys; the Binance card and its history stay */
export async function disconnectBinance() {
  await saveKeys('', '')
}
