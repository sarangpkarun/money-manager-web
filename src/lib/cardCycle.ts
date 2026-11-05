import { daysInMonth, diffDays, formatDate, parseDate, type DateStr } from './dates'

const clamp = (y: number, m: number, day: number): DateStr => formatDate(y, m, Math.min(day, daysInMonth(y, m)))

/** The next date (today included) on which `day` of the month falls; a 31st in a short month becomes its last day. */
export function nextDayOfMonth(day: number, today: DateStr): DateStr {
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new RangeError('day must be 1..31')
  const { y, m } = parseDate(today)
  const thisMonth = clamp(y, m, day)
  if (thisMonth >= today) return thisMonth
  return m === 12 ? clamp(y + 1, 1, day) : clamp(y, m + 1, day)
}

export interface CardDue { date: DateStr; days: number }

/** The card's next bill due date and how many days away it is; null when the card has no due day. */
export function nextCardDue(dueDay: number | null | undefined, today: DateStr): CardDue | null {
  if (!dueDay) return null
  const date = nextDayOfMonth(dueDay, today)
  return { date, days: diffDays(today, date) }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Bill due today", "Bill due 22 Nov (in 7 days)". */
export function cardDueText(due: CardDue): string {
  if (due.days === 0) return 'Bill due today'
  const { m, d } = parseDate(due.date)
  return `Bill due ${d} ${MONTHS[m - 1]} (in ${due.days} day${due.days === 1 ? '' : 's'})`
}
