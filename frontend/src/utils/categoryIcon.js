/** Emoji for a transaction category (income always 💰) — same as the iPhone app's list. */
export function getCategoryIcon(category, amount) {
  if (amount > 0) return '💰'
  const cat = String(category || '').toLowerCase()
  if (cat.includes('їжа') || cat.includes('продукт') || cat.includes('grocery') || cat.includes('food') || cat.includes('ресторан') || cat.includes('кафе')) return '🛒'
  if (cat.includes('транспорт') || cat.includes('taxi') || cat.includes('таксі') || cat.includes('авто') || cat.includes('заправ')) return '🚗'
  if (cat.includes('розваги') || cat.includes('фільм')) return '🎬'
  if (cat.includes('здоров') || cat.includes('краса') || cat.includes('аптека')) return '💊'
  if (cat.includes('спорт') || cat.includes('gym')) return '🏋️'
  if (cat.includes('зв\'язок') || cat.includes('мобільн') || cat.includes('інтернет')) return '📱'
  if (cat.includes('переказ') || cat.includes('transfer')) return '🔄'
  if (cat.includes('одяг') || cat.includes('шопінг')) return '🛍️'
  if (cat.includes('комунал') || cat.includes('дім') || cat.includes('хат') || cat.includes('квартир')) return '🏠'
  if (cat.includes('підписк')) return '🔁'
  if (cat.includes('поверн')) return '↩️'
  return '💳'
}
