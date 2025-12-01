import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { supabase } from './lib/supabase'

export function cn(...inputs){ return twMerge(clsx(inputs)) }

// Helper to normalize API URL (remove trailing slash)
export function getApiUrl() {
  // Перевірка, чи є збережений API URL в localStorage (для мобільних пристроїв)
  // Це має найвищий пріоритет
  const savedApiUrl = localStorage.getItem('api_url_override')
  if (savedApiUrl) {
    const normalized = savedApiUrl.endsWith('/') ? savedApiUrl.slice(0, -1) : savedApiUrl
    // Якщо збережений URL використовує HTTP, але сайт завантажений через HTTPS, замінити на HTTPS
    if (normalized.startsWith('http://') && window.location.protocol === 'https:') {
      return normalized.replace('http://', 'https://')
    }
    return normalized
  }
  
  // Перевірка, чи є VITE_API_URL в env (другий пріоритет)
  const envApiUrl = import.meta.env.VITE_API_URL
  if (envApiUrl) {
    let url = envApiUrl.endsWith('/') ? envApiUrl.slice(0, -1) : envApiUrl
    
    // Якщо сайт завантажений через HTTPS, але URL використовує HTTP, замінити на HTTPS
    // (крім localhost, бо localhost зазвичай не має HTTPS)
    const isHttps = window.location.protocol === 'https:'
    if (isHttps && url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
      url = url.replace('http://', 'https://')
    }
    
    return url
  }
  
  // Визначаємо протокол на основі поточного протоколу сторінки
  const currentProtocol = window.location.protocol // 'http:' або 'https:'
  const isHttps = currentProtocol === 'https:'
  
  // Якщо працюємо на мобільному пристрої або не на localhost
  const hostname = window.location.hostname
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
  
  // Якщо не localhost (наприклад, IP-адреса або домен), використовуємо той самий протокол
  if (!isLocalhost && hostname !== '') {
    const port = import.meta.env.VITE_API_PORT || '8787'
    const protocol = isHttps ? 'https' : 'http'
    return `${protocol}://${hostname}:${port}`
  }
  
  // За замовчуванням для локальної розробки
  return 'http://localhost:8787'
}

// Helper to get auth token from Supabase session
export async function getAuthToken() {
  try {
    // Try to get session first with timeout
    let session = null
    try {
      const sessionPromise = supabase.auth.getSession()
      const sessionTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('getSession timeout')), 1500) // 1.5 секунди max
      })
      const { data, error } = await Promise.race([sessionPromise, sessionTimeout])
      if (error) {
        // Fallback: try to get from localStorage directly if getSession fails
        try {
          const storageKey = `sb-${import.meta.env.VITE_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`
          const stored = localStorage.getItem(storageKey)
          if (stored) {
            const parsed = JSON.parse(stored)
            session = parsed
          }
        } catch (e) {
          // Ignore
        }
      } else {
        session = data?.session
      }
    } catch (sessionError) {
      // Try localStorage fallback on timeout/error
      try {
        const storageKey = `sb-${import.meta.env.VITE_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`
        const stored = localStorage.getItem(storageKey)
        if (stored) {
          const parsed = JSON.parse(stored)
          session = parsed
        }
      } catch (e) {
        // Ignore
      }
    }
    
    if (!session || !session.access_token) {
      return null
    }
    
    return session.access_token
  } catch (error) {
    return null
  }
}

// Helper to check localStorage usage
export function checkStorageUsage() {
  try {
    let total = 0
    const items = []
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        const size = localStorage[key].length + key.length
        total += size
        items.push({ key, size })
      }
    }
    const quota = 5 * 1024 * 1024 // 5MB typical limit
    const usageMB = (total / (1024 * 1024)).toFixed(2)
    const quotaMB = (quota / (1024 * 1024)).toFixed(2)
    const percentage = ((total / quota) * 100).toFixed(1)
    
    // Log largest items
    items.sort((a, b) => b.size - a.size)
    
    return { used: total, quota, percentage: parseFloat(percentage), items }
  } catch (e) {
    console.error('[Storage] Error checking usage:', e)
    return null
  }
}

