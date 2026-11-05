import { addDays, addMonths, daysInMonth, parseDate, type DateStr } from './dates'
import { isPaid, outstanding, remaining } from './allocate'
import type { Period } from './interest'
import { assertPaise, type Paise } from './money'
import { splitEqual, type ScheduleRow } from './schedule'

/** Keeps interest as is (capped at the new due) and lets principal carry the change. Total due is what matters. */
const withDue = (r: ScheduleRow, due: Paise): ScheduleRow => {
  const interest = Math.min(r.interest_paise, due)
  return { ...r, due_paise: due, interest_paise: interest, principal_paise: due - interest }
}

/**
 * If every date sits on "day A, or the month end when the month is shorter", returns A. This lets a series that
 * started on the 31st survive a shift (… 28 Feb, 31 Mar …) instead of drifting to the 28th. Otherwise null.
 */
export function monthlyAnchor(rows: ScheduleRow[]): number | null {
  if (rows.length === 0) return null
  const days = rows.map((r) => parseDate(r.due_date))
  const anchor = Math.max(...days.map((d) => d.d))
  return days.every((d) => d.d === Math.min(anchor, daysInMonth(d.y, d.m))) ? anchor : null
}

/**
 * "Skip this month": the chosen row and every later unpaid row move one period later; amounts are unchanged, paid
 * rows stay. (A later row paid out of order may end up sharing a date with a shifted row; that is allowed.)
 */
export function skipPeriod(rows: ScheduleRow[], seq: number, period: Period = 'monthly'): ScheduleRow[] {
  const target = rows.find((r) => r.seq === seq)
  if (!target) throw new RangeError(`No row #${seq}`)
  if (isPaid(target)) throw new RangeError(`Row #${seq} is already paid`)
  const anchor = monthlyAnchor(rows)
  const shift = (d: DateStr) => (period === 'weekly' ? addDays(d, 7) : addMonths(d, 1, anchor ?? undefined))
  return rows.map((r) => (r.seq >= seq && !isPaid(r) ? { ...r, due_date: shift(r.due_date) } : r))
}

/**
 * Sets one row's amount and re-spreads the difference equally over the later unpaid rows (the last absorbs rounding).
 * Total payable is unchanged. The new amount must exceed what is already paid on that row.
 */
export function changeAmount(rows: ScheduleRow[], seq: number, newDue: Paise): ScheduleRow[] {
  assertPaise(newDue, 'amount')
  const target = rows.find((r) => r.seq === seq)
  if (!target) throw new RangeError(`No row #${seq}`)
  if (isPaid(target)) throw new RangeError(`Row #${seq} is already paid`)
  if (newDue <= target.paid_paise) throw new RangeError('New amount must be more than what is already paid on this row')

  const later = rows.filter((r) => r.seq > seq && !isPaid(r))
  const delta = target.due_paise - newDue
  if (later.length === 0) {
    if (delta !== 0) throw new RangeError('There are no later rows to absorb the difference')
    return rows
  }
  const pool = later.reduce((s, r) => s + remaining(r), 0) + delta
  if (pool < later.length) throw new RangeError('That amount leaves too little for the remaining rows')
  const shares = new Map(splitEqual(pool, later.length).map((share, i) => [(later[i] as ScheduleRow).seq, share]))
  return rows.map((r) => {
    if (r.seq === seq) return withDue(r, newDue)
    const share = shares.get(r.seq)
    return share === undefined ? r : withDue(r, r.paid_paise + share)
  })
}

export interface ExtraPaymentResult {
  rows: ScheduleRow[]
  /** Rows that disappeared because the extra payment covered them entirely. */
  removedSeqs: number[]
  /** Part-paid rows that the extra payment completed (their paid_on is set to `on`). */
  completedSeqs: number[]
}

/**
 * Extra payment: instead of lowering the next instalment, the amount is taken off the plan from the LAST row
 * backwards (shorter term). The cash movement itself is recorded as a payment with no schedule row.
 * `seq` numbers are kept (gaps are fine), so existing payments still point at the right rows.
 */
export function addExtraPayment(rows: ScheduleRow[], amount: Paise, on: DateStr): ExtraPaymentResult {
  assertPaise(amount, 'extra payment')
  if (amount <= 0) throw new RangeError('Extra payment must be positive')
  if (amount > outstanding(rows)) throw new RangeError('Extra payment exceeds the outstanding balance')

  const next = rows.map((r) => ({ ...r }))
  const removed = new Set<number>()
  const completedSeqs: number[] = []
  let left = amount
  for (let i = next.length - 1; i >= 0 && left > 0; i--) {
    const r = next[i] as ScheduleRow
    const room = remaining(r)
    if (room <= 0) continue
    const cut = Math.min(left, room)
    left -= cut
    const due = r.due_paise - cut
    const principal = Math.max(r.principal_paise - cut, 0) // principal shrinks first, then interest
    next[i] = { ...r, due_paise: due, principal_paise: principal, interest_paise: due - principal }
    if (due === r.paid_paise) {
      if (r.paid_paise === 0) removed.add(r.seq)
      else {
        next[i] = { ...(next[i] as ScheduleRow), paid_on: on }
        completedSeqs.push(r.seq)
      }
    }
  }
  return { rows: next.filter((r) => !removed.has(r.seq)), removedSeqs: [...removed].sort((a, b) => a - b), completedSeqs }
}
