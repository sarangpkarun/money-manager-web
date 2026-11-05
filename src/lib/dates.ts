/**
 * Calendar-date arithmetic on 'yyyy-MM-dd' strings. No `Date`, no timezones: matches the Postgres `date` type.
 * Day numbers use the proleptic Gregorian civil-calendar algorithm (days since 1970-01-01).
 */
export type DateStr = string

const RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeap(year) ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

export function isValidDate(s: string): boolean {
  const m = RE.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo)
}

export function parseDate(s: DateStr): { y: number; m: number; d: number } {
  const m = RE.exec(s)
  if (!m || !isValidDate(s)) throw new RangeError(`Invalid date: ${s}`)
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

const pad = (n: number, w: number) => String(n).padStart(w, '0')
export const formatDate = (y: number, m: number, d: number): DateStr => `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`

/** Days since 1970-01-01. */
export function toDayNumber(s: DateStr): number {
  const { y: y0, m, d } = parseDate(s)
  const y = m <= 2 ? y0 - 1 : y0
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

export function fromDayNumber(n: number): DateStr {
  const z = n + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0)
  return formatDate(y, m, d)
}

export const addDays = (s: DateStr, n: number): DateStr => fromDayNumber(toDayNumber(s) + n)
export const addWeeks = (s: DateStr, n: number): DateStr => addDays(s, n * 7)

/**
 * Adds whole months, clamping to month end. `anchorDay` is the intended day of month (defaults to the
 * date's own day); pass the ORIGINAL day when stepping a series so 31 Jan -> 28 Feb -> 31 Mar (no drift).
 */
export function addMonths(s: DateStr, n: number, anchorDay?: number): DateStr {
  const { y, m, d } = parseDate(s)
  const idx = y * 12 + (m - 1) + n
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12 + 12) % 12 + 1
  return formatDate(ny, nm, Math.min(anchorDay ?? d, daysInMonth(ny, nm)))
}

/** b - a in whole days (positive when b is later). */
export const diffDays = (a: DateStr, b: DateStr): number => toDayNumber(b) - toDayNumber(a)

export const compareDates = (a: DateStr, b: DateStr): number => (a < b ? -1 : a > b ? 1 : 0)

/** 0 = Sunday … 6 = Saturday. */
export const dayOfWeek = (s: DateStr): number => (((toDayNumber(s) + 4) % 7) + 7) % 7 // 1970-01-01 was a Thursday

/** First day of the week containing `s`; weekStartsOn: 0 = Sunday, 1 = Monday. */
export function startOfWeek(s: DateStr, weekStartsOn: 0 | 1 = 1): DateStr {
  return addDays(s, -((dayOfWeek(s) - weekStartsOn + 7) % 7))
}

export const startOfMonth = (s: DateStr): DateStr => {
  const { y, m } = parseDate(s)
  return formatDate(y, m, 1)
}

export const endOfMonth = (s: DateStr): DateStr => {
  const { y, m } = parseDate(s)
  return formatDate(y, m, daysInMonth(y, m))
}
