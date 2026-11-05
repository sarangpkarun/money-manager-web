import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  addDays, addMonths, addWeeks, compareDates, daysInMonth, diffDays, formatDate, fromDayNumber,
  isValidDate, parseDate, toDayNumber,
} from './dates'

describe('daysInMonth / isValidDate', () => {
  it('handles leap years', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2023, 2)).toBe(28)
    expect(daysInMonth(1900, 2)).toBe(28)
    expect(daysInMonth(2000, 2)).toBe(29)
  })
  it('knows 30 and 31 day months', () => {
    expect([4, 6, 9, 11].every((m) => daysInMonth(2025, m) === 30)).toBe(true)
    expect([1, 3, 5, 7, 8, 10, 12].every((m) => daysInMonth(2025, m) === 31)).toBe(true)
  })
  it('validates', () => {
    expect(isValidDate('2024-02-29')).toBe(true)
    expect(isValidDate('2023-02-29')).toBe(false)
    expect(isValidDate('2023-13-01')).toBe(false)
    expect(isValidDate('2023-00-10')).toBe(false)
    expect(isValidDate('2023-1-1')).toBe(false)
    expect(isValidDate('nope')).toBe(false)
  })
  it('parseDate throws on invalid input', () => {
    expect(parseDate('2026-11-05')).toEqual({ y: 2026, m: 11, d: 5 })
    expect(() => parseDate('2026-02-30')).toThrow(RangeError)
  })
})

describe('day numbers', () => {
  it('epoch and known dates', () => {
    expect(toDayNumber('1970-01-01')).toBe(0)
    expect(toDayNumber('1970-01-02')).toBe(1)
    expect(toDayNumber('1969-12-31')).toBe(-1)
    expect(toDayNumber('2000-03-01')).toBe(11017)
    expect(fromDayNumber(11017)).toBe('2000-03-01')
  })
  it('round-trips any date', () => {
    fc.assert(
      fc.property(fc.integer({ min: -200_000, max: 200_000 }), (n) => toDayNumber(fromDayNumber(n)) === n),
    )
  })
  it('formatDate pads', () => expect(formatDate(5, 3, 7)).toBe('0005-03-07'))
})

describe('addDays / addWeeks / diffDays / compareDates', () => {
  it('crosses month, year and leap boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
  })
  it('weeks are 7 days', () => expect(addWeeks('2026-01-01', 3)).toBe('2026-01-22'))
  it('diffDays is signed', () => {
    expect(diffDays('2026-12-05', '2026-12-28')).toBe(23)
    expect(diffDays('2026-12-28', '2026-12-05')).toBe(-23)
    expect(diffDays('2024-02-28', '2024-03-01')).toBe(2)
  })
  it('compareDates orders', () => {
    expect(compareDates('2026-01-01', '2026-01-02')).toBe(-1)
    expect(compareDates('2026-01-02', '2026-01-01')).toBe(1)
    expect(compareDates('2026-01-01', '2026-01-01')).toBe(0)
  })
  it('addDays then diffDays is identity', () => {
    fc.assert(fc.property(fc.integer({ min: -5000, max: 5000 }), (n) => diffDays('2026-06-15', addDays('2026-06-15', n)) === n))
  })
})

describe('addMonths', () => {
  it('clamps to month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30')
  })
  it('anchoring to the original day prevents drift (31 Jan, 28 Feb, 31 Mar)', () => {
    const dates = [0, 1, 2, 3].map((i) => addMonths('2026-01-31', i, 31))
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
    // iterative stepping WITHOUT the anchor drifts, which is exactly what the anchor avoids
    expect(addMonths(addMonths('2026-01-31', 1), 1)).toBe('2026-03-28')
  })
  it('rolls years forward and backward', () => {
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15')
    expect(addMonths('2026-05-10', 12)).toBe('2027-05-10')
  })
  it('zero months is identity', () => expect(addMonths('2026-02-28', 0)).toBe('2026-02-28'))
  it('always yields a valid date', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 31 }), fc.integer({ min: -240, max: 240 }), (day, n) =>
        isValidDate(addMonths('2026-01-01', n, day)),
      ),
    )
  })
})
