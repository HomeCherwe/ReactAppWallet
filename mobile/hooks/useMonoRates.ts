import { useEffect, useState, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const RATES_STORAGE_KEY = 'mono_rates_cache'
const RATES_TTL = 60 * 60 * 1000 // 1 hour

export default function useMonoRates(): Record<string, number> {
  const [rates, setRates] = useState<Record<string, number>>({})
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    const load = async () => {
      try {
        const cached = await AsyncStorage.getItem(RATES_STORAGE_KEY)
        if (cached) {
          const { data, timestamp } = JSON.parse(cached)
          if (Date.now() - timestamp < RATES_TTL) {
            setRates(data)
            return
          }
        }
        const res = await fetch('https://api.monobank.ua/bank/currency')
        if (!res.ok) return
        const rawRates = await res.json()

        const ratesMap: Record<string, number> = {}
        for (const r of rawRates) {
          if (r.rateSell) {
            ratesMap[`${r.currencyCodeA}->${r.currencyCodeB}`] = r.rateSell
          }
        }
        setRates(ratesMap)
        await AsyncStorage.setItem(RATES_STORAGE_KEY, JSON.stringify({ data: ratesMap, timestamp: Date.now() }))
      } catch {
        // silently fail
      }
    }

    load()
  }, [])

  return rates
}
