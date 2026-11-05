import type { DateStr } from './dates'
import { assertPaise, type Paise } from './money'
import type { ScheduleRow } from './schedule'

/** How a payment was spread over rows. Persisted as one `payments` row per part. */
export interface AllocationPart {
  seq: number
  amount: Paise
  completed: boolean
}

export interface AllocateResult {
  rows: ScheduleRow[]
  parts: AllocationPart[]
}

export const remaining = (r: ScheduleRow): Paise => r.due_paise - r.paid_paise
export const isPaid = (r: ScheduleRow): boolean => r.paid_paise >= r.due_paise
export const outstanding = (rows: ScheduleRow[]): Paise => rows.reduce((s, r) => s + Math.max(remaining(r), 0), 0)
export const totalPaid = (rows: ScheduleRow[]): Paise => rows.reduce((s, r) => s + r.paid_paise, 0)
export const nextUnpaid = (rows: ScheduleRow[]): ScheduleRow | undefined => rows.find((r) => !isPaid(r))

/**
 * Applies a payment. With `targetSeq` it goes to that row first; any excess (or everything, if no target) flows to the
 * earliest unpaid rows. Paying rows in any order is allowed. Overpayment is rejected. A row's `paid_on` is set when it
 * becomes fully paid. Pure: returns new rows.
 */
export function allocatePayment(rows: ScheduleRow[], amount: Paise, paidOn: DateStr, targetSeq?: number): AllocateResult {
  assertPaise(amount, 'payment')
  if (amount <= 0) throw new RangeError('Payment must be positive')
  if (amount > outstanding(rows)) throw new RangeError('Payment exceeds the outstanding balance')
  if (targetSeq !== undefined) {
    const t = rows.find((r) => r.seq === targetSeq)
    if (!t) throw new RangeError(`No row #${targetSeq}`)
    if (isPaid(t)) throw new RangeError(`Row #${targetSeq} is already paid`)
  }

  const order = [
    ...rows.filter((r) => r.seq === targetSeq),
    ...rows.filter((r) => r.seq !== targetSeq && !isPaid(r)),
  ]
  const next = new Map(rows.map((r) => [r.seq, { ...r }]))
  const parts: AllocationPart[] = []
  let left = amount
  for (const o of order) {
    if (left === 0) break
    const row = next.get(o.seq) as ScheduleRow
    const take = Math.min(left, remaining(row))
    row.paid_paise += take
    const completed = isPaid(row)
    if (completed) row.paid_on = paidOn
    parts.push({ seq: row.seq, amount: take, completed })
    left -= take
  }
  return { rows: rows.map((r) => next.get(r.seq) as ScheduleRow), parts }
}

/** Reverses a payment given the parts it produced. A row that is no longer fully paid loses its `paid_on`. */
export function undoPayment(rows: ScheduleRow[], parts: AllocationPart[]): ScheduleRow[] {
  const byseq = new Map(parts.map((p) => [p.seq, p.amount]))
  return rows.map((r) => {
    const amt = byseq.get(r.seq)
    if (amt === undefined) return r
    if (amt > r.paid_paise) throw new RangeError(`Cannot undo ${amt} from row #${r.seq}: only ${r.paid_paise} paid`)
    const paid = r.paid_paise - amt
    return { ...r, paid_paise: paid, paid_on: paid >= r.due_paise ? r.paid_on : null }
  })
}
