import { apiFetch } from '../utils.jsx'

/**
 * Asks the AI assistant (same as the iPhone app). `transactionId` — the chat is about that
 * transaction. It only reads the user's data. → { answer, transactions }
 */
export async function askAssistant(messages, transactionId) {
  const res = await apiFetch('/api/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({
      messages,
      ...(transactionId && { transactionId }),
      client: { offsetMin: -new Date().getTimezoneOffset() },
    }),
    // GPT may look things up several times before answering
    timeoutMs: 90000,
  })
  return { answer: res?.answer || '', transactions: res?.transactions || [] }
}
