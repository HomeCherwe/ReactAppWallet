import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs){ return twMerge(clsx(inputs)) }

// Helper to normalize API URL (remove trailing slash)
export function getApiUrl() {
  const url = import.meta.env.VITE_API_URL || 'http://localhost:8787'
  return url.endsWith('/') ? url.slice(0, -1) : url
}
