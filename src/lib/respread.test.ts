import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { allocatePayment, outstanding } from './allocate'
import { addExtraPayment, changeAmount, monthlyAnchor, skipPeriod } from './respread'
import { buildSchedule, type ScheduleRow } from './schedule'

const plan = (principal: number, count: number, firstDate = '2026-01-10', period: 'monthly' | 'weekly' = 'monthly') =>
  buildSchedule({ mode: 'equal', principal, count, firstDate, period }).rows
const sumDue = (rows: ScheduleRow[]) => rows.reduce((s, r) => s + r.due_paise, 0)
const dueDates = (rows: ScheduleRow[]) => rows.map((r) => r.due_date)

describe('monthlyAnchor', () => {
  it('detects a series on day A (with month-end clamps)', () => {
    expect(monthlyAnchor(plan(400_000, 4, '2026-01-31'))).toBe(31)
    expect(monthlyAnchor(plan(300_000, 3, '2026-01-10'))).toBe(10)
  })
  it('is null for irregular custom dates and for no rows', () => {
    const custom = buildSchedule({ mode: 'custom', principal: 3000, dates: ['2026-01-05', '2026-02-20'] }).rows
    expect(monthlyAnchor(custom)).toBeNull()
    expect(monthlyAnchor([])).toBeNull()
  })
})

describe('skipPeriod', () => {
  it('moves the row and all later unpaid rows one month later, amounts unchanged', () => {
    const rows = plan(500_000, 5, '2026-01-10')
    const out = skipPeriod(rows, 3)
    expect(dueDates(out)).toEqual(['2026-01-10', '2026-02-10', '2026-04-10', '2026-05-10', '2026-06-10'])
    expect(out.map((r) => r.due_paise)).toEqual(rows.map((r) => r.due_paise))
  })
  it('does not move paid rows (even later ones paid out of order)', () => {
    const rows = allocatePayment(plan(500_000, 5, '2026-01-10'), 100_000, '2026-01-02', 4).rows
    const out = skipPeriod(rows, 2)
    expect(dueDates(out)).toEqual(['2026-01-10', '2026-03-10', '2026-04-10', '2026-04-10', '2026-06-10'])
    expect(out[3]?.paid_on).toBe('2026-01-02')
  })
  it('keeps the 31st: 28 Feb then 31 Mar, no drift', () => {
    const out = skipPeriod(plan(400_000, 4, '2026-01-31'), 2) // Jan31, Feb28, Mar31, Apr30
    expect(dueDates(out)).toEqual(['2026-01-31', '2026-03-31', '2026-04-30', '2026-05-31'])
  })
  it('weekly shifts by 7 days', () => {
    const out = skipPeriod(plan(200_000, 4, '2026-03-01', 'weekly'), 3, 'weekly')
    expect(dueDates(out)).toEqual(['2026-03-01', '2026-03-08', '2026-03-22', '2026-03-29'])
  })
  it('irregular custom dates shift by their own day', () => {
    const custom = buildSchedule({ mode: 'custom', principal: 3000, dates: ['2026-01-05', '2026-02-20'] }).rows
    expect(dueDates(skipPeriod(custom, 1))).toEqual(['2026-02-05', '2026-03-20'])
  })
  it('rejects unknown or paid rows', () => {
    const rows = allocatePayment(plan(100_000, 2), 50_000, '2026-01-01').rows
    expect(() => skipPeriod(rows, 9)).toThrow(/No row/)
    expect(() => skipPeriod(rows, 1)).toThrow(/already paid/)
  })
})

