import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { instantToDate, instantToHm, localToInstant } from './zoned'

describe('localToInstant', () => {
  it('fixed-offset zones', () => {
    expect(localToInstant('2026-11-15', '09:00', 'Asia/Kolkata')).toBe('2026-11-15T03:30:00.000Z')
    expect(localToInstant('2026-11-15', '00:00', 'Asia/Kolkata')).toBe('2026-11-14T18:30:00.000Z')
    expect(localToInstant('2026-11-15', '09:00', 'UTC')).toBe('2026-11-15T09:00:00.000Z')
  })
  it('follows daylight saving in America/New_York', () => {
    expect(localToInstant('2026-07-01', '09:00', 'America/New_York')).toBe('2026-07-01T13:00:00.000Z') // EDT, UTC-4
    expect(localToInstant('2026-12-01', '09:00', 'America/New_York')).toBe('2026-12-01T14:00:00.000Z') // EST, UTC-5
    expect(localToInstant('2026-11-01', '09:00', 'America/New_York')).toBe('2026-11-01T14:00:00.000Z') // the day the clocks go back
    expect(localToInstant('2026-03-08', '09:00', 'America/New_York')).toBe('2026-03-08T13:00:00.000Z') // the day they go forward
  })
  it('a time that does not exist (spring-forward gap) lands just after it; a repeated time picks the first', () => {
    expect(localToInstant('2026-03-08', '02:30', 'America/New_York')).toBe('2026-03-08T07:30:00.000Z') // 03:30 EDT
    expect(localToInstant('2026-11-01', '01:30', 'America/New_York')).toBe('2026-11-01T05:30:00.000Z') // first 01:30, still EDT
  })
  it('the date line and half-hour zones', () => {
    expect(localToInstant('2026-11-15', '23:59', 'Pacific/Auckland')).toBe('2026-11-15T10:59:00.000Z') // NZDT, UTC+13
    expect(localToInstant('2026-11-15', '06:00', 'Asia/Kathmandu')).toBe('2026-11-15T00:15:00.000Z') // UTC+5:45
  })
  it('property: converting back gives the same wall time (outside gaps)', () => {
    fc.assert(fc.property(
      fc.constantFrom('Asia/Kolkata', 'America/New_York', 'Europe/London', 'Australia/Sydney', 'UTC'),
      fc.integer({ min: 0, max: 364 }), fc.integer({ min: 3, max: 23 }), fc.integer({ min: 0, max: 59 }),
      (tz, dayOfYear, h, m) => {
        const d = new Date(Date.UTC(2026, 0, 1 + dayOfYear)).toISOString().slice(0, 10)
        const hm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        const iso = localToInstant(d, hm, tz)
        expect(instantToHm(iso, tz)).toBe(hm)
        expect(instantToDate(iso, tz)).toBe(d)
      }))
  })
})

describe('instantToHm / instantToDate', () => {
  it('read an instant on a zone\'s wall clock', () => {
    expect(instantToHm('2026-11-15T03:30:00Z', 'Asia/Kolkata')).toBe('09:00')
    expect(instantToDate('2026-11-14T20:00:00Z', 'Asia/Kolkata')).toBe('2026-11-15')
    expect(instantToDate('2026-11-15T03:30:00Z', 'America/New_York')).toBe('2026-11-14')
    expect(instantToHm('2026-11-15T00:00:00Z', 'UTC')).toBe('00:00')
  })
})
