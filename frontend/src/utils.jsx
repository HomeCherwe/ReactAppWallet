import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { supabase } from './lib/supabase'

export function cn(...inputs){ return twMerge(clsx(inputs)) }

// Helper to normalize API URL (remove trailing slash)
export function getApiUrl() {
  const url = import.meta.env.VITE_API_URL || 'http://localhost:8787'
  return url.endsWith('/') ? url.slice(0, -1) : url
}

// Helper to get auth token from Supabase session
export async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

// Helper to make API requests with automatic auth token injection
export async function apiFetch(endpoint, options = {}) {
  const token = await getAuthToken()
  
  const url = endpoint.startsWith('http') ? endpoint : `${getApiUrl()}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
  })
  
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
}
