import express from 'express'
import multer from 'multer'
import fetch from 'node-fetch'
import dotenv from 'dotenv'
import axios from 'axios'
import cors from 'cors'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
dotenv.config();

const app = express();
const upload = multer();

// ✅ CORS configuration for Vercel
const corsOptions = {
  origin: 'https://homecherwe.github.io',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Token'],
  credentials: false,
};

app.use(cors(corsOptions)); // цього достатньо!

// ✅ Allow JSON bodies
app.use(express.json());


// server-side Supabase client (use service role key when available)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Помилка: Відсутні змінні середовища Supabase!')
  console.error('Додайте в backend/.env:')
  console.error('  SUPABASE_URL=your_supabase_url')
  console.error('  SUPABASE_SERVICE_ROLE_KEY=your_service_key (або SUPABASE_ANON_KEY)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

app.post('/api/parse-receipt', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'image required' })
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY missing' })

    const b64 = req.file.buffer.toString('base64')
    const dataUrl = `data:${req.file.mimetype || 'image/jpeg'};base64,${b64}`

    const prompt = `
Ти парсиш фото касового чеку та ПОВЕРТАЄШ СТРУКТУРОВАНИЙ JSON.
ВАЖЛИВО:
- Усі назви товарів ПЕРЕКЛАСТИ українською.
- Формат полів ТІЛЬКИ такий:

{
  "currency": "UAH" | "EUR" | "USD" | "PLN" | "GBP",
  "totalAmount": number,
  "items": [
    { "name": string, "qty": number, "unit_price": number }
  ],
  "merchant": string | null,
  "date": string | null
}

Пояснення:
- currency — валюта чека (якщо неочевидно, став "UAH").
- totalAmount — загальна сума покупки в валюті чека.
- items: qty може бути десятковим (ваговий товар); unit_price — ціна за одиницю в валюті чека.
- НАЗВИ ТОВАРІВ УКРАЇНСЬКОЮ (переклади, наприклад "Oignon jaune" → "Цибуля жовта").
- ПОВЕРНУТИ ЛИШЕ ЧИСТИЙ JSON БЕЗ ДОДАТКОВОГО ТЕКСТУ.
`.trim()

    const body = {
      model: 'gpt-4o-mini',       // або gpt-4o
      temperature: 0.2,
      response_format: { type: 'json_object' }, // => message.content буде JSON-рядком
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }]
    }

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const raw = await r.text()
    if (!r.ok) {
      console.error('OpenAI error:', raw)
      return res.status(500).json({ error: 'openai_failed', details: raw })
    }

    // message.content — JSON-рядок → парсимо:
    let parsed
    try {
      const data = JSON.parse(raw)
      const content = data?.choices?.[0]?.message?.content
      parsed = typeof content === 'string' ? JSON.parse(content) : content
    } catch (e) {
      console.error('Parse content error:', e, raw)
      return res.status(500).json({ error: 'parse_failed' })
    }

    // На випадок якби модель віддала 'total' замість 'totalAmount'
    if (parsed && parsed.total != null && parsed.totalAmount == null) {
      parsed.totalAmount = parsed.total
      delete parsed.total
    }

    // Гарантуємо масив items
    if (!Array.isArray(parsed.items)) parsed.items = []

    return res.json(parsed) // ← віддаємо ЧИСТИЙ JSON
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: e.message || 'server error' })
  }
})


// Helpers for Monobank processing
function roundAndRemoveNegative(value) {
  if (!value && value !== 0) return 0
  // Monobank returns amounts in the smallest currency unit (e.g. kopiykas)
  // Convert to main units and return positive rounded value
  return Math.round(Math.abs(Number(value) || 0) / 100)
}

function convertTimestampToISO(ts) {
  // ts from Monobank is seconds since epoch
  return new Date(Number(ts) * 1000).toISOString()
}

