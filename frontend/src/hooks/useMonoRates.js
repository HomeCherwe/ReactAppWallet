
import { useEffect, useState } from 'react'

export default function useMonoRates() {
  const [rates, setRates] = useState({})
  useEffect(() => {
    (async () => {
      try {
        // Use exchangerate-api.com - free, no API key required
        // Base currency is USD, so we need to convert to UAH
        const res = await fetch('https://open.er-api.com/v6/latest/USD')
        if (!res.ok) throw new Error('rate failed')
        const data = await res.json()
        
        if (!data.rates) throw new Error('No rates in response')
        
        // Convert rates to format: { "840->980": 37.5 } (USD->UAH)
        const map = {}
        const usdToUah = data.rates.UAH
        if (!usdToUah) throw new Error('UAH rate not found')
        
        // Common currencies we use
        const currencies = {
          '840': 'USD',  // USD
          '978': 'EUR',  // EUR
          '826': 'GBP',  // GBP
          '985': 'PLN'   // PLN
        }
        
        for (const [code, symbol] of Object.entries(currencies)) {
          if (data.rates[symbol]) {
            // Convert from USD to UAH: USD->UAH = USD->UAH rate
            // For EUR: EUR->UAH = (USD->UAH) / (EUR->USD)
            const rateToUSD = data.rates[symbol]
            const rateToUAH = symbol === 'USD' ? usdToUah : usdToUah / rateToUSD
            map[`${code}->980`] = rateToUAH
          }
        }
        
        setRates(map)
      } catch (error) {
        console.error('Failed to fetch exchange rates:', error)
        setRates({})
      }
    })()
  }, [])
  return rates
}
