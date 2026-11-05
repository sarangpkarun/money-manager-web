import { describe, expect, it } from 'vitest'
import { debtFreeText, loadBars, monthShort } from './emiLoad'

describe('emi load helpers', () => {
  it('monthShort', () => {
    expect(monthShort('2026-12')).toBe('Dec')
    expect(monthShort('2027-01')).toBe('Jan')
    expect(monthShort('2027-13')).toBe('2027-13')
  })
  it('bars are fractions of the busiest month and the first is the current month', () => {
    const bars = loadBars({ months: [{ month: '2026-11', due_paise: 500 }, { month: '2026-12', due_paise: 1000 }, { month: '2027-01', due_paise: 0 }], overdue_paise: 0, outstanding_paise: 1500, debt_free_date: null, open_count: 1 })
    expect(bars.map((b) => b.fraction)).toEqual([0.5, 1, 0])
    expect(bars.map((b) => b.label)).toEqual(['Nov', 'Dec', 'Jan'])
    expect(bars.map((b) => b.first)).toEqual([true, false, false])
    expect(loadBars({ months: [{ month: '2026-11', due_paise: 0 }], overdue_paise: 0, outstanding_paise: 0, debt_free_date: null, open_count: 0 })[0]?.fraction).toBe(0)
  })
  it('debt-free text counts calendar months', () => {
    expect(debtFreeText(null, '2026-11-15')).toBeNull()
    expect(debtFreeText('2027-09-05', '2026-11-15')).toBe('Debt-free by Sep 2027 (10 months)')
    expect(debtFreeText('2026-12-05', '2026-11-15')).toBe('Debt-free by Dec 2026 (1 month)')
    expect(debtFreeText('2026-11-30', '2026-11-15')).toBe('Debt-free by Nov 2026 (this month)')
    expect(debtFreeText('2026-01-01', '2026-11-15')).toBe('Debt-free by Jan 2026 (this month)') // already past: never negative
  })
})
