/**
 * How an account is named everywhere (same as the iPhone app): bank + card name, e.g.
 * «Готівка EUR», «Revolut Chameleon»; the bank isn't doubled when the name already starts with it
 * («Commerzbank EUR», not «Commerzbank Commerzbank EUR»).
 */
export function cardLabel(card) {
  if (!card) return ''
  const bank = String(card.bank || card.banks?.name || '').trim()
  const name = String(card.name || '').trim()
  if (!bank) return name
  if (!name) return bank
  if (name.toLowerCase().startsWith(bank.toLowerCase())) return name
  return `${bank} ${name}`
}

/**
 * A transaction's account, from its card (the stored `card` text can be stale or empty — e.g. after
 * moving the transaction to another card, or when the iPhone app created it). The stored text only
 * when the card is unknown.
 */
export function txCardLabel(tx, cardsById) {
  const card = tx?.card_id ? cardsById?.[tx.card_id] : null
  if (card) return cardLabel(card)
  return tx?.card || (tx?.card_id ? '' : 'Без рахунку')
}
