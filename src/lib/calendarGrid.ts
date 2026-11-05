import { addDays, endOfMonth, parseDate, startOfMonth, startOfWeek, type DateStr } from './dates'

export interface GridDay {
  date: DateStr
  /** day of month, for display */
  day: number
  /** false for the leading/trailing days that belong to the neighbouring months */
  inMonth: boolean
}

/** Weeks (arrays of 7 days) covering the month "yyyy-MM"; the week starts on Monday (1) or Sunday (0). 4 to 6 rows. */
export function monthGrid(month: string, weekStartsOn: 0 | 1 = 1): GridDay[][] {
  const first = startOfMonth(`${month}-01`)
  const last = endOfMonth(first)
  const weeks: GridDay[][] = []
  for (let start = startOfWeek(first, weekStartsOn); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i)
      return { date, day: parseDate(date).d, inMonth: date >= first && date <= last }
    }))
  }
  return weeks
}

/** Weekday headers in display order. */
export const weekdayLabels = (weekStartsOn: 0 | 1 = 1): string[] => {
  const all = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  return weekStartsOn === 1 ? [...all.slice(1), all[0] as string] : all
}
