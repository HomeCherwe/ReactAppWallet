import { Card } from '../api/cards'

/**
 * How an account is named everywhere (same as the web): bank + card name, e.g. «Готівка EUR»,
 * «Revolut Chameleon» — a card called just «EUR» says nothing on its own. The bank isn't doubled
 * when the name already starts with it («Commerzbank EUR»).
 */
export function cardLabel(card?: Pick<Card, 'bank' | 'name'> | null): string {
  if (!card) return ''
  const bank = String(card.bank || '').trim()
  const name = String(card.name || '').trim()
  if (!bank) return name
  if (!name) return bank
  if (name.toLowerCase().startsWith(bank.toLowerCase())) return name
  return `${bank} ${name}`
}
