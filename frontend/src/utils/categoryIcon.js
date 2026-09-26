import {
  ArrowLeftRight, Banknote, Car, Clapperboard, Coffee, CreditCard, Dumbbell, Fuel, Gift,
  GraduationCap, HandCoins, HeartPulse, Home, Hourglass, Inbox, Plane, Repeat, RotateCcw,
  ShoppingBag, ShoppingCart, Smartphone, Utensils,
} from 'lucide-react'

// iOS system colors
const IOS = {
  red: '#FF3B30',
  orange: '#FF9500',
  yellow: '#FFB800',
  green: '#34C759',
  mint: '#00C7BE',
  teal: '#30B0C7',
  blue: '#007AFF',
  indigo: '#5856D6',
  purple: '#AF52DE',
  pink: '#FF2D55',
  brown: '#A2845E',
  gray: '#8E8E93',
}

// First match wins: [words in the category, icon, color]
const RULES = [
  [['поверн', 'refund'], RotateCcw, IOS.teal],
  [['борг', 'debt'], HandCoins, IOS.red],
  [['має вернут', 'маю вернут'], Hourglass, IOS.orange],
  [['sync'], Inbox, IOS.gray],
  [['переказ', 'transfer'], ArrowLeftRight, IOS.indigo],
  [['кафе', 'ресторан', 'restaurant', 'їжа', 'food', 'доставк'], Utensils, IOS.orange],
  [['кава', 'coffee'], Coffee, IOS.brown],
  [['продукт', 'grocery', 'супермаркет'], ShoppingCart, IOS.green],
  [['заправ', 'пальне', 'fuel'], Fuel, IOS.blue],
  [['транспорт', 'таксі', 'taxi', 'uber', 'bolt', 'авто'], Car, IOS.blue],
  [['розваг', 'фільм', 'кіно'], Clapperboard, IOS.purple],
  [['здоров', 'аптека', 'лікар', 'краса'], HeartPulse, IOS.red],
  [['спорт', 'gym'], Dumbbell, IOS.mint],
  [['зв\'язок', 'мобільн', 'інтернет', 'телефон'], Smartphone, IOS.blue],
  [['одяг', 'шопінг', 'покупк'], ShoppingBag, IOS.pink],
  [['комунал', 'квартир', 'оренд', 'дім', 'хат'], Home, IOS.yellow],
  [['підписк', 'subscription'], Repeat, IOS.indigo],
  [['подарун', 'gift'], Gift, IOS.pink],
  [['подорож', 'travel', 'квиток', 'авіа'], Plane, IOS.teal],
  [['освіт', 'курс', 'навчан'], GraduationCap, IOS.indigo],
]

/** iOS-Settings-style icon for a transaction: a glyph and the color of its square. */
export function getCategoryVisual(category, amount, isTransfer = false) {
  if (isTransfer) return { Icon: ArrowLeftRight, color: IOS.indigo }
  const cat = String(category || '').toLowerCase()
  for (const [words, Icon, color] of RULES) {
    if (words.some(w => cat.includes(w))) return { Icon, color }
  }
  if (amount > 0) return { Icon: Banknote, color: IOS.green }
  return { Icon: CreditCard, color: IOS.gray }
}
