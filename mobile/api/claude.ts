import { apiFetch } from '../lib/apiFetch'

// «Claude» (same as the web's settings): MyWallet as a connector in Claude. The server keeps the connections.

export interface ClaudeConnection {
  id: string
  client_name: string
  redirect_host: string
  created_at: string
  last_used_at: string | null
}

export const getClaudeConnections = () =>
  apiFetch<{ url: string; connections: ClaudeConnection[] }>('/api/claude/connections')

export const removeClaudeConnection = (id: string) =>
  apiFetch(`/api/claude/connections/${encodeURIComponent(id)}`, { method: 'DELETE' })
