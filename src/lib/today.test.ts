import { describe, expect, it } from 'vitest'
import { isValidDate } from './dates'
import { todayIn } from './today'

describe('todayIn', () => {
  const instant = new Date('2026-11-05T20:00:00Z') // 01:30 on 6 Nov in India, 12:00 on 5 Nov in Los Angeles
  it('uses the timezone, not UTC', () => {
    expect(todayIn('Asia/Kolkata', instant)).toBe('2026-11-06')
    expect(todayIn('America/Los_Angeles', instant)).toBe('2026-11-05')
    expect(todayIn('UTC', instant)).toBe('2026-11-05')
  })
  it('handles the year boundary', () => {
    expect(todayIn('Asia/Kolkata', new Date('2026-12-31T19:00:00Z'))).toBe('2027-01-01')
    expect(todayIn('Pacific/Auckland', new Date('2026-12-31T12:00:00Z'))).toBe('2027-01-01')
  })
  it('falls back to the UTC date for an unknown timezone', () => {
    expect(todayIn('Not/AZone', instant)).toBe('2026-11-05')
  })
  it('defaults to now and returns a valid date', () => {
    expect(isValidDate(todayIn('Asia/Kolkata'))).toBe(true)
  })
})
