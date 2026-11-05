import { apiFetch } from '../lib/apiFetch'

// «Адмінка» (same as the web): what goes wrong in the project. The server decides who may see it.

export interface AdminProblem {
  fingerprint: string
  source: 'server' | 'web' | 'ios'
  level: 'error' | 'warn'
  message: string
  details?: string | null
  path?: string | null
  status?: number | null
  app_version?: string | null
  count: number
  users: number
  mine: boolean
  first_at: string
  last_at: string
}

export interface AdminLogs {
  hours: number
  truncated: boolean
  groups: AdminProblem[]
}

export interface AdminHealth {
  checks: { key: string; label: string; state: 'ok' | 'warn' | 'fail'; text: string; link?: string; linkLabel?: string }[]
  banks: { provider: string; last_sync_at: string | null; mine: boolean; problem: string | null }[]
  deploy?: { commit: string | null; region: string | null; env: string | null }
}

/** Whether this login is the owner's */
export async function fetchIsAdmin(): Promise<boolean> {
  try {
    return !!(await apiFetch<{ admin: boolean }>('/api/admin/me')).admin
  } catch {
    return false
  }
}

export function getAdminLogs(hours: number): Promise<AdminLogs> {
  return apiFetch<AdminLogs>(`/api/admin/logs?hours=${hours}`)
}

/** OpenAI, the database, the server's keys, the banks: checked right now (OpenAI can take a while) */
export async function getAdminHealth(): Promise<AdminHealth> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    return await apiFetch<AdminHealth>('/api/admin/health', { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
