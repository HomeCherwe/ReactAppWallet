// What an account is for — the same rules as the web (frontend/src/utils/accountKind.js) and the
// iPhone app (mobile/utils/accountKind.ts). The person chooses it (cards.kind); accounts from
// before that, or while the database doesn't have the column yet, get it guessed from the names.

export const ACCOUNT_KINDS = ['card', 'cash', 'savings', 'investment']

export function guessAccountKind(card) {
  const full = `${card?.banks?.name || card?.bank || ''} ${card?.name || ''}`.toLowerCase()
  if (/збер|savings|накопич|скарбн/.test(full)) return 'savings'
  if (/гот|cash/.test(full)) return 'cash'
  if (/binance|крипт|crypto/.test(full)) return 'investment'
  return 'card'
}

export function accountKind(card) {
  return ACCOUNT_KINDS.includes(card?.kind) ? card.kind : guessAccountKind(card)
}

const BUCKET_OF_KIND = { card: 'cards', cash: 'cash', savings: 'savings', investment: 'investments' }

/** The balance group an account is in; no account = cash */
export const cardBucket = (card) => (card ? BUCKET_OF_KIND[accountKind(card)] : 'cash')

/** Savings and investments stay out of income/expense statistics */
export const kindOutOfStats = (card) => ['savings', 'investment'].includes(accountKind(card))

// cards.kind / goal_amount / archived come with the cards_kind_goal_archived migration. Until the
// database has them, queries run without them (and the kind is guessed from the names).
export const CARD_V2_COLUMNS = ', kind, goal_amount, archived'
let v2MissingUntil = 0

const isMissingV2Column = (e) =>
  !!e &&
  (e.code === '42703' || e.code === 'PGRST204' || /does not exist|schema cache/i.test(e.message || '')) &&
  /kind|goal_amount|archived/.test(e.message || '')

/**
 * Runs a cards query with the new columns (`run(CARD_V2_COLUMNS)`), or without them (`run('')`)
 * while the database doesn't have them; checks again every 5 minutes.
 */
export async function withCardV2(run) {
  if (Date.now() >= v2MissingUntil) {
    const result = await run(CARD_V2_COLUMNS)
    if (!isMissingV2Column(result.error)) return result
    v2MissingUntil = Date.now() + 5 * 60e3
  }
  return run('')
}

/** Whether the last query found the new columns (writes to them fail without the migration) */
export const cardV2Available = () => Date.now() >= v2MissingUntil
