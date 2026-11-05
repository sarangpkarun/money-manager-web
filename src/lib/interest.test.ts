import { describe, expect, it } from 'vitest'
import { entryInterest, flatInterest, interestToDate, planInterest, simpleInterestForDays, simpleInterestForTerm } from './interest'

describe('interest', () => {
  it('flat is a one-time percentage of principal', () => {
    expect(flatInterest(1_000_000, 1000)).toBe(100_000) // 10% of ₹10,000 = ₹1,000
    expect(flatInterest(333, 1250)).toBe(42) // 41.625 -> 42
  })
  it('simple accrues by days/365', () => {
    expect(simpleInterestForDays(1_000_000, 1200, 73)).toBe(24_000) // 12% p.a. for 73/365 of a year
    expect(simpleInterestForDays(1_000_000, 1200, 0)).toBe(0)
    expect(simpleInterestForDays(1_000_000, 1200, -5)).toBe(0)
  })
  it('simple over a plan term uses months/12 or weeks/52', () => {
    expect(simpleInterestForTerm(1_200_000, 1200, 12, 'monthly')).toBe(144_000)
    expect(simpleInterestForTerm(1_200_000, 1200, 6, 'monthly')).toBe(72_000)
    expect(simpleInterestForTerm(520_000, 1000, 52, 'weekly')).toBe(52_000)
  })
  it('planInterest dispatches by kind and treats a zero rate as none', () => {
    expect(planInterest('none', 1_000_000, 1000, 5, 'monthly')).toBe(0)
    expect(planInterest('flat', 1_000_000, 0, 5, 'monthly')).toBe(0)
    expect(planInterest('flat', 1_000_000, 1000, 5, 'monthly')).toBe(100_000)
    expect(planInterest('simple', 1_200_000, 1200, 12, 'monthly')).toBe(144_000)
  })
  it('interestToDate: none=0, flat=fixed, simple accrues; never negative before start', () => {
    const base = { principal: 1_000_000, rateBps: 1200, startDate: '2026-01-01' }
    expect(interestToDate({ ...base, interest: 'none' }, '2026-06-01')).toBe(0)
    expect(interestToDate({ ...base, interest: 'flat' }, '2026-06-01')).toBe(120_000)
    expect(interestToDate({ ...base, interest: 'simple' }, '2026-03-15')).toBe(24_000) // 73 days
    expect(interestToDate({ ...base, interest: 'simple' }, '2025-12-01')).toBe(0)
    expect(interestToDate({ ...base, interest: 'simple', rateBps: 0 }, '2026-03-15')).toBe(0)
  })
})

describe('entryInterest (mirrors create_entry)', () => {
  const base = { principal: 1_000_000, rateBps: 1200, startDate: '2026-01-01' }
  it('none and zero rate are free', () => {
    expect(entryInterest({ ...base, interest: 'none', dueDate: null })).toBe(0)
    expect(entryInterest({ ...base, interest: 'flat', rateBps: 0, dueDate: null })).toBe(0)
  })
  it('flat is a one-time percentage, with or without a due date', () => {
    expect(entryInterest({ ...base, rateBps: 1000, interest: 'flat', dueDate: null })).toBe(100_000)
  })
  it('simple is principal × rate × days / 365 (same figure the SQL test asserts)', () => {
    expect(entryInterest({ ...base, interest: 'simple', dueDate: '2026-07-01' })).toBe(Math.round((1_000_000 * 1200 * 181) / (10_000 * 365)))
    expect(entryInterest({ ...base, interest: 'simple', dueDate: '2026-01-01' })).toBe(0)
  })
  it('simple needs a due date', () => expect(() => entryInterest({ ...base, interest: 'simple', dueDate: null })).toThrow(RangeError))
})
