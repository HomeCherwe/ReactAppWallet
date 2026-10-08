import { apiFetch } from '../lib/apiFetch'
import { Transaction } from './transactions'

export interface AssistantTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantReply {
  answer: string
  /** Transactions the answer points to, shown under it */
  transactions: Transaction[]
}

/**
 * Asks the AI assistant. `transactionId` — the chat was opened from that transaction (long press →
 * «Запитати AI»). It reads the user's data through the backend; it changes nothing.
 */
export async function askAssistant(messages: AssistantTurn[], transactionId?: string): Promise<AssistantReply> {
  // GPT may look things up several times before answering
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90000)
  try {
    const res = await apiFetch<AssistantReply>('/api/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages,
        ...(transactionId && { transactionId }),
        client: { offsetMin: -new Date().getTimezoneOffset() },
      }),
      signal: controller.signal,
    })
    return { answer: res?.answer || '', transactions: res?.transactions || [] }
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Асистент думає задовго — спробуй ще раз')
    throw e
  } finally {
    clearTimeout(timer)
  }
}
