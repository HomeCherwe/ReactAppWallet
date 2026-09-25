/** Emoji for a transaction category (income always 💰). */
export function getCategoryIcon(category: string | null, amount: number): string {
  if (amount > 0) return '💰'
  const cat = (category || '').toLowerCase()
  if (cat.includes('їжа') || cat.includes('grocery') || cat.includes('food') || cat.includes('ресторан') || cat.includes('кафе')) return '🛒'
  if (cat.includes('транспорт') || cat.includes('taxi') || cat.includes('авто')) return '🚗'
  if (cat.includes('розваги') || cat.includes('фільм')) return '🎬'
  if (cat.includes('здоров') || cat.includes('краса') || cat.includes('аптека')) return '💊'
  if (cat.includes('спорт') || cat.includes('gym')) return '🏋️'
  if (cat.includes('зв\'язок') || cat.includes('інтернет')) return '📱'
  if (cat.includes('переказ') || cat.includes('transfer')) return '🔄'
  if (cat.includes('одяг') || cat.includes('шопінг')) return '🛍️'
  if (cat.includes('комунал') || cat.includes('дім')) return '🏠'
  return '💳'
}