// Helper to clear old localStorage data (excluding auth tokens)
export function clearOldStorageData() {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const projectId = supabaseUrl?.split('//')[1]?.split('.')[0]
    const authTokenKey = projectId ? `sb-${projectId}-auth-token` : null
    
    let cleared = 0
    let clearedSize = 0
    
    // Keep only essential keys
    const keysToKeep = [
      authTokenKey,
      // Add other essential keys here if needed
    ].filter(Boolean)
    
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        // Skip auth tokens and other essential keys
        if (keysToKeep.some(keepKey => key.includes(keepKey))) {
          continue
        }
        
        // Clear old data (especially large base64 images)
        const size = localStorage[key].length + key.length
        if (size > 100 * 1024) { // Items larger than 100KB
          localStorage.removeItem(key)
          cleared++
          clearedSize += size
        }
      }
    }
    
    if (cleared > 0) {
      return { cleared, freed: clearedSize }
    }
    
    return { cleared: 0, freed: 0 }
  } catch (e) {
    console.error('[Storage] Error clearing old data:', e)
    return null
  }
}

// Helper to make API requests with automatic auth token injection
export async function apiFetch(endpoint, options = {}) {
  const startTime = Date.now()
  
  // Get token with timeout - не блокуємо запити
  let token = null
  try {
    const tokenPromise = getAuthToken()
    const tokenTimeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('getAuthToken timeout')), 2000) // 2 секунди max
    })
    token = await Promise.race([tokenPromise, tokenTimeout])
  } catch (error) {
    // Якщо токен не отримано - продовжуємо без нього (для публічних endpoints це OK)
    token = null
  }
  
  // Check storage usage if token is missing (might be quota issue)
  if (!token && !endpoint.includes('/public') && !endpoint.includes('/auth')) {
    const usage = checkStorageUsage()
    // If storage is over 80% full, try to clear old data
    if (usage && usage.percentage > 80) {
      clearOldStorageData()
      // Retry getting token after clearing
      token = await getAuthToken()
    }
  }
  
  const apiUrl = getApiUrl()
  
  if (!apiUrl || apiUrl === 'undefined' || apiUrl.includes('undefined')) {
    console.error(`[apiFetch] ❌ CRITICAL: Invalid API URL: ${apiUrl}`)
    throw new Error(`Invalid API URL: ${apiUrl}`)
  }
  
  const url = endpoint.startsWith('http') ? endpoint : `${apiUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  try {
    const fetchStartTime = Date.now()
    
    // Add timeout wrapper for fetch
    const fetchPromise = fetch(url, {
      ...options,
      headers,
      signal: options.signal, // Support AbortController
    })
    
    // Add 15 second timeout to detect hanging requests
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        // Не логуємо таймаут - просто відхиляємо проміс
        reject(new Error(`Fetch timeout after 15s for ${endpoint}`))
      }, 15000)
    })
    
    const response = await Promise.race([fetchPromise, timeoutPromise])
    const fetchTime = Date.now() - fetchStartTime
    
    // Check if request was aborted before processing response
    if (options.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`
      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorData.message || errorMessage
      } catch {
        // If response is not JSON, use status text
      }
      console.error(`[apiFetch] ❌ Error response: ${response.status} ${response.statusText}`, errorMessage)
      throw new Error(errorMessage)
    }
    
    // Try to parse JSON, if fails return empty object
    try {
      const data = await response.json()
      return data
    } catch {
      return {}
    }
  } catch (error) {
    const totalTime = Date.now() - startTime
    // Re-throw AbortError so it can be handled by caller
    if (error.name === 'AbortError' || options.signal?.aborted) {
      throw error
    }
    // Не логуємо таймаути - просто відхиляємо
    if (error.message && error.message.includes('timeout')) {
      throw error
    }
    // Re-throw other errors (але не логуємо таймаути)
    console.error(`[apiFetch] ❌ Error fetching ${endpoint}:`, error)
    throw error
  }
}
