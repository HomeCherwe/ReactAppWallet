import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'

const SETTINGS_CURRENCY_KEY = '@wallet_primary_currency'

export interface CurrencyOption {
  code: string
  symbol: string
  name: string
  flag: string
}

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: 'UAH', symbol: '₴', name: 'Українська гривня', flag: '🇺🇦' },
  { code: 'EUR', symbol: '€', name: 'Євро', flag: '🇪🇺' },
  { code: 'USD', symbol: '$', name: 'Долар США', flag: '🇺🇸' },
  { code: 'PLN', symbol: 'zł', name: 'Польський злотий', flag: '🇵🇱' },
  { code: 'GBP', symbol: '£', name: 'Британський фунт', flag: '🇬🇧' },
]

export async function getStoredPrimaryCurrency(): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', user.id)
        .single()
      
      if (!error && data?.preferences?.primaryCurrency) {
        const stored = data.preferences.primaryCurrency
        if (SUPPORTED_CURRENCIES.some(c => c.code === stored)) {
          // Sync to local cache
          await AsyncStorage.setItem(SETTINGS_CURRENCY_KEY, stored)
          return stored
        }
      }
    }
    
    // Fallback to local storage if offline or not in DB yet
    const stored = await AsyncStorage.getItem(SETTINGS_CURRENCY_KEY)
    if (stored && SUPPORTED_CURRENCIES.some(c => c.code === stored)) {
      return stored
    }
  } catch (err) {
    console.warn('Failed to load primary currency setting:', err)
  }
  return 'UAH'
}

export async function setStoredPrimaryCurrency(currency: string): Promise<void> {
  try {
    // 1. Save locally for instant UI update
    await AsyncStorage.setItem(SETTINGS_CURRENCY_KEY, currency)

    // 2. Save to Supabase
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      // First get current preferences to merge
      const { data: currentData } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', user.id)
        .single()
      
      const currentPrefs = currentData?.preferences || {}
      
      // Update with new currency
      await supabase
        .from('user_preferences')
        .update({
          preferences: {
            ...currentPrefs,
            primaryCurrency: currency
          }
        })
        .eq('user_id', user.id)
    }
  } catch (err) {
    console.warn('Failed to save primary currency setting:', err)
  }
}