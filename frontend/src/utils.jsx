import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { supabase } from './lib/supabase'

export function cn(...inputs){ return twMerge(clsx(inputs)) }

// Helper to normalize API URL (remove trailing slash)
export function getApiUrl() {
  // Перевірка, чи є збережений API URL в localStorage (для мобільних пристроїв)
  const savedApiUrl = localStorage.getItem('api_url_override')
  if (savedApiUrl) {
    const normalized = savedApiUrl.endsWith('/') ? savedApiUrl.slice(0, -1) : savedApiUrl
    // Якщо збережений URL використовує HTTP, але сайт завантажений через HTTPS, замінити на HTTPS
    if (normalized.startsWith('http://') && window.location.protocol === 'https:') {
      return normalized.replace('http://', 'https://')
    }
    return normalized
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
  
  // За замовчуванням або з env
  let url = import.meta.env.VITE_API_URL || 'http://localhost:8787'
  
  // Якщо сайт завантажений через HTTPS, але URL використовує HTTP, замінити на HTTPS
  if (isHttps && url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
    url = url.replace('http://', 'https://')
  }
  
  return url.endsWith('/') ? url.slice(0, -1) : url
}

// Helper to get auth token from Supabase session
export async function getAuthToken() {
  try {
    // Try to get session first
    let session = null
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        console.error('[getAuthToken] Error getting session:', error)
        // Fallback: try to get from localStorage directly if getSession fails
        try {
          const storageKey = `sb-${import.meta.env.VITE_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`
          const stored = localStorage.getItem(storageKey)
          if (stored) {
            const parsed = JSON.parse(stored)
            session = parsed
            console.log('[getAuthToken] Retrieved session from localStorage fallback')
          }
        } catch (e) {
          console.warn('[getAuthToken] localStorage fallback failed:', e)
        }
      } else {
        session = data?.session
      }
    } catch (sessionError) {
      console.error('[getAuthToken] Exception getting session:', sessionError)
      // Try localStorage fallback
      try {
        const storageKey = `sb-${import.meta.env.VITE_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`
        const stored = localStorage.getItem(storageKey)
        if (stored) {
          const parsed = JSON.parse(stored)
          session = parsed
          console.log('[getAuthToken] Retrieved session from localStorage fallback (after exception)')
        }
      } catch (e) {
        console.warn('[getAuthToken] localStorage fallback failed:', e)
      }
    }
    
    if (!session) {
      console.warn('[getAuthToken] No session found')
      return null
    }
    
    if (!session.access_token) {
      console.warn('[getAuthToken] Session exists but no access_token')
      return null
    }
    
    // Log token info (first 20 chars for debugging)
    console.log(`[getAuthToken] Token found: ${session.access_token.substring(0, 20)}... (length: ${session.access_token.length})`)
    return session.access_token
  } catch (error) {
    console.error('[getAuthToken] Exception:', error)
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
    console.log(`[Storage] Usage: ${usageMB}MB / ${quotaMB}MB (${percentage}%)`)
    
    // Log largest items
    items.sort((a, b) => b.size - a.size)
    console.log('[Storage] Largest items:', items.slice(0, 5).map(i => ({ key: i.key, size: (i.size / 1024).toFixed(2) + 'KB' })))
    
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
          console.log(`[Storage] Clearing large item: ${key} (${(size / 1024).toFixed(2)}KB)`)
          localStorage.removeItem(key)
          cleared++
          clearedSize += size
        }
      }
    }
    
    if (cleared > 0) {
      const clearedMB = (clearedSize / (1024 * 1024)).toFixed(2)
      console.log(`[Storage] Cleared ${cleared} items, freed ${clearedMB}MB`)
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
  let token = await getAuthToken()
  
  // Check storage usage if token is missing (might be quota issue)
  if (!token && !endpoint.includes('/public') && !endpoint.includes('/auth')) {
    const usage = checkStorageUsage()
    // If storage is over 80% full, try to clear old data
    if (usage && usage.percentage > 80) {
      console.warn('[apiFetch] Storage quota high, attempting to clear old data...')
      clearOldStorageData()
      // Retry getting token after clearing
      token = await getAuthToken()
    }
  }
  
  const url = endpoint.startsWith('http') ? endpoint : `${getApiUrl()}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  } else {
    // Log warning if token is missing for non-public endpoints
    if (!endpoint.includes('/public') && !endpoint.includes('/auth')) {
      console.warn(`[apiFetch] No auth token for ${endpoint}`)
    }
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: options.signal, // Support AbortController
    })
    
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
      throw new Error(errorMessage)
    }
    
    // Try to parse JSON, if fails return empty object
    try {
      return await response.json()
    } catch {
      return {}
    }
  } catch (error) {
    // Re-throw AbortError so it can be handled by caller
    if (error.name === 'AbortError' || options.signal?.aborted) {
      throw error
    }
    // Re-throw other errors
    throw error
  }
}
