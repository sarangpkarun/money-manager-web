import type { DateStr } from './dates'

/** Today's calendar date ('yyyy-MM-dd') in an IANA timezone. Business dates never use the device's UTC date. */
export function todayIn(timeZone: string, now: Date = new Date()): DateStr {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  } catch {
    return now.toISOString().slice(0, 10) // unknown timezone: fall back to UTC
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
