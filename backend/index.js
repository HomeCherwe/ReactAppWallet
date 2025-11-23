import express from 'express'
import multer from 'multer'
import fetch from 'node-fetch'
import dotenv from 'dotenv'
import axios from 'axios'
import http from 'http'
import https from 'https'
import cors from 'cors'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
dotenv.config();

const app = express();
const upload = multer();

// ✅ CORS configuration for Vercel and local development
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true)
    
    // Allow localhost for development
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true)
    }
    
    // Allow production domain
    if (origin === 'https://homecherwe.github.io') {
      return callback(null, true)
    }
    
    // Reject other origins
    callback(new Error('Not allowed by CORS'))
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
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

// Check if using service role key (which bypasses RLS)
const isServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY
if (!isServiceRole) {
  console.warn('⚠️  Використовується ANON key замість SERVICE_ROLE_KEY. RLS політики будуть застосовуватись!')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Global HTTP client with keep-alive for external APIs (Binance, etc.)
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 })
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 })
const httpClient = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 15000
})

// In-memory cache for Binance prices
const binancePricesCache = {
  data: null,
  ts: 0,
  ttlMs: 5 * 60 * 1000 // 5 minutes
}

// Middleware для отримання user_id з JWT токену
async function getUserFromToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader?.replace('Bearer ', '') || req.body?.token || req.query?.token
    
    if (!token || token.trim() === '') {
      // Якщо токен не передано, перевіряємо чи передано user_id напряму (для спрощення)
      if (req.body?.user_id) {
        req.user_id = req.body.user_id
        console.log(`[getUserFromToken] Using user_id from body: ${req.user_id}`)
        return next()
      }
      console.warn(`[getUserFromToken] No token found for ${req.method} ${req.path}`)
      return res.status(401).json({ error: 'No authentication token provided' })
    }
    
    // Валідуємо JWT токен через Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error) {
      const errorMsg = error.message || JSON.stringify(error) || 'Unknown error'
      console.error(`[getUserFromToken] Invalid token for ${req.method} ${req.path}:`, errorMsg)
      console.error(`[getUserFromToken] Token length: ${token.length}, starts with: ${token.substring(0, 20)}...`)
      return res.status(401).json({ error: 'Invalid or expired token', details: errorMsg })
    }
    
    if (!user) {
      console.error(`[getUserFromToken] No user found for token in ${req.method} ${req.path}`)
      return res.status(401).json({ error: 'User not found' })
    }
    
    req.user_id = user.id
    req.user = user
    console.log(`[getUserFromToken] Extracted user_id: ${req.user_id} for ${req.method} ${req.path}`)
    next()
  } catch (error) {
    console.error(`[getUserFromToken] Auth middleware error for ${req.method} ${req.path}:`, error.message || error)
    return res.status(401).json({ error: 'Authentication failed', details: error.message })
  }
}

// Middleware для аутентифікації через API Key
async function getUserFromApiKey(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'] || req.body?.api_key || req.query?.api_key
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required. Use X-API-Key header or api_key in body/query' })
    }
    
    // Шукаємо користувача за API key в user_preferences без full-sкану
    // API key зберігається в apis.api_key
    const { data: userPrefs, error } = await supabase
      .from('user_preferences')
      .select('user_id')
      .contains('apis', { api_key: apiKey })
      .single()
    
    if (error) {
      console.error('[getUserFromApiKey] Database error:', error)
      return res.status(500).json({ error: 'Database error while checking API key' })
    }
    
    if (!userPrefs) {
      return res.status(401).json({ error: 'Invalid API key' })
    }
    
    req.user_id = userPrefs.user_id
    req.user = { id: userPrefs.user_id }
    console.log(`[getUserFromApiKey] Authenticated user_id: ${req.user_id}`)
    next()
  } catch (error) {
    console.error('[getUserFromApiKey] Error:', error)
    return res.status(401).json({ error: 'Authentication failed', details: error.message })
  }
}

// Комбінована middleware - приймає або JWT або API Key
async function getUserFromTokenOrApiKey(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.body?.token || req.query?.token
  const apiKey = req.headers['x-api-key'] || req.body?.api_key || req.query?.api_key
  
  if (apiKey) {
    // Використати API Key аутентифікацію
    return getUserFromApiKey(req, res, next)
  } else if (token) {
    // Використати JWT аутентифікацію
    return getUserFromToken(req, res, next)
  } else {
    return res.status(401).json({ 
      error: 'Authentication required. Provide JWT token (Authorization: Bearer <token>) or API key (X-API-Key header)' 
    })
  }
}

// Опціональна middleware (для endpoints що не потребують авторизації)
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader?.replace('Bearer ', '') || req.body?.token || req.query?.token
    
    if (token) {
      const { data: { user }, error } = await supabase.auth.getUser(token)
      if (!error && user) {
        req.user_id = user.id
        req.user = user
      }
    }
    
    next()
  } catch (error) {
    // Продовжуємо без авторизації
    next()
  }
}

// ========================================
// API ENDPOINTS FOR DATABASE OPERATIONS
// ========================================

