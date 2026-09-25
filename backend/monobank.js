import axios from 'axios'

// Monobank personal API (https://api.monobank.ua/docs/). The user connects with a personal token
// from api.monobank.ua; it's stored encrypted in bank_connections like the TrueLayer tokens.
// Limits: client-info and statement — one request per 60 s per token; statement covers ≤ 31 days
// and returns ≤ 500 items. New transactions also arrive instantly through the webhook.

const MONO_API = 'https://api.monobank.ua'
export const MONOBANK_ID = 'monobank'
export const MONO_MAX_DAYS = 31
export const MONO_REQUEST_GAP_MS = 61000

export const MONOBANK_PROVIDER = {
  provider_id: MONOBANK_ID,
  name: 'Monobank',
  country: 'ua',
  auth: 'token', // connected with a personal token instead of a bank login redirect
}

// Served at /api/bank-logos/monobank.svg (TrueLayer-style SVG logo for the catalog)
export const MONOBANK_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="16" fill="#141414"/>
<text x="32" y="43" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="#fff">m</text>
<circle cx="47" cy="19" r="4" fill="#fff"/>
</svg>`

// ISO 4217 numeric → letter codes
const CURRENCIES = {
  980: 'UAH', 840: 'USD', 978: 'EUR', 826: 'GBP', 985: 'PLN', 203: 'CZK', 348: 'HUF', 756: 'CHF',
  124: 'CAD', 392: 'JPY', 949: 'TRY', 946: 'RON', 208: 'DKK', 752: 'SEK', 578: 'NOK', 36: 'AUD',
  156: 'CNY', 376: 'ILS',
}

export function currencyOf(code) {
  return CURRENCIES[Number(code)] || String(code)
}

const TYPE_NAMES = {
  black: 'Black',
  white: 'White',
  platinum: 'Platinum',
  iron: 'Iron',
  yellow: 'Yellow',
  fop: 'ФОП',
  eAid: 'єПідтримка',
  madeInUkraine: 'Made in Ukraine',
  rebuilding: 'єВідновлення',
}

export class MonoTokenError extends Error {}
export class MonoRateLimitError extends Error {}

async function monoRequest(method, token, path, data) {
  try {
    const res = await axios({ method, url: `${MONO_API}${path}`, data, headers: { 'X-Token': token }, timeout: 20000 })
    return res.data
  } catch (e) {
    const status = e.response?.status
    if (status === 401 || status === 403) throw new MonoTokenError('Токен Monobank недійсний або відкликаний')
    if (status === 429) throw new MonoRateLimitError('Monobank: забагато запитів, спробуйте за хвилину')
    throw new Error(e.response?.data?.errorDescription || e.message)
  }
}

export const fetchClientInfo = token => monoRequest('get', token, '/personal/client-info')

/** Statement of one account, newest first. */
export function fetchStatement(token, accountId, fromSec, toSec) {
  return monoRequest('get', token, `/personal/statement/${accountId}/${fromSec}/${toSec}`)
}

export const setWebhook = (token, url) => monoRequest('post', token, '/personal/webhook', { webHookUrl: url })

/** Monobank accounts as bank-connection items (cards in the app). Jars aren't included. */
export function accountsFromClientInfo(info) {
  return (info?.accounts || []).map(a => {
    const currency = currencyOf(a.currencyCode)
    const type = TYPE_NAMES[a.type] || a.type || 'Card'
    const last4 = String(a.maskedPan?.[0] || '').slice(-4)
    return {
      kind: 'account',
      account_id: a.id,
      currency,
      display_name: `${type} ${currency}${last4 ? ` ·${last4}` : ''}`,
      meta: {
        // Existing cards named after the card type ("Black", "White") get linked to it
        match_name: type,
        card_name: currency === 'UAH' ? `Monobank ${type}` : `Monobank ${type} ${currency}`,
        // Own money: Monobank's balance includes the credit limit
        balance: (Number(a.balance || 0) - Number(a.creditLimit || 0)) / 100,
        credit_limit: Number(a.creditLimit || 0) / 100,
      },
    }
  })
}

/** Transaction row for our table from a Monobank statement item. */
export function monoTransactionRow(it, { userId, cardId, providerName, accountCurrency }) {
  const parts = [it.description, it.comment].filter(Boolean)
  const opCurrency = currencyOf(it.currencyCode)
  if (opCurrency !== accountCurrency && it.operationAmount) {
    parts.push(`${Math.abs(Number(it.operationAmount)) / 100} ${opCurrency}`)
  }
  return {
    user_id: userId,
    amount: Number(it.amount || 0) / 100, // already signed: negative = spending
    category: `${providerName} Sync`,
    note: parts.join(' | '),
    archives: false,
    card: providerName,
    card_id: cardId,
    transaction_id_card: String(it.id),
    created_at: new Date(Number(it.time) * 1000).toISOString(),
    merchant_name: it.counterName || it.description || null,
  }
}
