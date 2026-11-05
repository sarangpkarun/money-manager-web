import { diffDays, type DateStr } from '@/lib/dates'
import { formatDisplayDate } from '@/lib/display'

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

/** "Today", "Yesterday", otherwise "Wed, 5 Nov" (year added when it is not the current year). */
export function dayLabel(date: DateStr, today: DateStr): string {
  const ago = diffDays(date, today)
  if (ago === 0) return 'Today'
  if (ago === 1) return 'Yesterday'
  return formatDisplayDate(date, { weekday: 'short', year: Number(date.slice(0, 4)) !== Number(today.slice(0, 4)) })
}

const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-11" -> "November 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-')
  return `${FULL_MONTHS[Number(m) - 1] ?? month} ${y}`
}

/** Moves a "yyyy-MM" month by n months. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const idx = y * 12 + (m - 1) + n
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}
