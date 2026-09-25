import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const supabaseUrl = 'https://mxbvzdlgsrlweufkfiso.supabase.co'
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14YnZ6ZGxnc3Jsd2V1ZmtmaXNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MjQzMzYsImV4cCI6MjA3NjQwMDMzNn0.d4ceNvYByN8OC2B7GcCmG_PQY0xI2UR_thSTwudJTSY'

// expo-secure-store adapter — works in Expo Go without native build
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    return SecureStore.getItemAsync(key)
  },
  setItem: (key: string, value: string) => {
    return SecureStore.setItemAsync(key, value)
  },
  removeItem: (key: string) => {
    return SecureStore.deleteItemAsync(key)
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
