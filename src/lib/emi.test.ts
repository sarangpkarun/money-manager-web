import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { financedAmount, noCostEmi, reducingEmi, reducingRows } from './emi'

describe('financedAmount', () => {
  it('price minus down payment', () => expect(financedAmount(6_000_000, 600_000)).toBe(5_400_000))
  it('rejects a down payment >= price or negative', () => {
    expect(() => financedAmount(100, 100)).toThrow(RangeError)
    expect(() => financedAmount(100, -1)).toThrow(RangeError)
    expect(() => financedAmount(100.5, 0)).toThrow(RangeError)
  })
})

describe('reducingEmi', () => {
  it('matches the textbook figure: ₹1,00,000 @12% for 12 months = ₹8,884.88', () => {
    expect(reducingEmi(10_000_000, 1200, 12)).toBe(888_488)
  })
  it('another known figure: ₹5,00,000 @10% for 60 months = ₹10,623.52', () => {
    expect(reducingEmi(50_000_000, 1000, 60)).toBe(1_062_352)
  })
  it('zero rate is an equal split', () => expect(reducingEmi(1_200_000, 0, 12)).toBe(100_000))
  it('validates input', () => {
    expect(() => reducingEmi(100, 1200, 0)).toThrow(RangeError)
    expect(() => reducingEmi(100, -1, 6)).toThrow(RangeError)
    expect(() => reducingEmi(100.5, 1200, 6)).toThrow(RangeError)
  })
})

describe('reducingRows', () => {
  const rows = reducingRows(10_000_000, 1200, 12)
  it('first row interest is balance x monthly rate', () => {
    expect(rows[0]).toEqual({ due: 888_488, principal: 788_488, interest: 100_000 })
  })
  it('principal sums to the amount borrowed and the last row clears the balance', () => {
    expect(rows).toHaveLength(12)
    expect(rows.reduce((s, r) => s + r.principal, 0)).toBe(10_000_000)
    expect(rows.every((r) => r.due === r.principal + r.interest)).toBe(true)
  })
  it('total interest is within paise rounding of 12*EMI - principal', () => {
    const interest = rows.reduce((s, r) => s + r.interest, 0)
    expect(Math.abs(interest - (12 * 888_488 - 10_000_000))).toBeLessThanOrEqual(12)
  })
  it('works for a single month and a zero rate', () => {
    expect(reducingRows(100_000, 1200, 1)).toEqual([{ due: 101_000, principal: 100_000, interest: 1000 }])
    expect(reducingRows(1_000, 0, 4).map((r) => r.due)).toEqual([250, 250, 250, 250])
  })
  it('invariants hold for arbitrary inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100_000, max: 5_000_000_000 }),
        fc.integer({ min: 1, max: 4000 }),
        fc.integer({ min: 1, max: 360 }),
        (p, rate, n) => {
          const r = reducingRows(p, rate, n)
          return (
            r.length === n &&
            r.reduce((s, x) => s + x.principal, 0) === p &&
            r.every((x) => x.principal >= 0 && x.interest >= 0 && x.due === x.principal + x.interest)
          )
        },
      ),
    )
  })
})

describe('noCostEmi', () => {
  it('buyer repays the financed amount only', () => expect(noCostEmi(5_400_000, 9)).toBe(600_000))
  it('floors; the schedule builder gives the remainder to the last row', () => expect(noCostEmi(1_000_000, 3)).toBe(333_333))
  it('validates months', () => {
    expect(() => noCostEmi(100, 0)).toThrow(RangeError)
    expect(() => noCostEmi(100.5, 3)).toThrow(RangeError)
  })
})
