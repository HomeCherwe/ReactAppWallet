
import { useEffect, useState } from 'react'

// Глобальний кеш для rates щоб уникнути дублювання запитів
let cachedRates = null
let ratesCachePromise = null
const RATES_CACHE_TTL = 3600000 // 1 година (rates не змінюються часто)

async function fetchExchangeRates() {
  // Якщо кеш вже є, повертаємо його
  if (cachedRates) {
    return cachedRates
  }
  
  // Якщо вже є запит в процесі, чекаємо на нього
  if (ratesCachePromise) {
    return ratesCachePromise
  }
  
  // Робимо новий запит
  ratesCachePromise = (async () => {
    try {
      // Використовуємо UAH як базову валюту
      // Запит до https://open.er-api.com/v6/latest/UAH повертає курси, де база - UAH
      // Тобто rates.USD - це скільки USD за 1 UAH
      const resUAH = await fetch('https://open.er-api.com/v6/latest/UAH')
      if (!resUAH.ok) throw new Error('UAH rate failed')
      const dataUAH = await resUAH.json()
      
      if (!dataUAH.rates) throw new Error('No rates in UAH response')
      
      // Також робимо запит до EUR для додаткової точності
      const resEUR = await fetch('https://open.er-api.com/v6/latest/EUR')
      if (!resEUR.ok) throw new Error('EUR rate failed')
      const dataEUR = await resEUR.json()
      
      if (!dataEUR.rates) throw new Error('No rates in EUR response')
      
      // Створюємо мапу курсів в форматі: { "840->980": 42.035 } (USD->UAH)
      // Де значення - це скільки UAH за 1 одиницю валюти
      const map = {}
      
      // Мапа кодів валют
      const codeMap = {
        '840': 'USD',  // USD (також використовується для USDT)
        '978': 'EUR',  // EUR
        '826': 'GBP',  // GBP
        '985': 'PLN',  // PLN
        '756': 'CHF',  // CHF
        '203': 'CZK',  // CZK
        '348': 'HUF'   // HUF
      }
      
      // USDT має такий самий курс як USD, тому використовуємо USD курс
      
      // Отримуємо курси з UAH як базової валюти
      // rates.USD - це скільки USD за 1 UAH, тому для конвертації USD->UAH потрібно 1/rates.USD
      const uahRates = dataUAH.rates
      
      for (const [code, symbol] of Object.entries(codeMap)) {
        if (uahRates[symbol]) {
          // Якщо база UAH, то rates.USD - це скільки USD за 1 UAH
          // Для конвертації USD -> UAH: amount * (1 / rates.USD)
          // Або простіше: amount / rates.USD, де rates.USD - це курс USD до UAH
          // Але насправді rates.USD - це скільки USD за 1 UAH, тому щоб перевести USD в UAH:
          // amount * (1 / rates.USD) = amount / rates.USD
          
          // Насправді, якщо rates.USD = 0.0238 (тобто 1 UAH = 0.0238 USD)
          // То 1 USD = 1 / 0.0238 = 42.02 UAH
          const rateFromCurrencyToUAH = 1 / uahRates[symbol]
          map[`${code}->980`] = rateFromCurrencyToUAH
        }
      }
      
      // Також зберігаємо курси з EUR як базової валюти для EUR транзакцій
      // rates.UAH - це скільки UAH за 1 EUR
      const eurRates = dataEUR.rates
      if (eurRates.UAH) {
        // Для EUR->UAH: rates.UAH - це вже правильний курс
        map['978->980'] = eurRates.UAH
      }
      
      cachedRates = map
      ratesCachePromise = null
      return map
    } catch (error) {
      console.error('Failed to fetch exchange rates:', error)
      ratesCachePromise = null
      throw error
    }
  })()
  
  return ratesCachePromise
}

export default function useMonoRates() {
  const [rates, setRates] = useState(cachedRates || {})
  
  useEffect(() => {
    // Якщо кеш вже є, не робимо запит
    if (cachedRates) {
      setRates(cachedRates)
      return
    }
    
    // Інакше фетчимо rates
    fetchExchangeRates()
      .then(setRates)
      .catch(() => setRates({}))
  }, [])
  
  return rates
}
