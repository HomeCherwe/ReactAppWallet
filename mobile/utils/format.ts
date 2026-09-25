export function fmtAmount(amount: number, currency?: string): string {
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return currency ? `${formatted} ${currency}` : formatted
}

export function fmtDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function fmtDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
}

export function fmtDateHeader(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDate()
  const month = d.toLocaleDateString('uk-UA', { month: 'long' }).toUpperCase()
  const days = ['НЕДІЛЯ', 'ПОНЕДІЛОК', 'ВІВТОРОК', 'СЕРЕДА', 'ЧЕТВЕР', "П'ЯТНИЦЯ", 'СУБОТА']
  return `${day} ${month}, ${days[d.getDay()]}`
}

export function isToday(dateStr: string): boolean {
  return new Date().toDateString() === new Date(dateStr).toDateString()
}

export function isYesterday(dateStr: string): boolean {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return yesterday.toDateString() === new Date(dateStr).toDateString()
}
