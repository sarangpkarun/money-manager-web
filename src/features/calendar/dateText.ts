import { dayOfWeek, parseDate, type DateStr } from '@/lib/dates'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "5 Nov" */
export function shortDate(date: DateStr): string {
  const { m, d } = parseDate(date)
  return `${d} ${MONTHS[m - 1]}`
}

/** "Thursday, 5 Nov 2026" (the day sheet title; never "Today", so it reads the same whenever it is opened). */
export function longDate(date: DateStr): string {
  const { y, m, d } = parseDate(date)
  return `${DAYS[dayOfWeek(date)]}, ${d} ${MONTHS[m - 1]} ${y}`
}
