import { create } from 'zustand'
import { dayOfWeek, parseDate, type DateStr } from './dates'

/** How numbers and dates are shown (Settings, Display). Stored on the profile; one module-level default so every screen follows it. */
export type NumberFormat = 'indian' | 'western'
export type DateFormatId = 'dd MMM yyyy' | 'MMM dd, yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd'

export const NUMBER_FORMATS: { id: NumberFormat; label: string; sample: string }[] = [
  { id: 'indian', label: 'Indian', sample: '₹12,34,567' },
  { id: 'western', label: 'Western', sample: '₹1,234,567' },
]

export const DATE_FORMATS: { id: DateFormatId; label: string }[] = [
  { id: 'dd MMM yyyy', label: '5 Nov 2026' },
  { id: 'MMM dd, yyyy', label: 'Nov 5, 2026' },
  { id: 'dd/MM/yyyy', label: '05/11/2026' },
  { id: 'yyyy-MM-dd', label: '2026-11-05' },
]

export interface DisplaySettings { number: NumberFormat; date: DateFormatId }

const DEFAULTS: DisplaySettings = { number: 'indian', date: 'dd MMM yyyy' }
let current: DisplaySettings = { ...DEFAULTS }

export const isNumberFormat = (v: unknown): v is NumberFormat => v === 'indian' || v === 'western'
export const isDateFormat = (v: unknown): v is DateFormatId => DATE_FORMATS.some((f) => f.id === v)

/** Bumped whenever the settings change, so a component that subscribes re-renders everything below it. */
export const useDisplayVersion = create<{ version: number }>(() => ({ version: 0 }))

export const getDisplay = (): DisplaySettings => current

/** Applies new settings (unknown or missing values keep the current ones). Returns true if something changed. */
export function setDisplay(next: { number?: unknown; date?: unknown }): boolean {
  const merged: DisplaySettings = {
    number: isNumberFormat(next.number) ? next.number : current.number,
    date: isDateFormat(next.date) ? next.date : current.date,
  }
  if (merged.number === current.number && merged.date === current.date) return false
  current = merged
  useDisplayVersion.setState((s) => ({ version: s.version + 1 }))
  return true
}

export function resetDisplay(): void {
  current = { ...DEFAULTS }
  useDisplayVersion.setState((s) => ({ version: s.version + 1 }))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const pad = (n: number) => String(n).padStart(2, '0')

export interface DateOptions {
  /** include the year (default true) */
  year?: boolean
  /** prefix with the weekday ("Thu" or "Thursday") */
  weekday?: 'short' | 'long'
  /** override the user's format (tests, previews) */
  style?: DateFormatId
}

/** "yyyy-MM-dd" in the user's format: "5 Nov 2026", "Nov 5, 2026", "05/11/2026", "2026-11-05"; without the year "5 Nov", "Nov 5", "05/11", "11-05". */
export function formatDisplayDate(date: DateStr, opts: DateOptions = {}): string {
  const { year = true, weekday, style = current.date } = opts
  const { y, m, d } = parseDate(date)
  let body: string
  switch (style) {
    case 'MMM dd, yyyy': body = year ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${d}`; break
    case 'dd/MM/yyyy': body = year ? `${pad(d)}/${pad(m)}/${y}` : `${pad(d)}/${pad(m)}`; break
    case 'yyyy-MM-dd': body = year ? `${y}-${pad(m)}-${pad(d)}` : `${pad(m)}-${pad(d)}`; break
    default: body = year ? `${d} ${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`
  }
  if (!weekday) return body
  const name = DAYS[dayOfWeek(date)] as string
  return `${weekday === 'short' ? name.slice(0, 3) : name}, ${body}`
}
