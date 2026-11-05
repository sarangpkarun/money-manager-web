import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isValidDate } from './dates'
import { financedAmount } from './emi'
import { buildSchedule, dueDates, splitEqual, type PlanInput } from './schedule'

const dues = (i: PlanInput) => buildSchedule(i).rows.map((r) => r.due_paise)
const dates = (i: PlanInput) => buildSchedule(i).rows.map((r) => r.due_date)

describe('splitEqual', () => {
  it('last part takes the remainder', () => {
    expect(splitEqual(1_000_000, 3)).toEqual([333_333, 333_333, 333_334])
    expect(splitEqual(10, 5)).toEqual([2, 2, 2, 2, 2])
    expect(splitEqual(7, 1)).toEqual([7])
  })
})

describe('dueDates', () => {
  it('monthly keeps the original day and clamps to month end without drift', () => {
    expect(dueDates('2026-01-31', 4, 'monthly')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
    expect(dueDates('2024-01-31', 2, 'monthly')).toEqual(['2024-01-31', '2024-02-29'])
  })
  it('weekly is 7 days apart', () => {
    expect(dueDates('2026-03-01', 4, 'weekly')).toEqual(['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22'])
  })
})

describe('equal mode', () => {
  it('₹50,000 in 10 monthly instalments from 5 Dec (scenario B shape)', () => {
    const input: PlanInput = { mode: 'equal', principal: 5_000_000, count: 10, firstDate: '2026-12-05' }
    expect(dues(input)).toEqual(Array(10).fill(500_000))
    expect(dates(input)[0]).toBe('2026-12-05')
    expect(dates(input)[1]).toBe('2027-01-05')
    expect(dates(input)[9]).toBe('2027-09-05')
  })
  it('weekly 4 x ₹500 from ₹2,000, 7 days apart (scenario D shape)', () => {
    const input: PlanInput = { mode: 'equal', principal: 200_000, count: 4, firstDate: '2026-03-01', period: 'weekly' }
    expect(dues(input)).toEqual([50_000, 50_000, 50_000, 50_000])
    expect(dates(input)).toEqual(['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22'])
  })
  it('last row absorbs rounding', () => {
    expect(dues({ mode: 'equal', principal: 1_000_000, count: 3, firstDate: '2026-01-10' })).toEqual([333_333, 333_333, 333_334])
  })
  it('flat interest: ₹10,000 at 10% flat over 5 rows', () => {
    const r = buildSchedule({ mode: 'equal', principal: 1_000_000, count: 5, firstDate: '2026-01-01', interest: 'flat', rateBps: 1000 })
    expect(r.total_payable_paise).toBe(1_100_000)
    expect(r.total_interest_paise).toBe(100_000)
    expect(r.rows.map((x) => [x.due_paise, x.interest_paise, x.principal_paise])).toEqual(
      Array(5).fill([220_000, 20_000, 200_000]),
    )
  })
  it('simple interest: ₹12,000 at 12% p.a. over 12 months', () => {
    const r = buildSchedule({ mode: 'equal', principal: 1_200_000, count: 12, firstDate: '2026-01-01', interest: 'simple', rateBps: 1200 })
    expect(r.total_interest_paise).toBe(144_000)
    expect(r.rows[0]).toMatchObject({ due_paise: 112_000, interest_paise: 12_000, principal_paise: 100_000 })
  })
  it('weekly simple interest uses weeks/52', () => {
    const r = buildSchedule({ mode: 'equal', principal: 520_000, count: 52, firstDate: '2026-01-01', period: 'weekly', interest: 'simple', rateBps: 1000 })
    expect(r.total_interest_paise).toBe(52_000)
  })
  it('no-cost forces zero interest even with a rate', () => {
    const r = buildSchedule({ mode: 'equal', principal: 900_000, count: 9, firstDate: '2026-01-01', interest: 'flat', rateBps: 2000, noCost: true })
    expect(r.total_interest_paise).toBe(0)
    expect(r.total_payable_paise).toBe(900_000)
  })
  it('new rows start unpaid', () => {
    expect(buildSchedule({ mode: 'equal', principal: 1000, count: 1, firstDate: '2026-01-01' }).rows[0]).toEqual({
      seq: 1, due_date: '2026-01-01', due_paise: 1000, principal_paise: 1000, interest_paise: 0, paid_paise: 0, paid_on: null,
    })
  })
})

describe('reducing mode', () => {
  it('₹1,00,000 at 12% over 12 months', () => {
    const r = buildSchedule({ mode: 'reducing', principal: 10_000_000, count: 12, firstDate: '2026-01-15', rateBps: 1200 })
    expect(r.rows[0]).toMatchObject({ due_paise: 888_488, interest_paise: 100_000 })
    expect(r.rows.reduce((s, x) => s + x.principal_paise, 0)).toBe(10_000_000)
    expect(r.total_payable_paise).toBe(10_000_000 + r.total_interest_paise)
  })
  it('no-cost and zero-rate reduce to an equal split with no interest', () => {
    for (const extra of [{ noCost: true }, { rateBps: 0 }]) {
      const r = buildSchedule({ mode: 'reducing', principal: 900_000, count: 9, firstDate: '2026-01-01', rateBps: 1200, ...extra })
      expect(r.total_interest_paise).toBe(0)
      expect(r.rows).toHaveLength(9)
    }
  })
})

describe('scenario C: store EMI, no-cost', () => {
  const financed = financedAmount(6_000_000, 600_000)
  const r = buildSchedule({ mode: 'reducing', principal: financed, count: 9, firstDate: '2026-12-10', rateBps: 1500, noCost: true })
  it('9 rows of ₹6,000, zero interest for you, dates 10th of each month', () => {
    expect(r.rows.map((x) => x.due_paise)).toEqual(Array(9).fill(600_000))
    expect(r.total_interest_paise).toBe(0)
    expect(r.rows.map((x) => x.due_date)).toEqual([
      '2026-12-10', '2027-01-10', '2027-02-10', '2027-03-10', '2027-04-10', '2027-05-10', '2027-06-10', '2027-07-10', '2027-08-10',
    ])
  })
  it('a non-divisible price gives the remainder to the last row', () => {
    const odd = buildSchedule({ mode: 'reducing', principal: 5_400_001, count: 9, firstDate: '2026-12-10', rateBps: 0, noCost: true })
    expect(odd.rows.slice(0, 8).every((x) => x.due_paise === 600_000)).toBe(true)
    expect(odd.rows[8]?.due_paise).toBe(600_001)
  })
  it('month-end dates are clamped (first EMI on the 31st)', () => {
    expect(dates({ mode: 'reducing', principal: 900_000, count: 5, firstDate: '2026-10-31', rateBps: 0 })).toEqual([
      '2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28',
    ])
  })
})

describe('installment mode', () => {
  it('fixed amount with a smaller last row', () => {
    expect(dues({ mode: 'installment', principal: 1_200_000, amount: 500_000, firstDate: '2026-01-01' })).toEqual([500_000, 500_000, 200_000])
  })
  it('exact multiples have no short row', () => {
    expect(dues({ mode: 'installment', principal: 1_000_000, amount: 500_000, firstDate: '2026-01-01' })).toEqual([500_000, 500_000])
  })
  it('flat interest increases the row count when needed', () => {
    const r = buildSchedule({ mode: 'installment', principal: 1_000_000, amount: 500_000, firstDate: '2026-01-01', interest: 'flat', rateBps: 1000 })
    expect(r.rows.map((x) => x.due_paise)).toEqual([500_000, 500_000, 100_000])
    expect(r.rows.map((x) => x.principal_paise)).toEqual([466_667, 466_667, 66_666])
    expect(r.total_interest_paise).toBe(100_000)
  })
  it('simple interest finds a consistent term', () => {
    const r = buildSchedule({ mode: 'installment', principal: 1_200_000, amount: 120_000, firstDate: '2026-01-01', interest: 'simple', rateBps: 1200 })
    const n = r.rows.length
    expect(r.total_payable_paise).toBe(1_200_000 + r.total_interest_paise)
    expect(n * 120_000).toBeGreaterThanOrEqual(r.total_payable_paise)
    expect((n - 1) * 120_000).toBeLessThan(r.total_payable_paise)
  })
  it('gives up when the amount cannot even cover the interest', () => {
    expect(() => buildSchedule({ mode: 'installment', principal: 1_000_000, amount: 1, firstDate: '2026-01-01' })).toThrow(RangeError)
  })
  it('rejects a non-positive amount', () => {
    expect(() => buildSchedule({ mode: 'installment', principal: 1000, amount: 0, firstDate: '2026-01-01' })).toThrow(RangeError)
  })
})

describe('custom mode', () => {
  it('uses the given dates', () => {
    const d = ['2026-01-05', '2026-02-20', '2026-06-01']
    const r = buildSchedule({ mode: 'custom', principal: 1_000_000, dates: d })
    expect(r.rows.map((x) => x.due_date)).toEqual(d)
    expect(r.rows.map((x) => x.due_paise)).toEqual([333_333, 333_333, 333_334])
  })
  it('supports flat interest', () => {
    const r = buildSchedule({ mode: 'custom', principal: 1_000_000, dates: ['2026-01-05', '2026-02-05'], interest: 'flat', rateBps: 1000 })
    expect(r.total_payable_paise).toBe(1_100_000)
  })
  it('rejects unordered, duplicate, invalid or empty dates', () => {
    expect(() => buildSchedule({ mode: 'custom', principal: 1000, dates: ['2026-02-01', '2026-01-01'] })).toThrow(RangeError)
    expect(() => buildSchedule({ mode: 'custom', principal: 1000, dates: ['2026-02-01', '2026-02-01'] })).toThrow(RangeError)
    expect(() => buildSchedule({ mode: 'custom', principal: 1000, dates: ['2026-02-30'] })).toThrow(RangeError)
    expect(() => buildSchedule({ mode: 'custom', principal: 1000, dates: [] })).toThrow(RangeError)
  })
})

describe('validation', () => {
  it('rejects bad principal, count and rate', () => {
    const ok = { mode: 'equal', firstDate: '2026-01-01' } as const
    expect(() => buildSchedule({ ...ok, principal: 0, count: 3 })).toThrow(RangeError)
    expect(() => buildSchedule({ ...ok, principal: 10.5, count: 3 })).toThrow(RangeError)
    expect(() => buildSchedule({ ...ok, principal: 1000, count: 0 })).toThrow(RangeError)
    expect(() => buildSchedule({ ...ok, principal: 1000, count: 1201 })).toThrow(RangeError)
    expect(() => buildSchedule({ ...ok, principal: 1000, count: 3, interest: 'flat', rateBps: -1 })).toThrow(RangeError)
  })
  it('a tiny amount with interest still splits (principal and interest are split independently)', () => {
    const r = buildSchedule({ mode: 'equal', principal: 1000, count: 54, firstDate: '2026-01-01', interest: 'simple', rateBps: 657 })
    expect(r.rows.reduce((s, x) => s + x.principal_paise, 0)).toBe(1000)
    expect(r.rows.every((x) => x.principal_paise >= 0 && x.interest_paise >= 0)).toBe(true)
  })
  it('refuses an amount too small to split (every row must be at least 1 paise)', () => {
    expect(() => buildSchedule({ mode: 'equal', principal: 3, count: 10, firstDate: '2026-01-01' })).toThrow(/too small/)
  })
})

describe('properties', () => {
  const kind = fc.constantFrom<'none' | 'flat' | 'simple'>('none', 'flat', 'simple')
  it('equal plans: rows sum to total, parts add up, dates increase and are valid', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000, max: 2_000_000_000 }), fc.integer({ min: 1, max: 120 }), kind,
        fc.integer({ min: 0, max: 5000 }), fc.constantFrom<'monthly' | 'weekly'>('monthly', 'weekly'),
        fc.integer({ min: 1, max: 31 }),
        (principal, count, interest, rateBps, period, day) => {
          const first = `2026-01-${String(day).padStart(2, '0')}`
          const r = buildSchedule({ mode: 'equal', principal, count, firstDate: first, interest, rateBps, period })
          const sum = (f: (x: (typeof r.rows)[number]) => number) => r.rows.reduce((s, x) => s + f(x), 0)
          return (
            r.rows.length === count &&
            sum((x) => x.due_paise) === r.total_payable_paise &&
            sum((x) => x.principal_paise) === principal &&
            sum((x) => x.interest_paise) === r.total_interest_paise &&
            r.rows.every((x, i) => x.seq === i + 1 && x.due_paise >= 1 && x.due_paise === x.principal_paise + x.interest_paise) &&
            r.rows.every((x, i) => isValidDate(x.due_date) && (i === 0 || x.due_date > (r.rows[i - 1]?.due_date ?? ''))) &&
            r.rows.slice(0, -1).every((x) => x.due_paise === r.rows[0]?.due_paise)
          )
        },
      ),
    )
  })
  it('installment plans cover the total exactly with a last row in 1..amount', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10_000, max: 500_000_000 }), fc.integer({ min: 1, max: 1000 }), (principal, rows) => {
        const amount = Math.ceil(principal / rows)
        const r = buildSchedule({ mode: 'installment', principal, amount, firstDate: '2026-01-31' })
        const last = r.rows.at(-1)?.due_paise ?? 0
        return r.total_payable_paise === principal && last >= 1 && last <= amount
      }),
    )
  })
})