async function postNewCheckMonoBank(amount, note, card, id, date) {
  // Find card_id by card name in `cards` table. Try exact match first, then ilike fallback.
  let card_id = null
  try {
    // Split card string by space: first token -> bank, second token -> name
    const parts = String(card || '').split(' ')
    const bankToken = parts[0] || ''
    const nameToken = parts[1] || ''

    if (bankToken && nameToken) {
      const { data: matched, error: matchErr } = await supabase
        .from('cards')
        .select('id')
        .eq('bank', bankToken)
        .eq('name', nameToken)
        .limit(1)
        .maybeSingle()
      if (matchErr) {
        console.warn('cards lookup error', matchErr)
      }
      if (matched && matched.id) card_id = matched.id
    } else if (nameToken) {
      // fallback: if only nameToken exists, try exact name match
      const { data: byName, error: byNameErr } = await supabase.from('cards').select('id').eq('name', nameToken).limit(1).maybeSingle()
      if (byNameErr) console.warn('cards name lookup error', byNameErr)
      if (byName && byName.id) card_id = byName.id
    } else if (bankToken) {
      // fallback: if only bankToken exists, try exact bank match
      const { data: byBank, error: byBankErr } = await supabase.from('cards').select('id').eq('bank', bankToken).limit(1).maybeSingle()
      if (byBankErr) console.warn('cards bank lookup error', byBankErr)
      if (byBank && byBank.id) card_id = byBank.id
    }
  } catch (e) {
    console.warn('Failed to lookup card_id for', card, e?.message || e)
  }

  // Insert into supabase transactions table. Adjust fields as your schema expects.
  const payload = {
    // let DB generate UUID `id`; store Monobank's id in `transaction_id_card`
    amount: amount,
    category: 'MonoBank',
    note: note,
    archives: false,
    card: card,
    card_id: card_id,
    transaction_id_card: String(id),
    transfer_id: null,
    is_transfer: false,
    transfer_role: null,
    created_at: date
  }

  const { data, error } = await supabase.from('transactions').insert([payload]).select().single()
  if (error) throw error
  return data
}

