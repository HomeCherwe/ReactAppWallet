// What an account is for — the same rules as the web (frontend/src/utils/accountKind.js) and the
// backend (backend/accountKind.js). The person chooses it (cards.kind); accounts from before that,
// or while the database doesn't have the column yet, get it guessed from the names.

export type AccountKind = 'card' | 'savings' | 'cash' | 'investment'
export type Bucket = 'cards' | 'savings' | 'cash' | 'investments'

export const ACCOUNT_KINDS: AccountKind[] = ['card', 'savings', 'cash', 'investment']

/** Names, icons and accents per kind: the cards screen groups, Home's balance split, the forms */
export const KIND_META: Record<AccountKind, { one: string; many: string; icon: string; accent: [string, string]; hint: string }> = {
  card: { one: 'Картка', many: 'Картки', icon: '💳', accent: ['#FF8A2A', '#FF4D00'], hint: 'Для щоденних витрат' },
  savings: { one: 'Скарбничка', many: 'Скарбнички', icon: '🐷', accent: ['#34D399', '#0E9F6E'], hint: 'Гроші, які відкладаєте' },
  cash: { one: 'Готівка', many: 'Готівка', icon: '💵', accent: ['#FBBF24', '#D97706'], hint: 'Гроші в гаманці' },
  investment: { one: 'Інвестиції', many: 'Інвестиції', icon: '📈', accent: ['#A78BFA', '#7C3AED'], hint: 'Крипта, акції — вартість змінюється' },
}

/** Balance groups (fetchTotalsByBucket, the balance history), in the order Home shows them */
export const BUCKETS: Bucket[] = ['cards', 'savings', 'cash', 'investments']
export const BUCKET_OF_KIND: Record<AccountKind, Bucket> = { card: 'cards', savings: 'savings', cash: 'cash', investment: 'investments' }
export const KIND_OF_BUCKET: Record<Bucket, AccountKind> = { cards: 'card', savings: 'savings', cash: 'cash', investments: 'investment' }

interface KindSource {
  kind?: string | null
  bank?: string | null
  name?: string | null
}

export function guessAccountKind(card: KindSource | null | undefined): AccountKind {
  const full = `${card?.bank || ''} ${card?.name || ''}`.toLowerCase()
  if (/збер|savings|накопич|скарбн/.test(full)) return 'savings'
  if (/гот|cash/.test(full)) return 'cash'
  if (/binance|крипт|crypto/.test(full)) return 'investment'
  return 'card'
}

export function accountKind(card: KindSource | null | undefined): AccountKind {
  return ACCOUNT_KINDS.includes(card?.kind as AccountKind) ? (card!.kind as AccountKind) : guessAccountKind(card)
}

/** The balance group an account is in; no account (a cash transaction) = cash */
export const getBucket = (card: KindSource | null | undefined): Bucket => (card ? BUCKET_OF_KIND[accountKind(card)] : 'cash')

/** Savings and investments stay out of income/expense statistics */
export const kindOutOfStats = (card: KindSource | null | undefined) => ['savings', 'investment'].includes(accountKind(card))

/** Only an empty account goes to the archive, so the archive never hides money */
export const isEmptyBalance = (balance: number | undefined | null) => Math.abs(Number(balance) || 0) < 0.005

/** Where a piggy bank is on its way to the goal: 0…1, or null without a goal */
export function goalProgress(card: { goal_amount?: number | null } | null | undefined, balance: number | undefined): number | null {
  const goal = Number(card?.goal_amount)
  if (!(goal > 0)) return null
  return Math.max(0, Math.min(1, (Number(balance) || 0) / goal))
}

/** "10 000,50" → 10000.5; empty or not above zero → no goal */
export function parseGoal(text: string): number | null {
  const n = parseFloat(String(text || '').replace(/\s/g, '').replace(',', '.'))
  return n > 0 ? Math.round(n * 100) / 100 : null
}
