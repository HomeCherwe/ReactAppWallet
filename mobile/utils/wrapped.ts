import { CountedTx } from './statsCount'
import { convertCurrency, formatMoney, RatesMap } from './currency'
import { stripPinTag } from './pinned'

// «MyWallet Wrapped»: the year in a few fun numbers, like Spotify's. Counted from the same rows
// as Analytics (countedTransactions), everything in the main currency. The web has the same file.

const COFFEE = /coffee|\bcafe\b|café|espresso|starbucks|costa coffee|кава|кави|каву|кавою|кав.ярн|кофе|латте|капучин/i
const EATING_OUT = /кафе|ресторан|restaurant|бістро|bistro|mcdonald|kfc|burger|піц|pizza|суші|sushi|фастфуд|fast ?food/i
const TAXI = /такс|taxi|\buber\b(?!\s*eats)|\bbolt\b(?!\s*food)|uklon|heetch|free ?now|lyft|\bg7\b/i
const DELIVERY = /glovo|uber\s*eats|bolt\s*food|wolt|deliveroo|just\s*eat|доставк|raketa/i
// Bills you can't really cut (left out of the "you could have…" comparison)
const FIXED = /квартир|оренд|rent|комунал|кредит|податк|страхов|іпотек|mortgage|loan/i

// Reference prices for the comparisons, in EUR
const PRICES = {
  barcelona: 90, // a return flight
  iphone: 1200,
  netflix: 13, // a month
  pizza: 12,
  cinema: 10,
}

export interface WrappedData {
  year: number
  currency: string
  spent: number
  earned: number
  expenses: number
  days: number
  topMerchant: { name: string; count: number; total: number } | null
  priciestDay: { date: Date; total: number; count: number; top: string } | null
  topCategory: { name: string; total: number; share: number } | null
  coffee: { count: number; total: number; kind: 'coffee' | 'eating-out' } | null
  taxi: { count: number; total: number } | null
  delivery: { count: number; total: number } | null
  biggest: { title: string; amount: number; date: Date } | null
  busiestMonth: { month: number; total: number } | null
  weekday: { day: number; share: number } | null
  comparisons: { emoji: string; text: string }[]
}

export const MONTHS_NOM = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень']
export const WEEKDAYS_ACC = ['неділю', 'понеділок', 'вівторок', 'середу', 'четвер', 'пʼятницю', 'суботу']

/** Where the money went, as a short name: "Lidl", "YouTube", the note… */
function merchantOf(c: CountedTx): string {
  const raw = c.tx.merchant_name || stripPinTag(c.tx.note) || c.tx.category || ''
  return raw.split('|')[0].split('\n')[0].trim().slice(0, 40)
}

const textOf = (c: CountedTx) => `${c.tx.category || ''} ${c.tx.merchant_name || ''} ${stripPinTag(c.tx.note)}`