// POST /api/syncMonoBank
app.post('/api/syncMonoBank', async function (req, res) {
  if (!req.body) return res.status(400).json({ success: false, error: 'Bad request: No body provided' })

  // Allow token to be passed in body/header or fall back to server env MONO_TOKEN
  const xToken = req.body.api || req.headers['x-token'] || process.env.MONO_TOKEN || req.body['x-token']
  if (!xToken) return res.status(400).json({ success: false, error: 'Bad request: api token required in body.api or set MONO_TOKEN in server env' })

  const id_black = process.env.MONO_CARD_ID_BLACK
  const id_white = process.env.MONO_CARD_ID_WHITE

  const id_cards = [id_black, id_white]

  try {
    // Fetch statements for both cards (last 10 days)
    const results = await Promise.all(id_cards.map(async (id_card) => {
      const to = Math.floor(Date.now() / 1000)
      const from = Math.floor((Date.now() - (30 * 24 * 60 * 60 * 1000)) / 1000)
      const url = `https://api.monobank.ua/personal/statement/${id_card}/${from}/${to}`

      const response = await axios.get(url, { headers: { 'X-Token': xToken } })
      return (response.data || []).map(item => ({ ...item, card: id_card }))
    }))

    const allData = results.flat()
    const sortedData = allData.sort((a, b) => a.time - b.time)

    // Fetch Monobank currency rates once and cache for this request
    let monoRates = []
    try {
      const ratesResp = await axios.get('https://api.monobank.ua/bank/currency')
      monoRates = ratesResp.data || []
    } catch (e) {
      console.warn('Failed to fetch Monobank rates, continuing without rates', e?.message || e)
    }

    // Process items, insert missing ones into transactions table
    const processItems = sortedData.map(async (item) => {
      const card = id_black === item.card ? 'MonoBank Black' : 'MonoBank White'

      // Check by external id in our transactions table
      const txId = String(item.id)
      const { data: existing, error: fetchErr } = await supabase.from('transactions').select('id').eq('transaction_id_card', txId).limit(1).maybeSingle()
      if (fetchErr) {
        console.error('Supabase lookup error for', txId, fetchErr)
        // continue processing others
      }
      if (existing && existing.id) {
        // already exists
        return null
      }

      // compute amount and note
      // Monobank sometimes returns amounts in minor units (integer) or main units (float).
      const rawAmount = Number(item.amount || 0)
      const mainAmount = Number.isInteger(rawAmount) ? rawAmount / 100 : rawAmount
      const operationAmount = Number(item.operationAmount || 0)
      const mainOperationAmount = Number.isInteger(operationAmount) ? operationAmount / 100 : operationAmount
      const commissionRate = Number(item.cashbackAmount || 0)
      const mainCommissionRate = Number.isInteger(commissionRate) ? commissionRate / 100 : commissionRate
      const currencyCode = Number(item.currencyCode || 0)
      const amount = mainAmount + mainCommissionRate
      let note = `${item.description || ''}`.trim()
      const date = convertTimestampToISO(item.time)

      // If amounts differ, append conversion info + exchange rate to notes
      if (Math.abs(mainAmount - mainOperationAmount) > 1e-6) {
        // Map numeric currency codes to ISO (common ones). Fallback to numeric.
        const codeMap = { 840: 'USD', 978: 'EUR', 980: 'UAH', 826: 'GBP', 643: 'RUB', 985: 'PLN' }
        const currencyIso = codeMap[currencyCode] || String(currencyCode)

        // Find rate entry for currencyCode -> UAH (980)
        const rateEntry = monoRates.find(r => Number(r.currencyCodeA) === currencyCode && Number(r.currencyCodeB) === 980)
        const rate = rateEntry ? (rateEntry.rateSell || rateEntry.rateBuy || rateEntry.rateCross) : null

        const formattedOp = `${mainOperationAmount} ${currencyIso}`
        const formattedMain = `${mainAmount} UAH`
        const rateText = rate ? `${rate} UAH/${currencyIso}` : 'курс не знайдено'

        note = `${note}${note ? ' | ' : ''}Конвертовано: ${formattedOp} → ${formattedMain}; курс: ${rateText}`
      }

  // insert into DB
      const newTx = await postNewCheckMonoBank(amount, note, card, txId, date)
      return newTx
    })

    const responses = await Promise.all(processItems)
    const newTransactions = responses.filter(v => v !== null)
    const countTrue = newTransactions.length
    
    // Send back data for client-side txBus events
    res.status(200).json({
      success: true,
      count: countTrue,
      message: `Sync transactions - ${countTrue}`,
      transactions: newTransactions
    })

  } catch (error) {
    console.error('Error processing request:', error)
    res.status(500).json({ 
      success: false, 
      error: error.message 
    })
  }
})

// Helper to create HMAC signature for Binance API
function createBinanceSignature(queryString, apiSecret) {
  return crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex')
}

