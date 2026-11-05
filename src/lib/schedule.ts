import { addDays, addMonths, parseDate, type DateStr } from './dates'
import { reducingRows } from './emi'
import { planInterest, type Period, type SimpleKind } from './interest'
import { assertPaise, type Paise } from './money'

/** One plan row; mirrors the `schedule_items` table. */
export interface ScheduleRow {
  seq: number
  due_date: DateStr
  due_paise: Paise
  principal_paise: Paise
  interest_paise: Paise
  paid_paise: Paise
  paid_on: DateStr | null
}

export interface ScheduleResult {
  rows: ScheduleRow[]
  total_payable_paise: Paise
  total_interest_paise: Paise
}

export type PlanInput =
  /** n equal rows; the last row absorbs rounding. interest: none | flat | simple (no_cost forces none). */
  | { mode: 'equal'; principal: Paise; count: number; firstDate: DateStr; period?: Period; interest?: SimpleKind; rateBps?: number; noCost?: boolean }
  /** Reducing-balance EMI (monthly). noCost: the seller absorbs interest, buyer repays principal only. */
  | { mode: 'reducing'; principal: Paise; count: number; firstDate: DateStr; rateBps: number; noCost?: boolean }
  /** Fixed instalment amount; the last row is the smaller remainder. */
  | { mode: 'installment'; principal: Paise; amount: Paise; firstDate: DateStr; period?: Period; interest?: SimpleKind; rateBps?: number }
  /** Caller-chosen dates (strictly increasing); interest none | flat only. */
  | { mode: 'custom'; principal: Paise; dates: DateStr[]; interest?: 'none' | 'flat'; rateBps?: number }

const MAX_ROWS = 1200

function checkCommon(principal: Paise, rateBps: number) {
  assertPaise(principal, 'principal')
  if (principal <= 0) throw new RangeError('principal must be positive')
  if (!Number.isInteger(rateBps) || rateBps < 0) throw new RangeError('rateBps must be a non-negative integer')
}

function checkCount(count: number) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_ROWS) throw new RangeError(`count must be 1..${MAX_ROWS}`)
}

export function dueDates(first: DateStr, count: number, period: Period): DateStr[] {
  const anchor = parseDate(first).d // keep the ORIGINAL day so month-ends never drift
  return Array.from({ length: count }, (_, i) =>
    period === 'weekly' ? addDays(first, 7 * i) : addMonths(first, i, anchor),
  )
}

/** n parts of `total`: the first n-1 are floor(total/n); the last takes the remainder. */
export function splitEqual(total: Paise, n: number): Paise[] {
  const base = Math.floor(total / n)
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - base * (n - 1) : base))
}

function finish(dates: DateStr[], parts: { due: Paise; principal: Paise; interest: Paise }[]): ScheduleResult {
  const rows: ScheduleRow[] = parts.map((p, i) => {
    if (p.due < 1 || p.principal < 0 || p.interest < 0)
      throw new RangeError('Amount is too small to split into this many instalments')
    return {
      seq: i + 1, due_date: dates[i] as DateStr, due_paise: p.due, principal_paise: p.principal,
      interest_paise: p.interest, paid_paise: 0, paid_on: null,
    }
  })
  return {
    rows,
    total_payable_paise: rows.reduce((s, r) => s + r.due_paise, 0),
    total_interest_paise: rows.reduce((s, r) => s + r.interest_paise, 0),
  }
}

/** Principal and interest are split independently (each: floor(x/n), last row takes the rest), so no part can go negative. */
function equalParts(principal: Paise, totalInterest: Paise, n: number) {
  const ps = splitEqual(principal, n)
  const is = splitEqual(totalInterest, n)
  return ps.map((p, i) => ({ principal: p, interest: is[i] as number, due: p + (is[i] as number) }))
}

export function buildSchedule(input: PlanInput): ScheduleResult {
  switch (input.mode) {
    case 'equal': {
      const { principal, count, firstDate, period = 'monthly', rateBps = 0 } = input
      checkCommon(principal, rateBps)
      checkCount(count)
      const kind: SimpleKind = input.noCost ? 'none' : (input.interest ?? 'none')
      const interest = planInterest(kind, principal, rateBps, count, period)
      return finish(dueDates(firstDate, count, period), equalParts(principal, interest, count))
    }
    case 'reducing': {
      const { principal, count, firstDate, rateBps } = input
      checkCommon(principal, rateBps)
      checkCount(count)
      const dates = dueDates(firstDate, count, 'monthly')
      if (input.noCost || rateBps === 0) return finish(dates, equalParts(principal, 0, count))
      return finish(dates, reducingRows(principal, rateBps, count))
    }
    case 'installment': {
      const { principal, amount, firstDate, period = 'monthly', rateBps = 0, interest: kind = 'none' } = input
      checkCommon(principal, rateBps)
      assertPaise(amount, 'amount')
      if (amount <= 0) throw new RangeError('amount must be positive')
      // Simple interest depends on the term, which depends on the amount: find the smallest consistent count.
      let count = Math.ceil(principal / amount)
      for (;;) {
        checkCount(count)
        const interest = planInterest(kind, principal, rateBps, count, period)
        if (count * amount >= principal + interest) {
          const parts = equalInstallmentParts(principal, interest, amount, count)
          return finish(dueDates(firstDate, count, period), parts)
        }
        count++
      }
    }
    case 'custom': {
      const { principal, dates, rateBps = 0, interest: kind = 'none' } = input
      checkCommon(principal, rateBps)
      checkCount(dates.length)
      dates.forEach((d, i) => {
        parseDate(d)
        if (i > 0 && d <= (dates[i - 1] as DateStr)) throw new RangeError('custom dates must be strictly increasing')
      })
      const interest = planInterest(kind, principal, rateBps, dates.length, 'monthly')
      return finish(dates, equalParts(principal, interest, dates.length))
    }
  }
}

/** Rows of exactly `amount`, the last row smaller; interest is spread evenly with the last row taking the remainder. */
function equalInstallmentParts(principal: Paise, totalInterest: Paise, amount: Paise, count: number) {
  const total = principal + totalInterest
  const baseInterest = Math.floor(totalInterest / count)
  let interestSoFar = 0
  return Array.from({ length: count }, (_, i) => {
    const due = i === count - 1 ? total - amount * (count - 1) : amount
    const interest = i === count - 1 ? totalInterest - interestSoFar : Math.min(due, baseInterest)
    interestSoFar += interest
    return { due, interest, principal: due - interest }
  })
}