// Cards API
app.get('/api/cards', getUserFromToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cards')
      .select('id, bank, name, currency, initial_balance, bg_url, card_number, created_at')
      .eq('user_id', req.user_id)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    res.json(data || [])
  } catch (error) {
    console.error('GET /api/cards error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/cards', getUserFromToken, async (req, res) => {
  try {
    const { bank, name, card_number, currency, initial_balance = 0, bg_url } = req.body
    const payload = { bank, name, card_number, currency, initial_balance, bg_url, user_id: req.user_id }
    
    const { data, error } = await supabase
      .from('cards')
      .insert([payload])
      .select()
      .single()
    
    if (error) throw error
    res.json(data)
  } catch (error) {
    console.error('POST /api/cards error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.put('/api/cards/:id', getUserFromToken, async (req, res) => {
  try {
    const { id } = req.params
    const patch = { ...req.body }
    delete patch.id // Не дозволяємо змінювати id
    delete patch.user_id // Не дозволяємо змінювати user_id
    
    const { data, error } = await supabase
      .from('cards')
      .update(patch)
      .eq('id', id)
      .eq('user_id', req.user_id) // Тільки свої картки
      .select()
      .single()
    
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Card not found' })
    res.json(data)
  } catch (error) {
    console.error('PUT /api/cards/:id error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.delete('/api/cards/:id', getUserFromToken, async (req, res) => {
  try {
    const { id } = req.params
    
    // Update transactions to remove card reference
    await supabase
      .from('transactions')
      .update({ card_id: null, card: null })
      .eq('card_id', id)
      .eq('user_id', req.user_id)
    
    const { error } = await supabase
      .from('cards')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user_id) // Тільки свої картки
    
    if (error) throw error
    res.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/cards/:id error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Transactions API
// Get transaction categories (must be before /api/transactions/:id)
app.get('/api/transactions/categories', getUserFromToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('category')
      .eq('user_id', req.user_id)
      .not('category', 'is', null)
    
    if (error) throw error
    
    const categories = [...new Set((data || []).map(t => t.category).filter(Boolean))]
    res.json(categories)
  } catch (error) {
    console.error('GET /api/transactions/categories error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Sum transactions by card (must be before /api/transactions/:id)
app.get('/api/transactions/sum-by-card', getUserFromToken, async (req, res) => {
  try {
    // Use RPC function from database (it was working correctly before)
    const { data, error } = await supabase.rpc('sum_tx_by_card', { user_id_param: req.user_id })
    
    if (error) {
      console.error('[sum-by-card] RPC error:', error)
      // Fallback to client-side aggregation if RPC fails
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('transactions')
        .select('id, amount, card_id, archives')
        .eq('user_id', req.user_id)
        .or('archives.is.null,archives.eq.false')
      
      if (fallbackError) throw fallbackError
      
      const out = {}
      for (const row of fallbackData || []) {
        if (!row.card_id) continue
        out[row.card_id] = (out[row.card_id] || 0) + Number(row.amount || 0)
      }
      
      console.log(`[sum-by-card] Using fallback, result: ${Object.keys(out).length} cards`)
      return res.json(out)
    }
    
    // RPC returned data - format it as { card_id: sum }
    const out = {}
    for (const row of data || []) {
      if (!row.card_id) continue
      out[row.card_id] = Number(row.total || 0)
    }
    
    console.log(`[sum-by-card] RPC result: ${Object.keys(out).length} cards for user ${req.user_id}`)
    res.json(out)
  } catch (error) {
    console.error('GET /api/transactions/sum-by-card error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Totals by bucket (cash, cards, savings)
app.get('/api/totals/by-bucket', getUserFromToken, async (req, res) => {
  try {
    // Use RPC function from database (it was working correctly before)
    const { data, error } = await supabase.rpc('totals_by_bucket', { user_id_param: req.user_id })
    
    if (error) {
      console.error('[totals-by-bucket] RPC error:', error)
      // Fallback to client-side calculation if RPC fails
      // This would require fetching cards and transactions, which is complex
      // So we return empty structure
      return res.json({ cash: {}, cards: {}, savings: {} })
    }
    
    // RPC should return data in format: { cash: {}, cards: {}, savings: {} }
    // If it returns array or different format, we need to transform it
    let result = data
    
    // If data is an array, transform it to object format
    if (Array.isArray(data)) {
      result = { cash: {}, cards: {}, savings: {} }
      for (const row of data) {
        const bucket = row.bucket || 'cards'
        const currency = (row.currency || 'UAH').toUpperCase()
        const total = Number(row.total || 0)
        if (total !== 0) {
          result[bucket][currency] = (result[bucket][currency] || 0) + total
        }
      }
    }
    
    console.log(`[totals-by-bucket] RPC result for user ${req.user_id}`)
    res.json(result || { cash: {}, cards: {}, savings: {} })
  } catch (error) {
    console.error('GET /api/totals/by-bucket error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get list of transactions with flexible filtering
app.get('/api/transactions', getUserFromToken, async (req, res) => {
  try {
    const { 
      from: rangeFrom, 
      to: rangeTo, 
      search = '',
      start_date,
      end_date,
      card_id,
      limit,
      fields = 'id, created_at, amount, category, note, archives, card, card_id, merchant_name, merchant_address, merchant_lat, merchant_lng'
    } = req.query
    
    // Filter out 'currency' field if it doesn't exist in the table
    // This prevents errors when frontend tries to select currency column
    const allowedFields = [
      'id', 'created_at', 'amount', 'category', 'note', 'archives', 
      'card', 'card_id', 'is_transfer', 'count_as_income', 'transfer_role',
      'transfer_id', 'user_id', 'transaction_id_card',
      'merchant_name', 'merchant_address', 'merchant_lat', 'merchant_lng'
    ]
    const requestedFields = fields.split(',').map(f => f.trim())
    const validFields = requestedFields.filter(f => allowedFields.includes(f))
    
    // Use valid fields, fallback to default if all were filtered out
    const safeFields = validFields.length > 0 ? validFields.join(', ') : 'id, created_at, amount, category, note, archives, card, card_id, merchant_name, merchant_address, merchant_lat, merchant_lng'
    
    let q = supabase
      .from('transactions')
      .select(safeFields)
      .eq('user_id', req.user_id)
    
    // Date range filter
    if (start_date) {
      q = q.gte('created_at', start_date)
    }
    if (end_date) {
      q = q.lte('created_at', end_date)
    }
    
    // Card filter (including null for cash)
    if (card_id !== undefined) {
      if (card_id === 'null' || card_id === '') {
        q = q.is('card_id', null)
      } else {
        q = q.eq('card_id', card_id)
      }
    }
    
    // Archive filter
    q = q.or('archives.is.null,archives.eq.false')
    
    // Transaction type filter (expense/income)
    const transactionType = req.query.transaction_type
    if (transactionType === 'expense') {
      q = q.lt('amount', 0)
    } else if (transactionType === 'income') {
      q = q.gt('amount', 0)
    }
    
    // Category filter
    const category = req.query.category
    if (category) {
      q = q.eq('category', category)
    }
    
    // Search filter - search across multiple fields with partial matching
    if (search) {
      const searchTerm = search.trim()
      const isNumeric = !isNaN(parseFloat(searchTerm)) && isFinite(searchTerm)
      
      // PostgREST .or() doesn't support cast operators (::text) in the syntax
      // So we need to use a different approach - filter by text fields first, then filter results
      // Or use a simpler approach with only supported fields
      const conditions = []
      
      // Escape search term for PostgREST
      // For values with spaces, wrap in quotes
      const encodeValue = (val) => {
        if (/\s/.test(val) || /[()]/.test(val)) {
          return `"${val}"`
        }
        return val
      }
      
      const searchValue = encodeValue(searchTerm)
      
      // Search in text fields (category, card, note) with ILIKE for partial matching
      // PostgREST format for .or(): field.ilike.*value* (where * is wildcard)
      conditions.push(`category.ilike.*${searchValue}*`)
      conditions.push(`card.ilike.*${searchValue}*`)
      conditions.push(`note.ilike.*${searchValue}*`)
      
      // Search in amount - use exact match for numeric values
      // Note: We can't use cast in .or(), so we'll filter amount separately if needed
      if (isNumeric) {
        const numValue = parseFloat(searchTerm)
        // Search for both positive and negative amounts (exact match)
        conditions.push(`amount.eq.${numValue}`)
        conditions.push(`amount.eq.-${numValue}`)
      }
      
      // Search in date (created_at) - try to match date patterns
      // Support formats: YYYY-MM-DD, DD.MM.YYYY, DD-MM-YYYY, DD/MM/YYYY
      // Note: We can't use cast in .or(), so we'll use a different approach for dates
      const datePatterns = [
        /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
        /^\d{2}\.\d{2}\.\d{4}$/, // DD.MM.YYYY
        /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
        /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY
      ]
      
      const isDateLike = datePatterns.some(pattern => pattern.test(searchTerm))
      if (isDateLike) {
        // Convert date format to ISO for comparison
        let isoDate = searchTerm
        if (searchTerm.includes('.') || searchTerm.includes('/') || (searchTerm.includes('-') && searchTerm.length === 10)) {
          try {
            const parts = searchTerm.split(/[.\/-]/)
            if (parts.length === 3) {
              if (parts[0].length === 4) {
                isoDate = `${parts[0]}-${parts[1]}-${parts[2]}`
              } else {
                isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`
              }
            }
          } catch (e) {
            // If parsing fails, use original search term
          }
        }
        // For dates, we can use gte/lte range instead of ILIKE
        // Or try to search in created_at using a date range
        const dateStart = new Date(isoDate)
        dateStart.setHours(0, 0, 0, 0)
        const dateEnd = new Date(isoDate)
        dateEnd.setHours(23, 59, 59, 999)
        // Use date range for exact date match
        q = q.gte('created_at', dateStart.toISOString())
        q = q.lte('created_at', dateEnd.toISOString())
      }
      
      // Combine text field conditions with OR (only if we have conditions)
      if (conditions.length > 0) {
        // If we also have date search, we need to combine with AND
        if (isDateLike) {
          // For date search, we already applied date filters above
          // Now add OR conditions for text fields
          // We need to use a different approach - fetch all and filter client-side
          // Or use multiple queries
          // For now, just apply text search
          q = q.or(conditions.join(','))
        } else {
          q = q.or(conditions.join(','))
        }
      }
      
      // For non-numeric search terms that might match amounts or dates as text,
      // we'll need to do client-side filtering after fetching
      // This is a limitation of PostgREST's .or() syntax
    }
    
    // Ordering
    const orderBy = req.query.order_by || 'created_at'
    const orderAsc = req.query.order_asc === 'true'
    q = q.order(orderBy, { ascending: orderAsc })
    
    // Pagination (if range provided) - only apply if NOT using date filters
    // When using start_date/end_date, we want all transactions in that range
    if (start_date || end_date) {
      // No pagination for date-filtered queries - return all matching results
      // But still apply limit if explicitly provided
      if (limit) {
        q = q.limit(Number(limit))
      }
    } else {
      // Apply pagination only when NOT using date filters
      // Only apply range if both from and to are explicitly provided
      if (rangeFrom !== undefined && rangeTo !== undefined) {
        q = q.range(Number(rangeFrom), Number(rangeTo))
      } else if (limit) {
        // If no range but limit is provided, use limit
        q = q.limit(Number(limit))
      } else {
        // Default: no pagination, return all results
      }
    }
    
    const { data, error } = await q
    if (error) {
      console.error('[GET /api/transactions] Query error:', error)
      console.error('[GET /api/transactions] Query params:', { start_date, end_date, fields, card_id, limit, rangeFrom, rangeTo })
      throw error
    }
    
    console.log(`[GET /api/transactions] Returning ${data?.length || 0} transactions for user ${req.user_id}`)
    res.json(data || [])
  } catch (error) {
    console.error('GET /api/transactions error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get single transaction by ID
app.get('/api/transactions/:id', getUserFromToken, async (req, res) => {
  try {
    const { id } = req.params
    
    const { data, error } = await supabase
      .from('transactions')
      .select('id, amount, category, note, card_id, card, created_at, merchant_name, merchant_address, merchant_lat, merchant_lng')
      .eq('id', id)
      .eq('user_id', req.user_id)
      .single()
    
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Transaction not found' })
    res.json(data)
  } catch (error) {
    console.error('GET /api/transactions/:id error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/transactions', getUserFromToken, async (req, res) => {
  try {
    const payload = { ...req.body, user_id: req.user_id }
    
    // Автоматичне геокодування мерчанта, якщо він переданий
    if (payload.merchant_name && !payload.merchant_lat) {
      try {
        // Спробувати знайти в кеші або загеокодувати
        const normalizedName = normalizeMerchantName(payload.merchant_name)
        const { data: cached } = await supabase
          .from('merchant_locations')
          .select('*')
          .eq('user_id', req.user_id)
          .eq('normalized_name', normalizedName)
          .maybeSingle()

        if (cached && cached.lat && cached.lng) {
          // Використати з кешу
          payload.merchant_name = cached.merchant_name
          payload.merchant_address = cached.address
          payload.merchant_lat = cached.lat
          payload.merchant_lng = cached.lng
        } else if (payload.merchant_address) {
          // Якщо є адреса з чека - спробувати геокодувати
          const geocodeResult = await geocodeWithGeocoding(payload.merchant_address)
          if (geocodeResult) {
            payload.merchant_address = geocodeResult.address
            payload.merchant_lat = geocodeResult.lat
            payload.merchant_lng = geocodeResult.lng
            
            // Зберегти в кеш
            await supabase.from('merchant_locations').upsert({
              user_id: req.user_id,
              merchant_name: payload.merchant_name,
              normalized_name: normalizedName,
              address: geocodeResult.address,
              lat: geocodeResult.lat,
              lng: geocodeResult.lng,
              place_id: geocodeResult.place_id,
              source: 'receipt',
              confidence: 0.9
            }, { onConflict: 'user_id,normalized_name' })
          }
        } else {
          // Спробувати геокодувати за назвою
          const geocodeResult = await geocodeWithPlaces(payload.merchant_name)
          if (geocodeResult) {
            payload.merchant_address = geocodeResult.address
            payload.merchant_lat = geocodeResult.lat
            payload.merchant_lng = geocodeResult.lng
            
            // Зберегти в кеш
            await supabase.from('merchant_locations').upsert({
              user_id: req.user_id,
              merchant_name: payload.merchant_name,
              normalized_name: normalizedName,
              address: geocodeResult.address,
              lat: geocodeResult.lat,
              lng: geocodeResult.lng,
              place_id: geocodeResult.place_id,
              source: 'geocoded',
              confidence: geocodeResult.confidence
            }, { onConflict: 'user_id,normalized_name' })
          }
        }
      } catch (geoError) {
        // Не критична помилка - просто логуємо
        console.warn('Geocoding failed for transaction:', geoError.message)
      }
    }
    
    const { data, error } = await supabase
      .from('transactions')
      .insert([payload])
      .select()
      .single()
    
    if (error) throw error
    res.json(data)
  } catch (error) {
    console.error('POST /api/transactions error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.put('/api/transactions/:id', getUserFromToken, async (req, res) => {
  try {
    const { id } = req.params
    const patch = { ...req.body }
    delete patch.id
    delete patch.user_id
    
    // Автоматичне геокодування мерчанта, якщо він переданий і ще не має координат
    if (patch.merchant_name && !patch.merchant_lat) {
      try {
        const normalizedName = normalizeMerchantName(patch.merchant_name)
        const { data: cached } = await supabase
          .from('merchant_locations')
          .select('*')
          .eq('user_id', req.user_id)
          .eq('normalized_name', normalizedName)
          .maybeSingle()

        if (cached && cached.lat && cached.lng) {
          // Використати з кешу
          patch.merchant_name = cached.merchant_name
          patch.merchant_address = cached.address || patch.merchant_address
          patch.merchant_lat = cached.lat
          patch.merchant_lng = cached.lng
        } else if (patch.merchant_address) {
          // Якщо є адреса - спробувати геокодувати
          const geocodeResult = await geocodeWithGeocoding(patch.merchant_address)
          if (geocodeResult) {
            patch.merchant_address = geocodeResult.address
            patch.merchant_lat = geocodeResult.lat
            patch.merchant_lng = geocodeResult.lng
            
            // Зберегти в кеш
            await supabase.from('merchant_locations').upsert({
              user_id: req.user_id,
              merchant_name: patch.merchant_name,
              normalized_name: normalizedName,
              address: geocodeResult.address,
              lat: geocodeResult.lat,
              lng: geocodeResult.lng,
              place_id: geocodeResult.place_id,
              source: 'receipt',
              confidence: 0.9
            }, { onConflict: 'user_id,normalized_name' })
          }
        } else {
          // Спробувати геокодувати за назвою
          const geocodeResult = await geocodeWithPlaces(patch.merchant_name)
          if (geocodeResult) {
            patch.merchant_address = geocodeResult.address
            patch.merchant_lat = geocodeResult.lat
            patch.merchant_lng = geocodeResult.lng
            
            // Зберегти в кеш
            await supabase.from('merchant_locations').upsert({
              user_id: req.user_id,
              merchant_name: patch.merchant_name,
              normalized_name: normalizedName,
              address: geocodeResult.address,
              lat: geocodeResult.lat,
              lng: geocodeResult.lng,
              place_id: geocodeResult.place_id,
              source: 'geocoded',
              confidence: geocodeResult.confidence
            }, { onConflict: 'user_id,normalized_name' })
          }
        }
      } catch (geoError) {
        // Не критична помилка - просто логуємо
        console.warn('Geocoding failed for transaction update:', geoError.message)
      }
    }
    
    const { error } = await supabase
      .from('transactions')
      .update(patch)
      .eq('id', id)
      .eq('user_id', req.user_id)
    
    if (error) throw error
    res.json({ success: true })
  } catch (error) {
    console.error('PUT /api/transactions/:id error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.delete('/api/transactions/:id', getUserFromToken, async (req, res) => {
  try {
    const { id } = req.params
    
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user_id)
    
    if (error) throw error
    res.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/transactions/:id error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.patch('/api/transactions/:id/archive', getUserFromToken, async (req, res) => {
  try {
    const { id } = req.params
    
    const { error } = await supabase
      .from('transactions')
      .update({ archives: true })
      .eq('id', id)
      .eq('user_id', req.user_id)
    
    if (error) throw error
    res.json({ success: true })
  } catch (error) {
    console.error('PATCH /api/transactions/:id/archive error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Bulk delete transactions
app.post('/api/transactions/bulk-delete', getUserFromToken, async (req, res) => {
  try {
    const { ids } = req.body
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' })
    }
    
    // Delete all transactions with matching IDs and user_id
    const { data, error } = await supabase
      .from('transactions')
      .delete()
      .in('id', ids)
      .eq('user_id', req.user_id)
      .select('id, amount, card_id')
    
    if (error) throw error
    
    res.json({ 
      success: true, 
      deleted: data?.length || 0,
      transactions: data || []
    })
  } catch (error) {
    console.error('POST /api/transactions/bulk-delete error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Transfers API
app.post('/api/transfers', getUserFromToken, async (req, res) => {
  try {
    const { fromCardId, toCardId, amount, amountTo, note } = req.body
    
    // Get cards info
    const ids = [...new Set([fromCardId, toCardId].filter(Boolean))]
    let cards = []
    if (ids.length) {
      const { data, error } = await supabase
        .from('cards')
        .select('id, bank, name, currency')
        .eq('user_id', req.user_id)
        .in('id', ids)
      
      if (error) throw error
      cards = data || []
    }
    
    const findCard = (id) => cards.find(c => c.id === id)
    const fromCard = findCard(fromCardId)
    const toCard = findCard(toCardId)
    
    const isSavings = (c) => ((c?.bank||'').toLowerCase().includes('збер') || (c?.bank||'').toLowerCase().includes('savings'))
    const fromBucket = fromCard ? (isSavings(fromCard) ? 'savings' : (fromCard.bank && fromCard.bank.toLowerCase().includes('гот') ? 'cash' : 'cards')) : 'cash'
    const toBucket   = toCard   ? (isSavings(toCard)   ? 'savings' : (toCard.bank   && toCard.bank.toLowerCase().includes('гот') ? 'cash' : 'cards')) : 'cash'
    
    const countAsIncome = (fromBucket === 'savings' && toBucket !== 'savings')
    
    // Generate transfer ID
    const transferId = crypto.randomUUID()
    
    const now = new Date().toISOString()
    const fromAmountAbs = Math.abs(Number(amount || 0))
    const toAmountAbs = Math.abs(Number((amountTo ?? amount) || 0))
    
    const src = {
      amount: -fromAmountAbs,
      card_id: fromCardId || null,
      card: fromCard ? `${fromCard.bank} ${fromCard.name}` : null,
      created_at: now,
      is_transfer: true,
      transfer_role: 'from',
      transfer_id: transferId,
      archives: false,
      category: 'ТРАНСФЕР',
      note: note || null,
      user_id: req.user_id
    }
    
    const tgt = {
      amount: toAmountAbs,
      card_id: toCardId || null,
      card: toCard ? `${toCard.bank} ${toCard.name}` : null,
      created_at: now,
      is_transfer: true,
      transfer_role: 'to',
      transfer_id: transferId,
      count_as_income: countAsIncome,
      archives: false,
      category: 'ТРАНСФЕР',
      note: note || null,
      user_id: req.user_id
    }
    
    const { data, error } = await supabase
      .from('transactions')
      .insert([src, tgt])
      .select()
    
    if (error) throw error
    res.json(data || [])
  } catch (error) {
    console.error('POST /api/transfers error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/transfers/mark-existing', getUserFromToken, async (req, res) => {
  try {
    const { fromTxId, toTxId, note } = req.body
    
    if (!fromTxId || !toTxId) {
      return res.status(400).json({ error: 'Необхідно вибрати дві транзакції' })
    }
    
    const transferId = crypto.randomUUID()
    
    // Load both transactions
    const { data: txs, error: loadErr } = await supabase
      .from('transactions')
      .select('id, amount, card_id, card, created_at')
      .eq('user_id', req.user_id)
      .in('id', [fromTxId, toTxId])
    
    if (loadErr) throw loadErr
    if (!txs || txs.length !== 2) {
      return res.status(404).json({ error: 'Не знайдено обидві транзакції' })
    }
    
    const t1 = txs.find(t => t.id === fromTxId)
    const t2 = txs.find(t => t.id === toTxId)
    if (!t1 || !t2) {
      return res.status(404).json({ error: 'Не знайдено обидві транзакції' })
    }
    
    const a1 = Number(t1.amount || 0)
    const a2 = Number(t2.amount || 0)
    
    // Determine roles by sign
    const src = a1 <= 0 ? t1 : t2
    const tgt = a1 <= 0 ? t2 : t1
    
    const srcUpdate = {
      is_transfer: true,
      transfer_role: 'from',
      transfer_id: transferId,
      category: 'ТРАНСФЕР',
      ...(note ? { note } : {}),
    }
    
    const tgtUpdate = {
      is_transfer: true,
      transfer_role: 'to',
      transfer_id: transferId,
      category: 'ТРАНСФЕР',
      ...(note ? { note } : {}),
    }
    
    const { data: updatedSrc, error: errSrc } = await supabase
      .from('transactions')
      .update(srcUpdate)
      .eq('id', src.id)
      .eq('user_id', req.user_id)
      .select()
      .single()
    if (errSrc) throw errSrc
    
    const { data: updatedTgt, error: errTgt } = await supabase
      .from('transactions')
      .update(tgtUpdate)
      .eq('id', tgt.id)
      .eq('user_id', req.user_id)
      .select()
      .single()
    if (errTgt) throw errTgt
    
    res.json([updatedSrc, updatedTgt])
  } catch (error) {
    console.error('POST /api/transfers/mark-existing error:', error)
    res.status(500).json({ error: error.message })
  }
})

// User Preferences API
app.get('/api/preferences', getUserFromToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('preferences, apis')
      .eq('user_id', req.user_id)
      .single()
    
    if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
    
    const result = data?.preferences || {}
    // Merge apis field into preferences if it exists as separate field
    if (data?.apis) {
      result.apis = data.apis
    }
    
    res.json(result)
  } catch (error) {
    console.error('GET /api/preferences error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/preferences', getUserFromToken, async (req, res) => {
  try {
    const { preferences } = req.body
    
    // Don't save APIs in preferences - they go to separate column
    const prefsWithoutAPIs = { ...preferences }
    if (prefsWithoutAPIs.APIs) {
      delete prefsWithoutAPIs.APIs
    }
    
    // Check if exists
    const { data: existing } = await supabase
      .from('user_preferences')
      .select('id')
      .eq('user_id', req.user_id)
      .single()
    
    if (existing) {
      // Update
      const { error } = await supabase
        .from('user_preferences')
        .update({ preferences: prefsWithoutAPIs })
        .eq('user_id', req.user_id)
      
      if (error) throw error
    } else {
      // Insert
      const { error } = await supabase
        .from('user_preferences')
        .insert([{ user_id: req.user_id, preferences: prefsWithoutAPIs }])
      
      if (error) throw error
    }
    
    res.json({ success: true })
  } catch (error) {
    console.error('POST /api/preferences error:', error)
    res.status(500).json({ error: error.message })
  }
})

// APIs endpoints (separate column)
app.get('/api/preferences/apis', getUserFromToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('apis')
      .eq('user_id', req.user_id)
      .single()
    
    if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
    
    res.json(data?.apis || {})
  } catch (error) {
    console.error('GET /api/preferences/apis error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/preferences/apis', getUserFromToken, async (req, res) => {
  try {
    const { apis } = req.body
    
    // Check if exists
    const { data: existing } = await supabase
      .from('user_preferences')
      .select('id')
      .eq('user_id', req.user_id)
      .single()
    
    if (existing) {
      // Update apis column
      const { error } = await supabase
        .from('user_preferences')
        .update({ apis })
        .eq('user_id', req.user_id)
      
      if (error) throw error
    } else {
      // Insert with apis
      const { error } = await supabase
        .from('user_preferences')
        .insert([{ user_id: req.user_id, preferences: {}, apis }])
      
      if (error) throw error
    }
    
    res.json({ success: true })
  } catch (error) {
    console.error('POST /api/preferences/apis error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================
// Subscriptions API
// ============================================

// Get all subscriptions for current user
app.get('/api/subscriptions', getUserFromToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', req.user_id)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    res.json(data || [])
  } catch (error) {
    console.error('GET /api/subscriptions error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Create new subscription
app.post('/api/subscriptions', getUserFromToken, async (req, res) => {
  try {
    const { name, amount, card_id, frequency, day_of_week, day_of_month, is_expense, category, note } = req.body
    
    if (!name || !amount || !frequency) {
      return res.status(400).json({ error: 'Missing required fields: name, amount, frequency' })
    }
    
    // Calculate next_execution_at
    const nextExecution = calculateNextExecution(frequency, day_of_week, day_of_month, null)
    
    const insertData = {
      user_id: req.user_id,
      name,
      amount: Math.abs(Number(amount)),
      card_id: card_id || null,
      frequency,
      day_of_week: frequency === 'weekly' ? day_of_week : null,
      day_of_month: frequency === 'monthly' ? day_of_month : null,
      is_expense: is_expense !== false,
      next_execution_at: nextExecution
    }
    
    // Add category and note if they exist (columns might not exist in DB yet)
    if (category !== undefined) insertData.category = category || null
    if (note !== undefined) insertData.note = note || null
    
    const { data, error } = await supabase
      .from('subscriptions')
      .insert([insertData])
      .select()
      .single()
    
    if (error) {
      // If error is about missing columns, try inserting without them
      if (error.code === 'PGRST204' && (error.message.includes('category') || error.message.includes('note'))) {
        console.warn('Category/note columns not found, inserting without them. Please run SQL migration.')
        const { category: _, note: __, ...insertDataWithoutNewFields } = insertData
        const { data: retryData, error: retryError } = await supabase
          .from('subscriptions')
          .insert([insertDataWithoutNewFields])
          .select()
          .single()
        
        if (retryError) throw retryError
        return res.json(retryData)
      }
      throw error
    }
    
    res.json(data)
  } catch (error) {
    console.error('POST /api/subscriptions error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Update subscription
app.put('/api/subscriptions/:id', getUserFromToken, async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body
    
    // Verify ownership
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id, frequency, day_of_week, day_of_month')
      .eq('id', id)
      .eq('user_id', req.user_id)
      .single()
    
    if (!existing) {
      return res.status(404).json({ error: 'Subscription not found' })
    }
    
    // If frequency or day changed, recalculate next_execution_at
    if (updates.frequency || updates.day_of_week || updates.day_of_month) {
      const frequency = updates.frequency || existing.frequency
      const day_of_week = updates.day_of_week !== undefined ? updates.day_of_week : existing.day_of_week
      const day_of_month = updates.day_of_month !== undefined ? updates.day_of_month : existing.day_of_month
      
      // Get last_executed_at if exists
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('last_executed_at')
        .eq('id', id)
        .single()
      
      updates.next_execution_at = calculateNextExecution(
        frequency,
        day_of_week,
        day_of_month,
        subData?.last_executed_at || null
      )
    }
    
    // Ensure amount is positive
    if (updates.amount !== undefined) {
      updates.amount = Math.abs(Number(updates.amount))
    }
    
    // Filter out fields that might not exist in the database yet
    // If category/note/participants columns don't exist, they will be ignored
    const safeUpdates = { ...updates }
    
    // Ensure participants is an array if provided
    if (safeUpdates.participants !== undefined) {
      if (!Array.isArray(safeUpdates.participants)) {
        safeUpdates.participants = []
      }
    }
    
    // Ensure total_participants is a positive integer
    if (safeUpdates.total_participants !== undefined) {
      safeUpdates.total_participants = Math.max(1, parseInt(safeUpdates.total_participants) || 1)
    }
    
    // Try to update, but handle case where columns might not exist
    const { data, error } = await supabase
      .from('subscriptions')
      .update(safeUpdates)
      .eq('id', id)
      .eq('user_id', req.user_id)
      .select()
      .single()
    
    if (error) {
      // If error is about missing columns, try updating without them
      if (error.code === 'PGRST204' && (
        error.message.includes('category') || 
        error.message.includes('note') || 
        error.message.includes('participants') ||
        error.message.includes('total_participants')
      )) {
        console.warn('Some columns not found, updating without them. Please run SQL migration.')
        const { category, note, participants, total_participants, ...updatesWithoutNewFields } = safeUpdates
        const { data: retryData, error: retryError } = await supabase
          .from('subscriptions')
          .update(updatesWithoutNewFields)
          .eq('id', id)
          .eq('user_id', req.user_id)
          .select()
          .single()
        
        if (retryError) throw retryError
        return res.json(retryData)
      }
      throw error
    }
    
    res.json(data)
  } catch (error) {
    console.error('PUT /api/subscriptions/:id error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Delete subscription
app.delete('/api/subscriptions/:id', getUserFromToken, async (req, res) => {
  try {
    const { id } = req.params
    
    const { error } = await supabase
      .from('subscriptions')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user_id)
    
    if (error) throw error
    res.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/subscriptions/:id error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Helper function to calculate next execution date
function calculateNextExecution(frequency, day_of_week, day_of_month, last_executed_at) {
  const now = new Date()
  let nextDate = new Date()
  
  if (frequency === 'weekly') {
    // Find next occurrence of day_of_week
    if (last_executed_at) {
      nextDate = new Date(last_executed_at)
      nextDate.setDate(nextDate.getDate() + 7) // Add 1 week
    } else {
      nextDate = new Date(now)
    }
    
    // Adjust to the correct day of week
    // day_of_week: 1=Monday, 7=Sunday
    // JavaScript getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
    const targetDay = day_of_week === 7 ? 0 : day_of_week
    const currentDay = nextDate.getDay()
    let daysToAdd = targetDay - currentDay
    
    if (daysToAdd <= 0) {
      daysToAdd += 7
    }
    
    nextDate.setDate(nextDate.getDate() + daysToAdd)
    
    // Set time to start of day
    nextDate.setHours(0, 0, 0, 0)
    
  } else if (frequency === 'monthly') {
    // Find next occurrence of day_of_month
    if (last_executed_at) {
      nextDate = new Date(last_executed_at)
      nextDate.setMonth(nextDate.getMonth() + 1) // Add 1 month
    } else {
      nextDate = new Date(now.getFullYear(), now.getMonth(), day_of_month)
      // If date is in the past, move to next month
      if (nextDate < now) {
        nextDate.setMonth(nextDate.getMonth() + 1)
      }
    }
    
    // Handle day_of_month > days in month
    const daysInMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate()
    if (day_of_month > daysInMonth) {
      nextDate.setDate(daysInMonth)
    } else {
      nextDate.setDate(day_of_month)
    }
    
    // Set time to start of day
    nextDate.setHours(0, 0, 0, 0)
  }
  
  return nextDate.toISOString()
}

// Process subscriptions - check and execute due subscriptions
app.post('/api/subscriptions/process', getUserFromToken, async (req, res) => {
  try {
    const now = new Date()
    const nowISO = now.toISOString()
    
    // Find all active subscriptions that are due
    const { data: dueSubscriptions, error: fetchError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', req.user_id)
      .eq('is_active', true)
      .lte('next_execution_at', nowISO)
    
    if (fetchError) throw fetchError
    
    if (!dueSubscriptions || dueSubscriptions.length === 0) {
      return res.json({ processed: 0, message: 'No subscriptions due' })
    }
    
    let processed = 0
    const errors = []
    
    for (const sub of dueSubscriptions) {
      try {
        // Get card currency if card_id exists
        let transactionCurrency = 'UAH' // default
        if (sub.card_id) {
          const { data: cardData } = await supabase
            .from('cards')
            .select('currency')
            .eq('id', sub.card_id)
            .single()
          if (cardData?.currency) {
            transactionCurrency = cardData.currency
          }
        }
        
        // Create transaction
        const amount = sub.is_expense ? -Math.abs(sub.amount) : Math.abs(sub.amount)
        
        // Формуємо опис транзакції
        let transactionNote = ''
        if (sub.note && sub.note.trim()) {
          // Якщо є користувацький опис, додаємо його
          transactionNote = `${sub.note} | `
        }
        // Завжди додаємо назву підписки та інформацію про автоматичне створення
        transactionNote += `${sub.name} (автоматично створено через підписки)`
        
        // Використовуємо category з підписки, або 'Підписки' за замовчуванням
        const transactionCategory = sub.category || 'Підписки'
        
        const { data: transaction, error: txError } = await supabase
          .from('transactions')
          .insert([{
            user_id: req.user_id,
            amount,
            currency: transactionCurrency,
            card_id: sub.card_id,
            category: transactionCategory,
            note: transactionNote,
            created_at: sub.next_execution_at // Use scheduled date
          }])
          .select()
          .single()
        
        if (txError) {
          errors.push({ subscription: sub.id, error: txError.message })
          continue
        }
        
        // Calculate next execution
        const nextExecution = calculateNextExecution(
          sub.frequency,
          sub.day_of_week,
          sub.day_of_month,
          sub.next_execution_at
        )
        
        // Update subscription
        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({
            last_executed_at: sub.next_execution_at,
            next_execution_at: nextExecution
          })
          .eq('id', sub.id)
        
        if (updateError) {
          errors.push({ subscription: sub.id, error: updateError.message })
          continue
        }
        
        processed++
      } catch (err) {
        errors.push({ subscription: sub.id, error: err.message })
      }
    }
    
    res.json({
      processed,
      total: dueSubscriptions.length,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('POST /api/subscriptions/process error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/parse-receipt', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'image required' })
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY missing' })

    const b64 = req.file.buffer.toString('base64')
    const dataUrl = `data:${req.file.mimetype || 'image/jpeg'};base64,${b64}`

    const prompt = `
Ти обробляєш фото касового чеку та повертаєш строго структурований JSON.

Усі назви товарів потрібно перекладати Українською мовою ДОСЛОВНО, максимально точно, без узагальнень чи вигадок. 
Якщо назва нечітка — передай її максимально точно як на чеку.

ПЕРЕКЛАД ТОВАРІВ:
- Не роби буквальний OCR-переклад.
- Використовуй НОРМАЛЬНІ людські українські назви.
- Якщо товар — харчовий продукт, називай його як він називається в побуті.
- Не зберігай капс, не копіюй форматування, не передавай зайві слова(Тільки перша літера велика).
- Якщо назва містить зайві технічні частини (ESP, PETITES, T100) — перекладай СЕНС, а не літери.
- Якщо є грами штуки і т.д їх пиши в назву
- Якщо це хліб, сир, сік, чіпси, ласощі тощо — називай загальноприйнятою українською.

ВАЖЛИВО для merchant:
- Якщо на чеку є адреса магазину - обов'язково витягни її в поле "address"
- Адреса має бути повною: місто, вулиця, номер (якщо є)
- Якщо адреси немає - поверни тільки "name"

ФОРМАТ JSON:
{
  "currency": "UAH" | "EUR" | "USD" | "PLN" | "GBP",
  "totalAmount": number,
  "items": [
    { "name": string, "qty": number, "unit_price": number }
  ],
  "merchant": {
    "name": string,
    "address": string | null
  } | string | null,
  "date": string | null
}

ПРИМІТКА: merchant може бути як об'єктом {name, address}, так і просто рядком (назва без адреси).
Якщо на чеку є адреса - обов'язково використай формат об'єкта.
`.trim()

const body = {
  model: "gpt-5.1",
  temperature: 0.0,
  response_format: { type: "json_object" },
  messages: [
    {
      role: "system",
      content: prompt
    },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: dataUrl } }
      ]
    }
  ]
};

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

    // Нормалізуємо merchant формат (може бути string або object)
    if (parsed.merchant && typeof parsed.merchant === 'string') {
      parsed.merchant = { name: parsed.merchant, address: null }
    }

    return res.json(parsed) // ← віддаємо ЧИСТИЙ JSON
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: e.message || 'server error' })
  }
})

// Helper function to normalize merchant name for caching
function normalizeMerchantName(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/[^\w\sа-яіїєґ]/gi, '') // прибрати спецсимволи, залишити букви та пробіли
    .replace(/\s+/g, ' ')           // множинні пробіли в один
    .trim()
}

// Helper function to geocode merchant using Google Places API
async function geocodeWithPlaces(merchantName, city = null) {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.warn('GOOGLE_MAPS_API_KEY not set, skipping geocoding')
    return null
  }

  try {
    // Формуємо запит для Places API Text Search
    const query = city ? `${merchantName}, ${city}, Україна` : `${merchantName}, Україна`
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${process.env.GOOGLE_MAPS_API_KEY}&language=uk&region=ua`
    
    const response = await fetch(url)
    const data = await response.json()

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const place = data.results[0] // Беремо перший результат
      return {
        merchantName: merchantName,
        address: place.formatted_address,
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
        place_id: place.place_id,
        confidence: 0.8
      }
    }
    return null
  } catch (e) {
    console.error('Places API error:', e)
    return null
  }
}

// Helper function to geocode merchant using Google Geocoding API (fallback)
async function geocodeWithGeocoding(merchantName, city = null) {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return null
  }

  try {
    const address = city ? `${merchantName}, ${city}, Україна` : `${merchantName}, Україна`
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}&language=uk&region=ua`
    
    const response = await fetch(url)
    const data = await response.json()

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const result = data.results[0]
      return {
        merchantName: merchantName,
        address: result.formatted_address,
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        place_id: result.place_id,
        confidence: 0.6
      }
    }
    return null
  } catch (e) {
    console.error('Geocoding API error:', e)
    return null
  }
}

// POST /api/geocode-merchant - Геокодування назви мерчанта
app.post('/api/geocode-merchant', getUserFromToken, async (req, res) => {
  try {
    const { merchantName, city, address } = req.body

    if (!merchantName || !merchantName.trim()) {
      return res.status(400).json({ error: 'merchantName is required' })
    }

    const normalizedName = normalizeMerchantName(merchantName)

    // 1. Перевірка кешу
    const { data: cached, error: cacheError } = await supabase
      .from('merchant_locations')
      .select('*')
      .eq('user_id', req.user_id)
      .eq('normalized_name', normalizedName)
      .maybeSingle()

    if (!cacheError && cached && cached.lat && cached.lng) {
      return res.json({
        merchantName: cached.merchant_name,
        address: cached.address,
        lat: Number(cached.lat),
        lng: Number(cached.lng),
        place_id: cached.place_id,
        found: true,
        fromCache: true
      })
    }

    // 2. Якщо є адреса з чека - спробувати геокодувати її напряму
    if (address && address.trim()) {
      try {
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}&language=uk&region=ua`
        const geocodeResponse = await fetch(geocodeUrl)
        const geocodeData = await geocodeResponse.json()

        if (geocodeData.status === 'OK' && geocodeData.results && geocodeData.results.length > 0) {
          const result = geocodeData.results[0]
          const locationData = {
            merchantName: merchantName,
            address: result.formatted_address,
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng,
            place_id: result.place_id,
            confidence: 0.9,
            source: 'receipt'
          }

          // Зберегти в кеш
          await supabase.from('merchant_locations').upsert({
            user_id: req.user_id,
            merchant_name: merchantName,
            normalized_name: normalizedName,
            address: locationData.address,
            lat: locationData.lat,
            lng: locationData.lng,
            place_id: locationData.place_id,
            source: 'receipt',
            confidence: locationData.confidence
          }, {
            onConflict: 'user_id,normalized_name'
          })

          return res.json({
            ...locationData,
            found: true,
            fromCache: false
          })
        }
      } catch (e) {
        console.error('Error geocoding address from receipt:', e)
      }
    }

    // 3. Google Places API
    const placesResult = await geocodeWithPlaces(merchantName, city)
    if (placesResult) {
      // Зберегти в кеш
      await supabase.from('merchant_locations').upsert({
        user_id: req.user_id,
        merchant_name: merchantName,
        normalized_name: normalizedName,
        address: placesResult.address,
        lat: placesResult.lat,
        lng: placesResult.lng,
        place_id: placesResult.place_id,
        source: 'geocoded',
        confidence: placesResult.confidence
      }, {
        onConflict: 'user_id,normalized_name'
      })

      return res.json({
        ...placesResult,
        found: true,
        fromCache: false
      })
    }

    // 4. Geocoding API fallback
    const geocodeResult = await geocodeWithGeocoding(merchantName, city)
    if (geocodeResult) {
      await supabase.from('merchant_locations').upsert({
        user_id: req.user_id,
        merchant_name: merchantName,
        normalized_name: normalizedName,
        address: geocodeResult.address,
        lat: geocodeResult.lat,
        lng: geocodeResult.lng,
        place_id: geocodeResult.place_id,
        source: 'geocoded',
        confidence: geocodeResult.confidence
      }, {
        onConflict: 'user_id,normalized_name'
      })

      return res.json({
        ...geocodeResult,
        found: true,
        fromCache: false
      })
    }

    // 5. Не знайдено
    return res.json({
      merchantName: merchantName,
      found: false,
      message: `Не вдалося знайти адресу для "${merchantName}". Можна додати вручну.`
    })
  } catch (e) {
    console.error('Geocode merchant error:', e)
    return res.status(500).json({ error: e.message || 'server error' })
  }
})

// PUT /api/merchant-location - Ручне додавання/оновлення адреси мерчанта
app.put('/api/merchant-location', getUserFromToken, async (req, res) => {
  try {
    const { merchantName, address, lat, lng, place_id } = req.body

    if (!merchantName || !merchantName.trim()) {
      return res.status(400).json({ error: 'merchantName is required' })
    }

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng are required' })
    }

    const normalizedName = normalizeMerchantName(merchantName)

    const { data, error } = await supabase
      .from('merchant_locations')
      .upsert({
        user_id: req.user_id,
        merchant_name: merchantName,
        normalized_name: normalizedName,
        address: address || null,
        lat: Number(lat),
        lng: Number(lng),
        place_id: place_id || null,
        source: 'manual',
        confidence: 1.0
      }, {
        onConflict: 'user_id,normalized_name'
      })
      .select()
      .single()

    if (error) throw error

    return res.json({
      success: true,
      location: data
    })
  } catch (e) {
    console.error('Update merchant location error:', e)
    return res.status(500).json({ error: e.message || 'server error' })
  }
})


// Helpers for Monobank API processing
function roundAndRemoveNegative(value) {
  if (!value && value !== 0) return 0
  // Monobank API returns amounts in the smallest currency unit (e.g. kopiykas)
  // Convert to main units and return positive rounded value
  return Math.round(Math.abs(Number(value) || 0) / 100)
}

function convertTimestampToISO(ts) {
  // ts from Monobank is seconds since epoch
  return new Date(Number(ts) * 1000).toISOString()
}

async function postNewCheckMonoBank(amount, note, card, id, date, userId) {
  // Find card_id by card name in `cards` table. Try exact match first, then ilike fallback.
  let card_id = null
  let card_user_id = null
  try {
    // Split card string by space: first token -> bank, second token -> name
    const parts = String(card || '').split(' ')
    const bankToken = parts[0] || ''
    const nameToken = parts[1] || ''

    if (bankToken && nameToken) {
      const { data: matched, error: matchErr } = await supabase
        .from('cards')
        .select('id, user_id')
        .eq('bank', bankToken)
        .eq('name', nameToken)
        .limit(1)
        .maybeSingle()
      if (matchErr) {
        console.warn('cards lookup error', matchErr)
      }
      if (matched && matched.id) {
        card_id = matched.id
        card_user_id = matched.user_id
      }
    } else if (nameToken) {
      // fallback: if only nameToken exists, try exact name match
      const { data: byName, error: byNameErr } = await supabase
        .from('cards')
        .select('id, user_id')
        .eq('name', nameToken)
        .limit(1)
        .maybeSingle()
      if (byNameErr) console.warn('cards name lookup error', byNameErr)
      if (byName && byName.id) {
        card_id = byName.id
        card_user_id = byName.user_id
      }
    } else if (bankToken) {
      // fallback: if only bankToken exists, try exact bank match
      const { data: byBank, error: byBankErr } = await supabase
        .from('cards')
        .select('id, user_id')
        .eq('bank', bankToken)
        .limit(1)
        .maybeSingle()
      if (byBankErr) console.warn('cards bank lookup error', byBankErr)
      if (byBank && byBank.id) {
        card_id = byBank.id
        card_user_id = byBank.user_id
      }
    }
  } catch (e) {
    console.warn('Failed to lookup card_id for', card, e?.message || e)
  }

  // Використовувати user_id з картки або з параметра функції
  const finalUserId = card_user_id || userId
  if (!finalUserId) {
    throw new Error('Cannot create transaction: user_id is required (from card or function parameter)')
  }

  // Спроба витягнути merchant_name з note (description від Monobank)
  // Monobank зазвичай повертає назву магазину в description
  // Формат: "BOCAZUR | Конвертовано: -11.37 EUR → -557.24 UAH; курс: 48.67 UAH/EUR"
  // Назва магазину - це все до символу "|"
  let merchantName = null
  if (note && note.trim()) {
    // Беремо перший рядок
    const firstLine = note.split('\n')[0].trim()
    
    // Якщо є символ "|", беремо частину до нього
    if (firstLine.includes('|')) {
      merchantName = firstLine.split('|')[0].trim()
    } else {
      // Якщо немає "|", беремо весь перший рядок (якщо не дуже довгий)
      if (firstLine.length < 100 && firstLine.length > 0) {
        merchantName = firstLine
      }
    }
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
    user_id: finalUserId, // Додати user_id для RLS policy
    created_at: date,
    merchant_name: merchantName || null
  }

  // Автоматичне геокодування мерчанта (асинхронно, не блокуємо створення транзакції)
  if (merchantName) {
    // Виконуємо геокодування в фоні, не чекаємо результату
    ;(async () => {
      try {
        const normalizedName = normalizeMerchantName(merchantName)
        // Перевірка кешу
        const { data: cached } = await supabase
          .from('merchant_locations')
          .select('*')
          .eq('user_id', finalUserId)
          .eq('normalized_name', normalizedName)
          .maybeSingle()

        if (!cached || !cached.lat) {
          // Спробувати геокодувати
          const geocodeResult = await geocodeWithPlaces(merchantName)
          if (geocodeResult) {
            // Зберегти в кеш
            await supabase.from('merchant_locations').upsert({
              user_id: finalUserId,
              merchant_name: merchantName,
              normalized_name: normalizedName,
              address: geocodeResult.address,
              lat: geocodeResult.lat,
              lng: geocodeResult.lng,
              place_id: geocodeResult.place_id,
              source: 'monobank',
              confidence: geocodeResult.confidence
            }, { onConflict: 'user_id,normalized_name' })

            // Оновити транзакцію з координатами
            const { data: insertedTx } = await supabase
              .from('transactions')
              .select('id')
              .eq('transaction_id_card', String(id))
              .eq('user_id', finalUserId)
              .maybeSingle()

            if (insertedTx) {
              await supabase
                .from('transactions')
                .update({
                  merchant_address: geocodeResult.address,
                  merchant_lat: geocodeResult.lat,
                  merchant_lng: geocodeResult.lng
                })
                .eq('id', insertedTx.id)
                .eq('user_id', finalUserId)
            }
          }
        } else if (cached.lat) {
          // Оновити транзакцію з координатами з кешу
          const { data: insertedTx } = await supabase
            .from('transactions')
            .select('id')
            .eq('transaction_id_card', String(id))
            .eq('user_id', finalUserId)
            .maybeSingle()

          if (insertedTx) {
            await supabase
              .from('transactions')
              .update({
                merchant_address: cached.address,
                merchant_lat: cached.lat,
                merchant_lng: cached.lng
              })
              .eq('id', insertedTx.id)
              .eq('user_id', finalUserId)
          }
        }
      } catch (geoError) {
        console.warn('Background geocoding failed for Monobank transaction:', geoError.message)
      }
    })().catch(err => console.error('Unhandled geocoding error:', err))
  }

  const { data, error } = await supabase.from('transactions').insert([payload]).select().single()
  if (error) throw error
  return data
}

// POST /api/generate-api-key - Генерація API Key для користувача
app.post('/api/generate-api-key', getUserFromToken, async function (req, res) {
  try {
    // Генеруємо випадковий API key (64 символи)
    const apiKey = crypto.randomBytes(32).toString('hex')
    
    // Отримуємо поточні налаштування користувача
    const { data: prefs, error: prefsError } = await supabase
      .from('user_preferences')
      .select('apis')
      .eq('user_id', req.user_id)
      .single()
    
    if (prefsError && prefsError.code !== 'PGRST116') {
      console.error('[generate-api-key] Error fetching preferences:', prefsError)
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch user preferences' 
      })
    }
    
    // Оновлюємо API key в налаштуваннях
    // Обробляємо випадок, коли apis може бути JSON рядком
    let APIs = {}
    if (prefs?.apis) {
      try {
        APIs = typeof prefs.apis === 'string' ? JSON.parse(prefs.apis) : prefs.apis
      } catch {
        APIs = {}
      }
    }
    APIs.api_key = apiKey
    
    const { error: updateError } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: req.user_id,
        apis: APIs
      }, {
        onConflict: 'user_id'
      })
    
    if (updateError) {
      console.error('[generate-api-key] Error updating preferences:', updateError)
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to save API key' 
      })
    }
    
    console.log(`[generate-api-key] Generated API key for user ${req.user_id}`)
    
    res.status(200).json({
      success: true,
      api_key: apiKey,
      message: 'API key generated successfully. Save it securely!'
    })
  } catch (error) {
    console.error('[generate-api-key] Error:', error)
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to generate API key' 
    })
  }
})

// GET /api/api-key - Отримати поточний API Key користувача
app.get('/api/api-key', getUserFromToken, async function (req, res) {
  try {
    const { data: prefs, error: prefsError } = await supabase
      .from('user_preferences')
      .select('apis')
      .eq('user_id', req.user_id)
      .single()
    
    if (prefsError && prefsError.code !== 'PGRST116') {
      console.error('[get-api-key] Error fetching preferences:', prefsError)
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch user preferences' 
      })
    }
    
    // Обробляємо випадок, коли apis може бути JSON рядком
    let APIs = {}
    if (prefs?.apis) {
      try {
        APIs = typeof prefs.apis === 'string' ? JSON.parse(prefs.apis) : prefs.apis
      } catch {
        APIs = {}
      }
    }
    const apiKey = APIs.api_key || null
    
    res.status(200).json({
      success: true,
      has_api_key: !!apiKey,
      api_key: apiKey // Повертаємо null якщо немає ключа
    })
  } catch (error) {
    console.error('[get-api-key] Error:', error)
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to get API key' 
    })
  }
})

// POST /api/syncMonoBank - Підтримує як JWT так і API Key
app.post('/api/syncMonoBank', getUserFromTokenOrApiKey, async function (req, res) {
  if (!req.body) return res.status(400).json({ success: false, error: 'Bad request: No body provided' })

  // Get API keys from database instead of .env
  const { data: prefs, error: prefsError } = await supabase
    .from('user_preferences')
    .select('apis')
    .eq('user_id', req.user_id)
    .single()
  
  if (prefsError && prefsError.code !== 'PGRST116') {
    console.error('Error fetching apis:', prefsError)
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch API keys from database' 
    })
  }
  
  const APIs = prefs?.apis || {}
  const monobankAPIs = APIs.monobank || {}
  
  // Allow token to be passed in body/header or fall back to database or server env MONO_TOKEN
  const xToken = req.body.api || req.headers['x-token'] || monobankAPIs.token || process.env.MONO_TOKEN || req.body['x-token']
  if (!xToken) return res.status(400).json({ success: false, error: 'Bad request: api token required in body.api, database, or set MONO_TOKEN in server env' })

  const id_black = monobankAPIs.black_card_id || process.env.MONO_CARD_ID_BLACK
  const id_white = monobankAPIs.white_card_id || process.env.MONO_CARD_ID_WHITE

  const id_cards = [id_black, id_white].filter(Boolean) // Filter out null/undefined

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

    // Fetch currency rates from exchangerate-api.com once and cache for this request
    let exchangeRates = {}
    try {
      const ratesResp = await axios.get('https://open.er-api.com/v6/latest/USD')
      if (ratesResp.data && ratesResp.data.rates) {
        exchangeRates = ratesResp.data.rates
      }
    } catch (e) {
      console.warn('Failed to fetch exchange rates, continuing without rates', e?.message || e)
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

        // Calculate rate from exchangeRates (exchangerate-api.com format)
        let rate = null
        if (exchangeRates && Object.keys(exchangeRates).length > 0) {
          if (currencyIso === 'USD') {
            // USD to UAH: directly from rates
            rate = exchangeRates.UAH
          } else if (exchangeRates[currencyIso] && exchangeRates.UAH) {
            // Other currency to UAH: (USD->UAH) / (currency->USD)
            rate = exchangeRates.UAH / exchangeRates[currencyIso]
          }
        }

        const formattedOp = `${mainOperationAmount} ${currencyIso}`
        const formattedMain = `${mainAmount} UAH`
        const rateText = rate ? `${rate.toFixed(2)} UAH/${currencyIso}` : 'курс не знайдено'

        note = `${note}${note ? ' | ' : ''}Конвертовано: ${formattedOp} → ${formattedMain}; курс: ${rateText}`
      }

  // insert into DB
      const newTx = await postNewCheckMonoBank(amount, note, card, txId, date, req.user_id)
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

// Захист від одночасних викликів syncBinance
const syncBinanceInProgress = new Map() // user_id -> timestamp

// POST /api/syncBinance
app.post('/api/syncBinance', getUserFromToken, async function (req, res) {
  const SYNC_TIMEOUT = 30000 // 30 seconds total timeout
  let timeoutId = null
  let responseSent = false
  
  // Helper function to send response only once
  const sendResponse = (status, data) => {
    if (responseSent) return
    responseSent = true
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    res.status(status).json(data)
  }
  
  try {
    const userId = req.user_id
    const now = Date.now()
    
    // Перевірка чи вже виконується синхронізація для цього користувача
    const lastSync = syncBinanceInProgress.get(userId)
    if (lastSync && (now - lastSync) < 30000) { // 30 секунд мінімальний інтервал
      console.log(`[syncBinance] Sync already in progress for user ${userId}, skipping`)
      return sendResponse(200, {
        success: true,
        synced: false,
        message: 'Sync already in progress, please wait'
      })
    }
    
    // Позначити що синхронізація почалася
    syncBinanceInProgress.set(userId, now)
    
    // Створюємо Promise з timeout
    const syncPromise = (async () => {
      try {
      console.log(`[syncBinance] Starting sync for user_id: ${userId}`)
      
      // Get API keys from database instead of .env
    const { data: prefs, error: prefsError } = await supabase
      .from('user_preferences')
      .select('apis')
      .eq('user_id', req.user_id)
      .single()
    
    console.log(`[syncBinance] Database query result:`, { 
      hasData: !!prefs, 
      apis: prefs?.apis,
      error: prefsError?.message,
      errorCode: prefsError?.code 
    })
    
    if (prefsError && prefsError.code !== 'PGRST116') {
      console.error('[syncBinance] Error fetching apis:', prefsError)
      return sendResponse(500, { 
        success: false, 
        synced: false, 
        message: 'Failed to fetch API keys from database' 
      })
    }
    
    const APIs = prefs?.apis || {}
    const binanceAPIs = APIs.binance || {}
    const apiKey = binanceAPIs.api_key || process.env.BINANCE_API_KEY // Fallback to .env
    const apiSecret = binanceAPIs.api_secret || process.env.BINANCE_API_SECRET // Fallback to .env

    console.log(`[syncBinance] API keys:`, {
      fromDB: {
        hasApiKey: !!binanceAPIs.api_key,
        hasApiSecret: !!binanceAPIs.api_secret,
        apiKeyLength: binanceAPIs.api_key?.length || 0,
        apiSecretLength: binanceAPIs.api_secret?.length || 0
      },
      fromEnv: {
        hasApiKey: !!process.env.BINANCE_API_KEY,
        hasApiSecret: !!process.env.BINANCE_API_SECRET
      },
      final: {
        hasApiKey: !!apiKey,
        hasApiSecret: !!apiSecret
      }
    })

    if (!apiKey || !apiSecret) {
      console.log('[syncBinance] Binance API keys not configured in database or .env, skipping sync')
      console.log('[syncBinance] Available data:', { 
        apis: prefs?.apis,
        binanceAPIs,
        envApiKey: !!process.env.BINANCE_API_KEY,
        envApiSecret: !!process.env.BINANCE_API_SECRET
      })
      // finally блок видалить userId з Map
      return sendResponse(200, { 
        success: true, 
        synced: false, 
        message: 'Binance sync skipped: API keys not configured. Please add API keys in Profile settings.' 
      })
    }

    // Find Binance Spot card efficiently for this user
    let binanceCard = null
    try {
      const { data: exactCard, error: exactErr } = await supabase
        .from('cards')
        .select('id, currency, bank, name, initial_balance, user_id')
        .eq('user_id', userId)
        .eq('bank', 'Binance')
        .eq('name', 'Spot')
        .single()
      if (!exactErr && exactCard) {
        binanceCard = exactCard
        console.log(`✅ Found Binance Spot card (exact): id=${binanceCard.id}`)
      } else {
        const { data: anyCard, error: anyErr } = await supabase
          .from('cards')
          .select('id, currency, bank, name, initial_balance, user_id')
          .eq('user_id', userId)
          .ilike('bank', '%binance%')
          .limit(1)
          .maybeSingle()
        if (anyErr) {
          console.error('Error fetching Binance card:', anyErr)
        }
        if (anyCard) {
          binanceCard = anyCard
          console.log(`⚠️ Using Binance card fallback: "${binanceCard.bank} ${binanceCard.name}" (id=${binanceCard.id})`)
        }
      }
      if (!binanceCard) {
        return sendResponse(200, { 
          success: true, 
          synced: false, 
          message: 'Binance sync skipped: No Binance card found for current user. Please create "Binance Spot" card.' 
        })
      }
    } catch (error) {
      console.error('Error finding Binance card:', error)
      return sendResponse(500, { 
        success: false, 
        synced: false,
        error: `Database error: ${error.message}`,
        message: `Database error: ${error.message}`
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
        return sendResponse(500, { 
          success: false, 
          synced: false,
          error: `Database error: ${txError.message}`,
          message: `Database error: ${txError.message}`
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
      return sendResponse(500, { 
        success: false, 
        synced: false,
        error: `Error calculating balance: ${error.message}`,
        message: `Error calculating balance: ${error.message}`
      })
    }

    // Get current balance from Binance API
    const timestamp = Date.now()
    const queryString = `timestamp=${timestamp}`
    const signature = createBinanceSignature(queryString, apiSecret)

    const url = `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`

    let response
    try {
      response = await httpClient.get(url, {
        headers: {
          'X-MBX-APIKEY': apiKey
        },
      })
    } catch (axiosError) {
      // Handle network errors (timeout, connection issues)
      if (axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED') {
        console.error('[syncBinance] Binance API request timeout')
        return sendResponse(200, { 
          success: false, 
          synced: false, 
          message: 'Binance sync failed: Request timeout. Please check your internet connection and try again later.' 
        })
      }
      if (axiosError.code === 'ENOTFOUND' || axiosError.code === 'ECONNREFUSED') {
        console.error('[syncBinance] Binance API connection error:', axiosError.code)
        return sendResponse(200, { 
          success: false, 
          synced: false, 
          message: 'Binance sync failed: Cannot connect to Binance API. Please check your internet connection.' 
        })
      }
      // Re-throw other errors to be handled by outer catch
      throw axiosError
    }

    if (!response.data || !response.data.balances) {
      return sendResponse(500, { 
        success: false, 
        synced: false,
        error: 'Invalid response from Binance API',
        message: 'Invalid response from Binance API'
      })
    }

    // Calculate total balance in USD from all cryptocurrencies
    const allBalances = response.data.balances.filter(b => {
      const total = Number(b.free) + Number(b.locked)
      return total > 0.00000001 // Only coins with balance > 0
    })

    if (allBalances.length === 0) {
      console.log('No balances found on Binance')
      return sendResponse(200, { 
        success: true, 
        synced: false, 
        message: 'Binance sync skipped: No balances found on Binance' 
      })
    }

    console.log(`Found ${allBalances.length} coins with balance:`, allBalances.map(b => b.asset).join(', '))

    // Get prices for all coins in USDT with cache
    let pricesResponse
    try {
      const now = Date.now()
      if (!binancePricesCache.data || (now - binancePricesCache.ts) > binancePricesCache.ttlMs) {
        pricesResponse = await httpClient.get('https://api.binance.com/api/v3/ticker/price')
        binancePricesCache.data = pricesResponse.data
        binancePricesCache.ts = now
      } else {
        pricesResponse = { data: binancePricesCache.data }
      }
    } catch (axiosError) {
      // Handle network errors (timeout, connection issues)
      if (axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED') {
        console.error('[syncBinance] Binance prices API request timeout')
        return sendResponse(200, { 
          success: false, 
          synced: false, 
          message: 'Binance sync failed: Request timeout while fetching prices. Please check your internet connection and try again later.' 
        })
      }
      if (axiosError.code === 'ENOTFOUND' || axiosError.code === 'ECONNREFUSED') {
        console.error('[syncBinance] Binance prices API connection error:', axiosError.code)
        return sendResponse(200, { 
          success: false, 
          synced: false, 
          message: 'Binance sync failed: Cannot connect to Binance API to fetch prices. Please check your internet connection.' 
        })
      }
      // Re-throw other errors to be handled by outer catch
      throw axiosError
    }
    
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
      // finally блок видалить userId з Map
      return sendResponse(200, { 
        success: true, 
        synced: false, 
        message: `Difference too small (${difference > 0 ? '+' : ''}${difference.toFixed(2)} USD), sync skipped` 
      })
    }

    // Create transaction with difference
    if (!binanceCard.user_id) {
      console.error('Error: Binance card has no user_id')
      // finally блок видалить userId з Map
      return sendResponse(500, { 
        success: false, 
        synced: false,
        error: 'Binance card has no user_id',
        message: 'Binance card has no user_id. Cannot create transaction without user_id.'
      })
    }

    // Перевірка на дублікати: шукаємо недавні транзакції Binance Sync з такою ж сумою
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: recentTxs, error: checkError } = await supabase
      .from('transactions')
      .select('id, amount, created_at')
      .eq('card_id', binanceCard.id)
      .eq('category', 'Binance Sync')
      .eq('user_id', userId)
      .gte('created_at', fiveMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (checkError) {
      console.error('[syncBinance] Error checking for duplicates:', checkError)
    } else if (recentTxs && recentTxs.length > 0) {
      // Перевірити чи є транзакція з такою ж сумою (з точністю до 0.01)
      const hasDuplicate = recentTxs.some(tx => {
        const txAmount = Number(tx.amount || 0)
        return Math.abs(txAmount - difference) < 0.01
      })
      
      if (hasDuplicate) {
        console.log(`[syncBinance] Duplicate transaction detected (difference: ${difference.toFixed(2)}), skipping`)
        // finally блок видалить userId з Map
        return sendResponse(200, {
          success: true,
          synced: false,
          message: 'Duplicate transaction detected, sync skipped'
        })
      }
    }

    const txPayload = {
      amount: difference,
      category: 'Binance Sync',
      note: `Auto-sync Binance balance (all coins in USD)\n\nBalance breakdown:\n${balanceBreakdown.join('\n')}\n\nTotal Binance: $${binanceBalanceUSD.toFixed(2)}\nDB balance: $${dbBalance.toFixed(2)}\nDifference: ${difference > 0 ? '+' : ''}${difference.toFixed(2)} USD`,
      card: `${binanceCard.bank || 'Binance'} ${binanceCard.name || 'Spot'}`,
      card_id: binanceCard.id,
      user_id: binanceCard.user_id, // Add user_id from card to pass RLS policy
      created_at: new Date().toISOString()
    }

    console.log(`Creating transaction with user_id: ${binanceCard.user_id}, card_id: ${binanceCard.id}`)

    const { data: newTx, error: txError } = await supabase
      .from('transactions')
      .insert([txPayload])
      .select()
      .single()

    if (txError) {
      console.error('Error creating transaction:', txError)
      return sendResponse(500, { 
        success: false, 
        synced: false,
        error: 'Failed to create sync transaction',
        message: `Failed to create sync transaction: ${txError.message || 'Unknown error'}`
      })
    }

    console.log(`Sync transaction created: ${newTx.id}, amount: ${difference}`)

    return sendResponse(200, {
      success: true,
      synced: true,
      message: `Synced successfully: ${difference > 0 ? '+' : ''}${difference.toFixed(2)} USD`,
      card_id: binanceCard.id,
      delta: difference,
      currency: 'USD'
    })
      } catch (innerError) {
        console.error('[syncBinance] Inner error:', innerError)
        throw innerError // Перекинути помилку до зовнішнього catch
      } finally {
        // Завжди видаляти з Map навіть якщо сталася помилка
        syncBinanceInProgress.delete(userId)
      }
    })()
    
    // Створюємо timeout Promise
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Sync timeout: Operation took too long'))
      }, SYNC_TIMEOUT)
    })
    
    // Виконуємо sync з timeout
    try {
      await Promise.race([syncPromise, timeoutPromise])
    } catch (error) {
      // Якщо це timeout, повертаємо відповідь
      if (error.message === 'Sync timeout: Operation took too long') {
        console.error('[syncBinance] Sync timeout after', SYNC_TIMEOUT, 'ms')
        syncBinanceInProgress.delete(userId)
        return sendResponse(200, {
          success: false,
          synced: false,
          message: 'Binance sync timeout: Operation took too long. Please try again later.'
        })
      }
      // Інакше перекидаємо помилку
      throw error
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }

  } catch (error) {
    console.error('Binance sync error:', error)
    // syncBinanceInProgress.delete вже викликається в finally
    
    // Handle Axios errors
    if (error.response) {
      console.error('Binance API error:', error.response.data)
      // Return 200 to not break the app, just log the error
      return sendResponse(200, { 
        success: false, 
        synced: false, 
        message: `Binance sync failed: ${error.response.data?.msg || error.message}` 
      })
    }
    
    // Handle network errors (timeout, connection issues)
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      console.error('[syncBinance] Network timeout error:', error.code)
      return sendResponse(200, { 
        success: false, 
        synced: false, 
        message: 'Binance sync failed: Request timeout. Please check your internet connection and try again later.' 
      })
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error('[syncBinance] Network connection error:', error.code)
      return sendResponse(200, { 
        success: false, 
        synced: false, 
        message: 'Binance sync failed: Cannot connect to Binance API. Please check your internet connection.' 
      })
    }
    
    // Generic error handler
    return sendResponse(200, { 
      success: false, 
      synced: false, 
      message: `Binance sync failed: ${error.message || 'Unknown error'}` 
    })
  }
})

// Global error handler for unhandled errors
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({
    success: false,
    synced: false,
    error: err.message || 'Internal server error',
    message: err.message || 'Internal server error'
  })
})

// Export для Vercel
export default app

// Vercel використовує serverless functions, тому не потрібен listen
// Але для локальної розробки потрібен
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
  const port = process.env.PORT || 8787
  app.listen(port, () => console.log(`API on http://localhost:${port}`))
}