// POST /api/syncBinance
app.post('/api/syncBinance', async function (req, res) {
  try {
    const apiKey = process.env.BINANCE_API_KEY
    const apiSecret = process.env.BINANCE_API_SECRET

    if (!apiKey || !apiSecret) {
      console.log('Binance API keys not configured, skipping sync')
      return res.status(200).json({ 
        success: true, 
        synced: false, 
        message: 'Binance sync skipped: API keys not configured' 
      })
    }

    // Find Binance Spot card - try multiple approaches
    let binanceCard = null
    
    try {
      // First try: exact match
      const { data: exactMatch } = await supabase
        .from('cards')
        .select('id, currency, bank, name, initial_balance')
        .eq('bank', 'Binance')
        .eq('name', 'Spot')
        .limit(1)
        .maybeSingle()
      
      if (exactMatch) {
        binanceCard = exactMatch
      } else {
        // Second try: case-insensitive search
        const { data: allCards } = await supabase
          .from('cards')
          .select('id, currency, bank, name, initial_balance')
        
        if (allCards && allCards.length > 0) {
          binanceCard = allCards.find(card => 
            String(card.bank || '').toLowerCase().includes('binance') &&
            String(card.name || '').toLowerCase().includes('spot')
          )
        }
        
        if (!binanceCard) {
          console.log('Binance Spot card not found. Available cards:', 
            allCards?.map(c => `${c.bank} ${c.name}`).join(', ') || 'none')
          return res.status(200).json({ 
            success: true, 
            synced: false, 
            message: 'Binance sync skipped: Binance Spot card not found in database' 
          })
        }
      }
    } catch (error) {
      console.error('Error finding Binance Spot card:', error)
      return res.status(500).json({ 
        success: false, 
        error: `Database error: ${error.message}` 
      })
    }

    // Calculate balance from initial_balance + transactions
    let dbBalance = 0
    try {
      // Start with initial balance
      const initialBalance = Number(binanceCard.initial_balance || 0)
      
      // Get all transactions for this card
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('amount')
        .eq('card_id', binanceCard.id)
      
      if (txError) {
        console.error('Error fetching transactions:', txError)
        return res.status(500).json({ 
          success: false, 
          error: `Database error: ${txError.message}` 
        })
      }
      
      // Sum all transaction amounts
      const transactionsSum = (transactions || []).reduce((sum, tx) => sum + Number(tx.amount || 0), 0)
      
      // Total balance = initial + transactions
      dbBalance = initialBalance + transactionsSum
      
      console.log(`Initial balance: ${initialBalance}`)
      console.log(`Transactions sum (${transactions?.length || 0} txs): ${transactionsSum}`)
      console.log(`Total DB balance: ${dbBalance}`)
    } catch (error) {
      console.error('Error calculating balance:', error)
      return res.status(500).json({ 
        success: false, 
        error: `Error calculating balance: ${error.message}` 
      })
    }

    // Get current balance from Binance API
    const timestamp = Date.now()
    const queryString = `timestamp=${timestamp}`
    const signature = createBinanceSignature(queryString, apiSecret)

    const url = `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`

    const response = await axios.get(url, {
      headers: {
        'X-MBX-APIKEY': apiKey
      }
    })

    if (!response.data || !response.data.balances) {
      return res.status(500).json({ 
        success: false, 
        error: 'Invalid response from Binance API' 
      })
    }

    // Calculate total balance in USD from all cryptocurrencies
    const allBalances = response.data.balances.filter(b => {
      const total = Number(b.free) + Number(b.locked)
      return total > 0.00000001 // Only coins with balance > 0
    })

    if (allBalances.length === 0) {
      console.log('No balances found on Binance')
      return res.status(200).json({ 
        success: true, 
        synced: false, 
        message: 'Binance sync skipped: No balances found on Binance' 
      })
    }

    console.log(`Found ${allBalances.length} coins with balance:`, allBalances.map(b => b.asset).join(', '))

    // Get prices for all coins in USDT
    const pricesResponse = await axios.get('https://api.binance.com/api/v3/ticker/price')
    const prices = {}
    pricesResponse.data.forEach(p => {
      prices[p.symbol] = Number(p.price)
    })

    // Calculate total balance in USDT
    let binanceBalanceUSD = 0
    const balanceBreakdown = []

    for (const balance of allBalances) {
      const asset = balance.asset
      const amount = Number(balance.free) + Number(balance.locked)
      
      let valueUSD = 0
      
      // Stablecoins - count as 1:1 to USD
      if (['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'USDP'].includes(asset)) {
        valueUSD = amount
        balanceBreakdown.push(`${asset}: ${amount.toFixed(2)} (stablecoin)`)
      } else {
        // Get price in USDT
        const symbolUSDT = `${asset}USDT`
        const symbolUSDC = `${asset}USDC`
        const symbolBUSD = `${asset}BUSD`
        
        if (prices[symbolUSDT]) {
          valueUSD = amount * prices[symbolUSDT]
          balanceBreakdown.push(`${asset}: ${amount.toFixed(8)} × $${prices[symbolUSDT].toFixed(2)} = $${valueUSD.toFixed(2)}`)
        } else if (prices[symbolUSDC]) {
          valueUSD = amount * prices[symbolUSDC]
          balanceBreakdown.push(`${asset}: ${amount.toFixed(8)} × $${prices[symbolUSDC].toFixed(2)} = $${valueUSD.toFixed(2)}`)
        } else if (prices[symbolBUSD]) {
          valueUSD = amount * prices[symbolBUSD]
          balanceBreakdown.push(`${asset}: ${amount.toFixed(8)} × $${prices[symbolBUSD].toFixed(2)} = $${valueUSD.toFixed(2)}`)
        } else {
          console.log(`Warning: No USDT price found for ${asset}, skipping`)
          continue
        }
      }
      
      binanceBalanceUSD += valueUSD
    }

    const difference = binanceBalanceUSD - dbBalance

    console.log(`\nBalance breakdown:`)
    balanceBreakdown.forEach(line => console.log(`  ${line}`))
    console.log(`\nTotal Binance balance: $${binanceBalanceUSD.toFixed(2)} USD`)
    console.log(`DB balance (from transactions): $${dbBalance.toFixed(2)} USD`)
    console.log(`Difference: ${difference > 0 ? '+' : ''}${difference.toFixed(2)} USD`)

    // Skip if difference is between -5 and +5 (to avoid syncing small fluctuations)
    if (difference > -5 && difference < 5) {
      console.log(`Difference ${difference > 0 ? '+' : ''}${difference.toFixed(2)} USD is within -5 to +5 threshold, skipping sync`)
      return res.status(200).json({ 
        success: true, 
        synced: false, 
        message: `Difference too small (${difference > 0 ? '+' : ''}${difference.toFixed(2)} USD), sync skipped` 
      })
    }

    // Create transaction with difference
    const txPayload = {
      amount: difference,
      category: 'Binance Sync',
      note: `Auto-sync Binance balance (all coins in USD)\n\nBalance breakdown:\n${balanceBreakdown.join('\n')}\n\nTotal Binance: $${binanceBalanceUSD.toFixed(2)}\nDB balance: $${dbBalance.toFixed(2)}\nDifference: ${difference > 0 ? '+' : ''}${difference.toFixed(2)} USD`,
      card: `${binanceCard.bank || 'Binance'} ${binanceCard.name || 'Spot'}`,
      card_id: binanceCard.id,
      created_at: new Date().toISOString()
    }

    const { data: newTx, error: txError } = await supabase
      .from('transactions')
      .insert([txPayload])
      .select()
      .single()

    if (txError) {
      console.error('Error creating transaction:', txError)
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to create sync transaction' 
      })
    }

    console.log(`Sync transaction created: ${newTx.id}, amount: ${difference}`)

    return res.status(200).json({
      success: true,
      synced: true,
      message: `Synced successfully: ${difference > 0 ? '+' : ''}${difference.toFixed(2)} USD`,
      card_id: binanceCard.id,
      delta: difference,
      currency: 'USD'
    })

  } catch (error) {
    console.error('Binance sync error:', error)
    if (error.response) {
      console.error('Binance API error:', error.response.data)
      // Return 200 to not break the app, just log the error
      return res.status(200).json({ 
        success: false, 
        synced: false, 
        message: `Binance sync failed: ${error.response.data?.msg || error.message}` 
      })
    }
    return res.status(200).json({ 
      success: false, 
      synced: false, 
      message: `Binance sync failed: ${error.message}` 
    })
  }
})

// Export для Vercel
export default app

// Vercel використовує serverless functions, тому не потрібен listen
// Але для локальної розробки потрібен
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
  const port = process.env.PORT || 8787
  app.listen(port, () => console.log(`API on http://localhost:${port}`))
}
