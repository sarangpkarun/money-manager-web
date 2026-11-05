import { addDays, addMonths, diffDays, parseDate, type DateStr } from './dates'

export type RepeatUnit = 'day' | 'week' | 'month' | 'year'
export interface Repeat { n: number; unit: RepeatUnit }

const NAMED: Record<string, Repeat> = {
  daily: { n: 1, unit: 'day' }, weekly: { n: 1, unit: 'week' }, monthly: { n: 1, unit: 'month' }, yearly: { n: 1, unit: 'year' },
}

/** "daily" | "weekly" | "monthly" | "yearly" | "every N days|weeks|months|years" (any case, N 1..999); anything else is null. */
export function parseRepeat(rule: string | null | undefined): Repeat | null {
  const t = (rule ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!t) return null
  if (NAMED[t]) return NAMED[t]
  const m = /^every (?:(\d{1,3}) )?(day|week|month|year)s?$/.exec(t)
  if (!m) return null
  const n = m[1] === undefined ? 1 : Number(m[1])
  return n >= 1 ? { n, unit: m[2] as RepeatUnit } : null
}

/** The canonical rule text that is stored: 1 day -> "daily", 2 weeks -> "every 2 weeks". */
export function formatRepeat(r: Repeat): string {
  if (r.n === 1) return { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }[r.unit]
  return `every ${r.n} ${r.unit}s`
}

/** "Every day", "Every 2 weeks" for the UI; null for no/invalid rule. */
export function describeRepeat(rule: string | null | undefined): string | null {
  const r = parseRepeat(rule)
  if (!r) return null
  return r.n === 1 ? `Every ${r.unit}` : `Every ${r.n} ${r.unit}s`
}

/** i-th occurrence (0 = the start date). Months keep the ORIGINAL day, clamped to month end (31 Jan, 28 Feb, 31 Mar). */
function nth(start: DateStr, r: Repeat, i: number): DateStr {
  const anchor = parseDate(start).d
  switch (r.unit) {
    case 'day': return addDays(start, i * r.n)
    case 'week': return addDays(start, 7 * i * r.n)
    case 'month': return addMonths(start, i * r.n, anchor)
    case 'year': return addMonths(start, 12 * i * r.n, anchor)
  }
}

const STEP_DAYS: Record<RepeatUnit, number> = { day: 1, week: 7, month: 28, year: 365 } // lower bounds: used only to skip ahead

/** All occurrences of `rule` starting at `start` that fall in [from, to], oldest first (at most `cap`). No rule: just `start` if in range. */
export function occurrencesBetween(start: DateStr, rule: string | null | undefined, from: DateStr, to: DateStr, cap = 400): DateStr[] {
  const r = parseRepeat(rule)
  if (!r) return start >= from && start <= to ? [start] : []
  if (to < start) return []
  // jump close to `from` (a conservative lower bound), then walk
  let i = from > start ? Math.max(0, Math.floor(diffDays(start, from) / (STEP_DAYS[r.unit] * r.n)) - 1) : 0
  const out: DateStr[] = []
  for (let guard = 0; guard < 5000 && out.length < cap; guard++, i++) {
    const d = nth(start, r, i)
    if (d > to) break
    if (d >= from) out.push(d)
  }
  return out
}

/** The first occurrence strictly after `after` (default: the start date itself): where a ticked repeating task goes next. */
export function nextOccurrence(start: DateStr, rule: string | null | undefined, after: DateStr = start): DateStr | null {
  const r = parseRepeat(rule)
  if (!r) return null
  let i = Math.max(0, Math.floor(diffDays(start, after) / (STEP_DAYS[r.unit] * r.n)) - 1)
  for (let guard = 0; guard < 5000; guard++, i++) {
    const d = nth(start, r, i)
    if (d > after) return d
  }
  return null
}