function times(n: number): string {
  if (n >= 10) return String(Math.round(n))
  return n.toFixed(1).replace('.', ',').replace(',0', '')
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export function computeWrapped(counted: CountedTx[], year: number, currency: string, rates: RatesMap | null): WrappedData {
  const rows = counted.filter(c => new Date(c.tx.created_at).getFullYear() === year)
  const expenses = rows.filter(c => !c.income)
  const spent = expenses.reduce((s, c) => s + c.value, 0)
  const earned = rows.filter(c => c.income).reduce((s, c) => s + c.value, 0)
  const days = new Set(rows.map(c => new Date(c.tx.created_at).toDateString())).size
  const eur = (amount: number) => convertCurrency(amount, 'EUR', currency, rates)

  // Top merchant: where the user paid most often (ties: more money)
  const merchants = new Map<string, { name: string; count: number; total: number }>()
  for (const c of expenses) {
    const name = merchantOf(c)
    if (!name) continue
    const key = name.toLowerCase()
    const m = merchants.get(key) ?? { name, count: 0, total: 0 }
    m.count += 1
    m.total += c.value
    merchants.set(key, m)
  }
  const topMerchant = [...merchants.values()].sort((a, b) => b.count - a.count || b.total - a.total)[0] ?? null

  // The most expensive day
  const byDay = new Map<string, { date: Date; total: number; count: number; items: CountedTx[] }>()
  for (const c of expenses) {
    const d = new Date(c.tx.created_at)
    const key = d.toDateString()
    const g = byDay.get(key) ?? { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), total: 0, count: 0, items: [] }
    g.total += c.value
    g.count += 1
    g.items.push(c)
    byDay.set(key, g)
  }
  const day = [...byDay.values()].sort((a, b) => b.total - a.total)[0]
  const priciestDay = day
    ? { date: day.date, total: day.total, count: day.count, top: merchantOf([...day.items].sort((a, b) => b.value - a.value)[0]) }
    : null

  const cats = new Map<string, number>()
  for (const c of expenses) {
    const name = c.tx.category || 'Інше'
    cats.set(name, (cats.get(name) || 0) + c.value)
  }
  const cat = [...cats.entries()].sort((a, b) => b[1] - a[1])[0]
  const topCategory = cat ? { name: cat[0], total: cat[1], share: spent > 0 ? cat[1] / spent : 0 } : null

  const matching = (re: RegExp) => {
    const list = expenses.filter(c => re.test(textOf(c)))
    return list.length ? { count: list.length, total: list.reduce((s, c) => s + c.value, 0) } : null
  }
  // Coffee if there's enough of it to talk about, else eating out
  const coffeeOnly = matching(COFFEE)
  const eatingOut = matching(EATING_OUT)
  const coffee =
    coffeeOnly && (coffeeOnly.count >= 5 || !eatingOut || eatingOut.count <= coffeeOnly.count)
      ? { ...coffeeOnly, kind: 'coffee' as const }
      : eatingOut
        ? { ...eatingOut, kind: 'eating-out' as const }
        : null
  const taxi = matching(TAXI)
  const delivery = matching(DELIVERY)

  const big = [...expenses].sort((a, b) => b.value - a.value)[0]
  const biggest = big ? { title: merchantOf(big) || 'Покупка', amount: big.value, date: new Date(big.tx.created_at) } : null

  const months = new Array(12).fill(0)
  for (const c of expenses) months[new Date(c.tx.created_at).getMonth()] += c.value
  const busiest = months.reduce((best, v, i) => (v > months[best] ? i : best), 0)
  const busiestMonth = spent > 0 ? { month: busiest, total: months[busiest] } : null

  const week = new Array(7).fill(0)
  for (const c of expenses) week[new Date(c.tx.created_at).getDay()] += c.value
  const wd = week.reduce((best, v, i) => (v > week[best] ? i : best), 0)
  const weekday = spent > 0 ? { day: wd, share: week[wd] / spent } : null

  // Fun comparisons, only where there's something to compare
  const comparisons: { emoji: string; text: string }[] = []
  if (taxi && taxi.total >= eur(PRICES.barcelona)) {
    const n = taxi.total / eur(PRICES.barcelona)
    comparisons.push({ emoji: '✈️', text: `На таксі — як ${times(n)} ${plural(Math.round(n), 'квиток', 'квитки', 'квитків')} до Барселони` })
  }
  if (delivery && delivery.total >= eur(PRICES.pizza) * 2) {
    const n = delivery.total / eur(PRICES.pizza)
    comparisons.push({ emoji: '🍕', text: `Доставка їжі — це ${times(n)} ${plural(Math.round(n), 'піца', 'піци', 'піц')}` })
  }
  if (coffee && coffee.total >= eur(PRICES.netflix)) {
    const n = coffee.total / eur(PRICES.netflix)
    comparisons.push({
      emoji: coffee.kind === 'coffee' ? '☕' : '🍽️',
      text: `${coffee.kind === 'coffee' ? 'Кава' : 'Кафе'} = ${times(n)} ${plural(Math.round(n), 'місяць', 'місяці', 'місяців')} Netflix`,
    })
  }
  // The biggest category you could have spent less on (not rent, bills or loans)
  const fun = [...cats.entries()].filter(([name]) => !FIXED.test(name)).sort((a, b) => b[1] - a[1])[0]
  if (fun && fun[1] >= eur(PRICES.cinema) * 5) {
    const n = fun[1] / eur(PRICES.cinema)
    comparisons.push({ emoji: '🎬', text: `«${fun[0]}» — як ${times(n)} ${plural(Math.round(n), 'похід', 'походи', 'походів')} у кіно` })
  }
  if (spent >= eur(PRICES.iphone)) {
    const n = spent / eur(PRICES.iphone)
    comparisons.push({ emoji: '📱', text: `Усі витрати — це ${times(n)} ${plural(Math.round(n), 'айфон', 'айфони', 'айфонів')}` })
  }

  return {
    year,
    currency,
    spent,
    earned,
    expenses: expenses.length,
    days,
    topMerchant,
    priciestDay,
    topCategory,
    coffee,
    taxi,
    delivery,
    biggest,
    busiestMonth,
    weekday,
    comparisons,
  }
}

/** The whole year as text (for «Поділитися») */
export function wrappedText(w: WrappedData): string {
  const money = (v: number) => formatMoney(v, w.currency, { hideCents: true })
  const lines = [
    `🎁 Мій ${w.year} у MyWallet`,
    `Витрачено ${money(w.spent)}, зароблено ${money(w.earned)}`,
    w.topMerchant && `Найчастіше: ${w.topMerchant.name} — ${w.topMerchant.count} разів`,
    w.priciestDay && `Найдорожчий день: ${w.priciestDay.date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })} — ${money(w.priciestDay.total)}`,
    w.coffee &&
      (w.coffee.kind === 'coffee'
        ? `☕ ${w.coffee.count} ${plural(w.coffee.count, 'кава', 'кави', 'кав')}`
        : `🍽️ ${w.coffee.count} ${plural(w.coffee.count, 'раз', 'рази', 'разів')} у кафе`),
    ...w.comparisons.map(c => `${c.emoji} ${c.text}`),
  ]
  return lines.filter(Boolean).join('\n')
}
