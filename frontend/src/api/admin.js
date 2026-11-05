import { useEffect, useState } from 'react'
import { apiFetch } from '../utils.jsx'

// «Адмінка» (same as the iPhone app): what goes wrong in the project. The server decides who may see it.

/** Whether this login is the owner's; asked once per page load */
let adminPromise = null
export function fetchIsAdmin() {
  if (!adminPromise) {
    adminPromise = apiFetch('/api/admin/me')
      .then(res => !!res?.admin)
      .catch(() => {
        adminPromise = null
        return false
      })
  }
  return adminPromise
}

export function useIsAdmin() {
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    let alive = true
    fetchIsAdmin().then(v => alive && setAdmin(v))
    return () => {
      alive = false
    }
  }, [])
  return admin
}

/** Problems of the last `hours`, grouped: [{ fingerprint, source, level, message, count, users, … }] */
export const getAdminLogs = hours => apiFetch(`/api/admin/logs?hours=${hours}`)

/** OpenAI, the database, the server's keys, the banks: checked right now */
export const getAdminHealth = () => apiFetch('/api/admin/health', { timeoutMs: 30000 })
