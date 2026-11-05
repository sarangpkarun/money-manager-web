import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { cardDueText, nextCardDue, nextDayOfMonth } from './cardCycle'

describe('nextDayOfMonth', () => {
  it('is today when today is that day, later this month, or next month', () => {
    expect(nextDayOfMonth(22, '2026-11-22')).toBe('2026-11-22')
    expect(nextDayOfMonth(22, '2026-11-05')).toBe('2026-11-22')
    expect(nextDayOfMonth(5, '2026-11-22')).toBe('2026-12-05')
  })
  it('rolls over the year', () => expect(nextDayOfMonth(5, '2026-12-22')).toBe('2027-01-05'))
  it('clamps a 31st (or 30th, 29th) to the last day of short months, including leap years', () => {
    expect(nextDayOfMonth(31, '2026-11-05')).toBe('2026-11-30')
    expect(nextDayOfMonth(31, '2026-02-05')).toBe('2026-02-28')
    expect(nextDayOfMonth(31, '2028-02-05')).toBe('2028-02-29')
    expect(nextDayOfMonth(30, '2026-01-31')).toBe('2026-02-28') // 30 Jan has passed; February clamps
    expect(nextDayOfMonth(29, '2026-03-01')).toBe('2026-03-29')
  })
  it('rejects days outside 1..31', () => {
    for (const bad of [0, 32, -1, 1.5]) expect(() => nextDayOfMonth(bad, '2026-11-05')).toThrow(RangeError)
  })
  it('property: never in the past, within a month, and on the right day or the month end', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 31 }), fc.integer({ min: 2024, max: 2030 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }), (day, y, m, d) => {
      const today = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const next = nextDayOfMonth(day, today)
      expect(next >= today).toBe(true)
      const dd = Number(next.slice(8, 10))
      const last = new Date(Date.UTC(Number(next.slice(0, 4)), Number(next.slice(5, 7)), 0)).getUTCDate()
      expect(dd).toBe(Math.min(day, last))
    }))
  })
})

describe('nextCardDue / cardDueText', () => {
  it('days away and the words', () => {
    expect(nextCardDue(22, '2026-11-15')).toEqual({ date: '2026-11-22', days: 7 })
    expect(cardDueText(nextCardDue(22, '2026-11-15')!)).toBe('Bill due 22 Nov (in 7 days)')
    expect(cardDueText(nextCardDue(22, '2026-11-21')!)).toBe('Bill due 22 Nov (in 1 day)')
    expect(cardDueText(nextCardDue(22, '2026-11-22')!)).toBe('Bill due today')
  })
  it('no due day, no text', () => {
    expect(nextCardDue(null, '2026-11-15')).toBeNull()
    expect(nextCardDue(undefined, '2026-11-15')).toBeNull()
    expect(nextCardDue(0, '2026-11-15')).toBeNull()
  })
})
