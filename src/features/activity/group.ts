import { dayOfWeek, diffDays, parseDate, type DateStr } from '@/lib/dates'

export interface TxnLike {
  id: string
  kind: string
  amount_paise: number
  for_other_paise: number
  date: DateStr
}

export interface DayGroup<T extends TxnLike> {
  date: DateStr
  /** Personal spend that day (amount minus the part paid for others). */
  spent: number
  received: number
  rows: T[]
}

/** Groups rows (already sorted newest first) by day, preserving order, with per-day totals. */
export function groupByDay<T extends TxnLike>(rows: T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const r of rows) {
    let g = groups[groups.length - 1]
    if (!g || g.date !== r.date) {
      g = { date: r.date, spent: 0, received: 0, rows: [] }
      groups.push(g)
    }
    if (r.kind === 'expense') g.spent += r.amount_paise - r.for_other_paise
    else if (r.kind === 'income') g.received += r.amount_paise
    g.rows.push(r)
  }
  return groups
}

export type ListItem<T extends TxnLike> =
  | { type: 'header'; key: string; date: DateStr; spent: number; received: number }
  | { type: 'txn'; key: string; row: T }

/** Flat list for the virtualiser: a header row, then that day's transactions. */
export function flattenGroups<T extends TxnLike>(groups: DayGroup<T>[]): ListItem<T>[] {
  return groups.flatMap((g) => [
    { type: 'header' as const, key: `h-${g.date}`, date: g.date, spent: g.spent, received: g.received },
    ...g.rows.map((row) => ({ type: 'txn' as const, key: row.id, row })),
  ])
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Today", "Yesterday", otherwise "Wed, 5 Nov" (year added when it is not the current year). */
export function dayLabel(date: DateStr, today: DateStr): string {
  const ago = diffDays(date, today)
  if (ago === 0) return 'Today'
  if (ago === 1) return 'Yesterday'
  const { y, m, d } = parseDate(date)
  const base = `${DAYS[dayOfWeek(date)]}, ${d} ${MONTHS[m - 1]}`
  return y === Number(today.slice(0, 4)) ? base : `${base} ${y}`
}
