import { afterEach, describe, expect, it } from 'vitest'
import { DATE_FORMATS, NUMBER_FORMATS, formatDisplayDate, getDisplay, isDateFormat, isNumberFormat, resetDisplay, setDisplay, useDisplayVersion } from './display'
import { formatMoney } from './money'

afterEach(resetDisplay)

describe('formatDisplayDate', () => {
  it('all four formats, with and without the year', () => {
    const d = '2026-11-05'
    expect(formatDisplayDate(d, { style: 'dd MMM yyyy' })).toBe('5 Nov 2026')
    expect(formatDisplayDate(d, { style: 'MMM dd, yyyy' })).toBe('Nov 5, 2026')
    expect(formatDisplayDate(d, { style: 'dd/MM/yyyy' })).toBe('05/11/2026')
    expect(formatDisplayDate(d, { style: 'yyyy-MM-dd' })).toBe('2026-11-05')
    expect(formatDisplayDate(d, { style: 'dd MMM yyyy', year: false })).toBe('5 Nov')
    expect(formatDisplayDate(d, { style: 'MMM dd, yyyy', year: false })).toBe('Nov 5')
    expect(formatDisplayDate(d, { style: 'dd/MM/yyyy', year: false })).toBe('05/11')
    expect(formatDisplayDate(d, { style: 'yyyy-MM-dd', year: false })).toBe('11-05')
  })
  it('weekday prefix, short or long, in every format', () => {
    expect(formatDisplayDate('2026-11-05', { weekday: 'short', style: 'dd MMM yyyy' })).toBe('Thu, 5 Nov 2026')
    expect(formatDisplayDate('2026-11-05', { weekday: 'long', style: 'MMM dd, yyyy', year: false })).toBe('Thursday, Nov 5')
    expect(formatDisplayDate('2028-02-29', { weekday: 'short', style: 'yyyy-MM-dd' })).toBe('Tue, 2028-02-29')
  })
  it('month and year edges', () => {
    expect(formatDisplayDate('2026-01-01', { style: 'dd/MM/yyyy' })).toBe('01/01/2026')
    expect(formatDisplayDate('2026-12-31', { style: 'MMM dd, yyyy' })).toBe('Dec 31, 2026')
  })
  it('follows the current setting by default', () => {
    expect(formatDisplayDate('2026-11-05')).toBe('5 Nov 2026')
    setDisplay({ date: 'dd/MM/yyyy' })
    expect(formatDisplayDate('2026-11-05')).toBe('05/11/2026')
  })
})

describe('setDisplay / resetDisplay', () => {
  it('changes the defaults, reports whether anything changed, and bumps the version only then', () => {
    const v0 = useDisplayVersion.getState().version
    expect(setDisplay({ number: 'western' })).toBe(true)
    expect(getDisplay()).toEqual({ number: 'western', date: 'dd MMM yyyy' })
    expect(useDisplayVersion.getState().version).toBe(v0 + 1)
    expect(setDisplay({ number: 'western' })).toBe(false)
    expect(useDisplayVersion.getState().version).toBe(v0 + 1)
  })
  it('ignores unknown or missing values and keeps what it had', () => {
    setDisplay({ number: 'western', date: 'yyyy-MM-dd' })
    expect(setDisplay({ number: 'martian', date: null })).toBe(false)
    expect(setDisplay({})).toBe(false)
    expect(getDisplay()).toEqual({ number: 'western', date: 'yyyy-MM-dd' })
  })
  it('reset returns to the defaults', () => {
    setDisplay({ number: 'western', date: 'yyyy-MM-dd' })
    resetDisplay()
    expect(getDisplay()).toEqual({ number: 'indian', date: 'dd MMM yyyy' })
  })
  it('type guards and option lists agree', () => {
    expect(isNumberFormat('indian') && isNumberFormat('western') && !isNumberFormat('x')).toBe(true)
    expect(DATE_FORMATS.every((f) => isDateFormat(f.id))).toBe(true)
    expect(isDateFormat('dd-MM-yy')).toBe(false)
    expect(NUMBER_FORMATS.map((n) => n.id)).toEqual(['indian', 'western'])
  })
})

describe('formatMoney follows the number format', () => {
  it('Indian by default, Western when chosen, explicit option always wins', () => {
    expect(formatMoney(123_456_700)).toBe('₹12,34,567')
    setDisplay({ number: 'western' })
    expect(formatMoney(123_456_700)).toBe('₹1,234,567')
    expect(formatMoney(-123_456_750)).toBe('-₹1,234,567.50')
    expect(formatMoney(123_456_700, { format: 'indian' })).toBe('₹12,34,567')
    resetDisplay()
    expect(formatMoney(123_456_700)).toBe('₹12,34,567')
  })
})
