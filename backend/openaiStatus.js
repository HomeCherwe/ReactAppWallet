// What a failure from OpenAI means, in words the person can act on. Scanning, the assistant and the
// month's report all depend on it, and «спробуйте ще раз» doesn't help when the credits ran out.

const OPENAI_MODEL = 'gpt-5.1'

/** { code, message } for a failure we can name; null for anything else */
export function describeOpenAIError(text, status) {
  const s = String(text || '')
  if (/credit_balance_exhausted|insufficient_quota|no credits remaining/i.test(s)) {
    return { code: 'no_credits', message: 'AI тимчасово не працює: на акаунті OpenAI закінчились кредити' }
  }
  if (status === 401 || /OpenAI 401|invalid_api_key|incorrect api key/i.test(s)) {
    return { code: 'bad_key', message: 'AI не працює: сервер не приймає ключ OpenAI' }
  }
  if (status === 429 || /OpenAI 429|rate_limit/i.test(s)) {
    return { code: 'rate_limited', message: 'AI зараз перевантажений — спробуйте за хвилину' }
  }
  return null
}

/** One tiny question to OpenAI: the only way to know the key works and has credits. A tiny cost. */
export async function pingOpenAI() {
  if (!process.env.OPENAI_API_KEY) return { ok: false, status: 0, error: 'OPENAI_API_KEY не задано' }
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_completion_tokens: 5,
        messages: [{ role: 'user', content: 'Say ok' }],
      }),
    })
    if (r.ok) return { ok: true, status: r.status }
    return { ok: false, status: r.status, error: await r.text() }
  } catch (e) {
    return { ok: false, status: 0, error: e?.name === 'TimeoutError' ? 'OpenAI не відповів за 15 секунд' : e?.message || 'Немає зв’язку з OpenAI' }
  }
}