describe('changeAmount', () => {
  it('raising a row re-spreads the difference over later rows (last absorbs rounding)', () => {
    const out = changeAmount(plan(1_000_000, 5), 2, 300_000)
    expect(out.map((r) => r.due_paise)).toEqual([200_000, 300_000, 166_666, 166_666, 166_668])
    expect(sumDue(out)).toBe(1_000_000)
  })
  it('lowering a row pushes the difference onto later rows', () => {
    const out = changeAmount(plan(1_000_000, 5), 2, 100_000)
    expect(out.map((r) => r.due_paise)).toEqual([200_000, 100_000, 233_333, 233_333, 233_334])
  })
  it('later part-paid rows keep what they have paid', () => {
    const rows = allocatePayment(plan(1_000_000, 5), 50_000, '2026-01-01', 4).rows // row 4 has 50,000 paid
    const out = changeAmount(rows, 2, 300_000)
    expect(out[3]?.paid_paise).toBe(50_000)
    expect(sumDue(out)).toBe(1_000_000)
    expect(out[3]?.due_paise).toBeGreaterThan(50_000)
  })
  it('keeps principal + interest equal to the new due on every changed row', () => {
    const rows = buildSchedule({ mode: 'equal', principal: 1_000_000, count: 5, firstDate: '2026-01-01', interest: 'flat', rateBps: 1000 }).rows
    for (const r of changeAmount(rows, 2, 50_000)) expect(r.principal_paise + r.interest_paise).toBe(r.due_paise)
  })
  it('the last row can only change by zero (nothing later to absorb it)', () => {
    const rows = plan(300_000, 3)
    expect(() => changeAmount(rows, 3, 90_000)).toThrow(/no later rows/)
    expect(changeAmount(rows, 3, 100_000)).toEqual(rows)
  })
  it('rejects too-large amounts, amounts at or below paid, unknown and paid rows', () => {
    const rows = plan(300_000, 3)
    expect(() => changeAmount(rows, 1, 299_999)).toThrow(/too little/)
    expect(() => changeAmount(rows, 9, 1)).toThrow(/No row/)
    const part = allocatePayment(rows, 40_000, '2026-01-01').rows
    expect(() => changeAmount(part, 1, 40_000)).toThrow(/more than/)
    const done = allocatePayment(rows, 100_000, '2026-01-01').rows
    expect(() => changeAmount(done, 1, 50_000)).toThrow(/already paid/)
  })
  it('preserves total payable for any valid change', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100_000, max: 50_000_000 }), fc.integer({ min: 2, max: 24 }), fc.integer({ min: 1, max: 99 }), (principal, n, pct) => {
        const rows = plan(principal, n)
        const first = rows[0] as ScheduleRow
        const newDue = Math.max(1, Math.floor((first.due_paise * pct) / 50))
        try {
          const out = changeAmount(rows, 1, newDue)
          return sumDue(out) === sumDue(rows) && out.every((r) => r.due_paise >= 1)
        } catch (e) {
          return e instanceof RangeError
        }
      }),
    )
  })
})

describe('addExtraPayment', () => {
  it('shrinks from the last row backwards and drops fully covered rows', () => {
    const res = addExtraPayment(plan(1_000_000, 5), 250_000, '2026-02-01')
    expect(res.rows.map((r) => [r.seq, r.due_paise])).toEqual([[1, 200_000], [2, 200_000], [3, 200_000], [4, 150_000]])
    expect(res.removedSeqs).toEqual([5])
    expect(res.completedSeqs).toEqual([])
    expect(outstanding(res.rows)).toBe(750_000)
  })
  it('keeps seq numbers (gaps are fine) so payments still point at the right rows', () => {
    const res = addExtraPayment(plan(1_000_000, 5), 400_000, '2026-02-01')
    expect(res.rows.map((r) => r.seq)).toEqual([1, 2, 3])
  })
  it('a part-paid row that is fully covered becomes complete with paid_on', () => {
    const rows = allocatePayment(plan(1_000_000, 5), 50_000, '2026-01-02', 5).rows
    const res = addExtraPayment(rows, 150_000, '2026-02-01')
    const last = res.rows.at(-1) as ScheduleRow
    expect(last).toMatchObject({ seq: 5, due_paise: 50_000, paid_paise: 50_000, paid_on: '2026-02-01' })
    expect(res.completedSeqs).toEqual([5])
    expect(res.removedSeqs).toEqual([])
  })
  it('principal shrinks first, then interest', () => {
    const rows = buildSchedule({ mode: 'equal', principal: 1_000_000, count: 5, firstDate: '2026-01-01', interest: 'flat', rateBps: 1000 }).rows
    const res = addExtraPayment(rows, 210_000, '2026-02-01') // last row: due 220,000 = 200,000 principal + 20,000 interest
    const last = res.rows.at(-1) as ScheduleRow
    expect(last).toMatchObject({ due_paise: 10_000, principal_paise: 0, interest_paise: 10_000 })
  })
  it('can clear the whole plan', () => {
    const res = addExtraPayment(plan(300_000, 3), 300_000, '2026-02-01')
    expect(res.rows).toEqual([])
    expect(res.removedSeqs).toEqual([1, 2, 3])
  })
  it('skips already-paid rows and validates the amount', () => {
    const rows = allocatePayment(plan(300_000, 3), 100_000, '2026-01-01').rows
    expect(addExtraPayment(rows, 50_000, '2026-02-01').rows.map((r) => r.due_paise)).toEqual([100_000, 100_000, 50_000])
    expect(() => addExtraPayment(rows, 200_001, '2026-02-01')).toThrow(/exceeds/)
    expect(() => addExtraPayment(rows, 0, '2026-02-01')).toThrow(RangeError)
  })
  it('outstanding drops by exactly the extra amount', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100_000, max: 50_000_000 }), fc.integer({ min: 1, max: 24 }), fc.integer({ min: 1, max: 100 }), (principal, n, pct) => {
        const rows = plan(principal, n)
        const amount = Math.max(1, Math.floor((outstanding(rows) * pct) / 100))
        return outstanding(addExtraPayment(rows, amount, '2026-02-01').rows) === outstanding(rows) - amount
      }),
    )
  })
})
