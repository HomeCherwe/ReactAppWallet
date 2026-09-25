// Pinned transactions — same convention as the web app: a "[pinned]" tag in the note,
// or a category listed in settings (dashboard.pinnedCategories).

export const PIN_TAG = '[pinned]'

export function hasPinTag(note?: string | null): boolean {
  return String(note || '').includes(PIN_TAG)
}

/** Note text for display/editing, without the tag. */
export function stripPinTag(note?: string | null): string {
  return String(note || '').split(PIN_TAG).join('').trim()
}

/** Note with the tag added or removed (the web app puts it on its own line). Null when empty. */
export function withPinTag(note: string | null | undefined, pinned: boolean): string | null {
  const clean = stripPinTag(note)
  if (!pinned) return clean || null
  return clean ? `${clean}\n${PIN_TAG}` : PIN_TAG
}

export type PinState = 'tag' | 'category' | 'none'

/** Why a transaction is pinned: by its own tag, only through its category, or not at all. */
export function pinStateOf(
  tx: { note?: string | null; category?: string | null },
  pinnedCategories: string[]
): PinState {
  if (hasPinTag(tx.note)) return 'tag'
  if (tx.category && pinnedCategories.includes(tx.category)) return 'category'
  return 'none'
}

/** Title for list rows: the note (without the tag), else merchant, else category. */
export function txDisplayTitle(tx: {
  note?: string | null
  merchant_name?: string | null
  category?: string | null
  amount: number | string
}): string {
  return stripPinTag(tx.note) || tx.merchant_name || tx.category || (Number(tx.amount) > 0 ? 'Дохід' : 'Витрата')
}
