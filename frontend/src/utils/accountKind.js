// What an account is for — the same rules as the iPhone app (mobile/utils/accountKind.ts) and the
// backend (backend/accountKind.js). The person chooses it (cards.kind); accounts from before that,
// or while the database doesn't have the column yet, get it guessed from the names.

export const ACCOUNT_KINDS = ['card', 'savings', 'cash', 'investment']

/** Names, icons and accents per kind: the cards page groups, Home's balance split, the forms */
export const KIND_META = {
  card: { one: 'Картка', many: 'Картки', icon: '💳', accent: ['#FF8A2A', '#FF4D00'], hint: 'Для щоденних витрат' },
  savings: { one: 'Скарбничка', many: 'Скарбнички', icon: '🐷', accent: ['#34D399', '#0E9F6E'], hint: 'Гроші, які відкладаєте' },
  cash: { one: 'Готівка', many: 'Готівка', icon: '💵', accent: ['#FBBF24', '#D97706'], hint: 'Гроші в гаманці' },
  investment: { one: 'Інвестиції', many: 'Інвестиції', icon: '📈', accent: ['#A78BFA', '#7C3AED'], hint: 'Крипта, акції — вартість змінюється' },
}

/** Balance groups (fetchTotalsByBucket, the balance history), in the order Home shows them */
export const BUCKETS = ['cards', 'savings', 'cash', 'investments']
export const BUCKET_OF_KIND = { card: 'cards', savings: 'savings', cash: 'cash', investment: 'investments' }
export const KIND_OF_BUCKET = { cards: 'card', savings: 'savings', cash: 'cash', investments: 'investment' }

export function guessAccountKind(card) {
  const full = `${card?.bank || ''} ${card?.name || ''}`.toLowerCase()
  if (/збер|savings|накопич|скарбн/.test(full)) return 'savings'
  if (/гот|cash/.test(full)) return 'cash'
  if (/binance|крипт|crypto/.test(full)) return 'investment'
  return 'card'
}

export function accountKind(card) {
  return ACCOUNT_KINDS.includes(card?.kind) ? card.kind : guessAccountKind(card)
}

/** The balance group an account is in; no account (a cash transaction) = cash */
export const getBucket = (card) => (card ? BUCKET_OF_KIND[accountKind(card)] : 'cash')

/** Savings and investments stay out of income/expense statistics */
export const kindOutOfStats = (card) => ['savings', 'investment'].includes(accountKind(card))

/** Only an empty account goes to the archive, so the archive never hides money */
export const isEmptyBalance = (balance) => Math.abs(Number(balance) || 0) < 0.005

/** Where a piggy bank is on its way to the goal: 0…1, or null without a goal */
export function goalProgress(card, balance) {
  const goal = Number(card?.goal_amount)
  if (!(goal > 0)) return null
  return Math.max(0, Math.min(1, (Number(balance) || 0) / goal))
}
