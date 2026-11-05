import type { DateStr } from './dates'
import { isPaid, outstanding, remaining } from './allocate'
import { assertPaise, mulDiv, type Paise } from './money'
import { addExtraPayment } from './respread'
import type { ScheduleRow } from './schedule'

export interface ForecloseEstimate {
  mode: 'foreclose'
  /** Principal still owed (unpaid share of each open row's principal). */
  principalLeft: Paise
  /** Interest on rows already due by `today` that is still unpaid. */
  interestDue: Paise
  /** Optional foreclosure charge: feeBps % of principalLeft. */
  fee: Paise
  /** What to pay today to close the plan. */
  total: Paise
  /** Interest in future rows that would no longer be charged. */
  interestSaved: Paise
}

export interface PartPrepayEstimate {
  mode: 'part'
  amount: Paise
  rowsBefore: number
  rowsAfter: number
  removedSeqs: number[]
  newLastDue: DateStr | null
  interestSaved: Paise
}

const share = (part: Paise, r: ScheduleRow): Paise => (r.due_paise === 0 ? 0 : mulDiv(part, remaining(r), r.due_paise))

/**
 * Estimates only (no writes). Foreclose = unpaid principal + interest already due, plus an optional fee; interest
 * not yet due is waived. (Interest accruing inside the current, not-yet-due period is ignored: rows carry no
 * accrual dates, so lenders' own figures can differ slightly.) Part-prepay trims the plan from the last row.
 */
export function prepayEstimate(rows: ScheduleRow[], today: DateStr, opts: { mode: 'foreclose'; feeBps?: number }): ForecloseEstimate
export function prepayEstimate(rows: ScheduleRow[], today: DateStr, opts: { mode: 'part'; amount: Paise }): PartPrepayEstimate
export function prepayEstimate(
  rows: ScheduleRow[], today: DateStr, opts: { mode: 'foreclose'; feeBps?: number } | { mode: 'part'; amount: Paise },
): ForecloseEstimate | PartPrepayEstimate {
  const open = rows.filter((r) => !isPaid(r))
  if (opts.mode === 'foreclose') {
    const feeBps = opts.feeBps ?? 0
    if (!Number.isInteger(feeBps) || feeBps < 0) throw new RangeError('feeBps must be a non-negative integer')
    const principalLeft = open.reduce((s, r) => s + share(r.principal_paise, r), 0)
    const interestDue = open.filter((r) => r.due_date <= today).reduce((s, r) => s + share(r.interest_paise, r), 0)
    const interestSaved = open.filter((r) => r.due_date > today).reduce((s, r) => s + share(r.interest_paise, r), 0)
    const fee = mulDiv(principalLeft, feeBps, 10_000)
    // Rounding the shares can drift by paise; never ask for less principal+interest than the plan's own balance allows.
    const total = Math.min(principalLeft + interestDue + fee, outstanding(rows) + fee)
    return { mode: 'foreclose', principalLeft, interestDue, fee, total, interestSaved }
  }
  assertPaise(opts.amount, 'amount')
  const res = addExtraPayment(rows, opts.amount, today)
  const interest = (rs: ScheduleRow[]) => rs.reduce((s, r) => s + r.interest_paise, 0)
  return {
    mode: 'part', amount: opts.amount, rowsBefore: open.length,
    rowsAfter: res.rows.filter((r) => !isPaid(r)).length, removedSeqs: res.removedSeqs,
    newLastDue: res.rows.length ? (res.rows[res.rows.length - 1] as ScheduleRow).due_date : null,
    interestSaved: interest(rows) - interest(res.rows),
  }
}
