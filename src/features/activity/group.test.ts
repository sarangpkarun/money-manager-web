import { describe, expect, it } from 'vitest'
import { dayLabel, flattenGroups, groupByDay, monthLabel, shiftMonth, type TxnLike } from './group'

const t = (id: string, date: string, kind: string, amount: number, forOther = 0): TxnLike => ({
  id, date, kind, amount_paise: amount, for_other_paise: forOther,
})

describe('groupByDay', () => {
  const rows = [
    t('1', '2026-11-05', 'expense', 10_000), t('2', '2026-11-05', 'income', 50_000), t('3', '2026-11-05', 'transfer', 99_000),
    t('4', '2026-11-04', 'expense', 500_000, 400_000), t('5', '2026-11-04', 'debt_out', 70_000), t('6', '2026-11-02', 'expense', 1_000),
  ]
  const groups = groupByDay(rows)
  it('keeps order and groups consecutive days', () => {
    expect(groups.map((g) => [g.date, g.rows.length])).toEqual([['2026-11-05', 3], ['2026-11-04', 2], ['2026-11-02', 1]])
  })
  it('personal spend excludes the part paid for others; transfers and debts are not spending', () => {
    expect(groups[0]).toMatchObject({ spent: 10_000, received: 50_000 })
    expect(groups[1]).toMatchObject({ spent: 100_000, received: 0 })
  })
  it('empty input', () => expect(groupByDay([])).toEqual([]))
  it('flattenGroups emits a header before each day', () => {
    const flat = flattenGroups(groups)
    expect(flat.map((i) => i.type)).toEqual(['header', 'txn', 'txn', 'txn', 'header', 'txn', 'txn', 'header', 'txn'])
    expect(flat[0]).toMatchObject({ key: 'h-2026-11-05', spent: 10_000 })
    expect(new Set(flat.map((i) => i.key)).size).toBe(flat.length)
  })
})

describe('dayLabel', () => {
  const today = '2026-11-05'
  it('today, yesterday, weekday names, other years', () => {
    expect(dayLabel('2026-11-05', today)).toBe('Today')
    expect(dayLabel('2026-11-04', today)).toBe('Yesterday')
    expect(dayLabel('2026-11-02', today)).toBe('Mon, 2 Nov')
    expect(dayLabel('2026-12-25', today)).toBe('Fri, 25 Dec')
    expect(dayLabel('2025-12-25', today)).toBe('Thu, 25 Dec 2025')
  })
})

describe('monthLabel / shiftMonth', () => {
  it('labels months', () => {
    expect(monthLabel('2026-11')).toBe('November 2026')
    expect(monthLabel('2027-01')).toBe('January 2027')
  })
  it('shifts across year boundaries', () => {
    expect(shiftMonth('2026-11', 1)).toBe('2026-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-05', 0)).toBe('2026-05')
    expect(shiftMonth('2026-03', -15)).toBe('2024-12')
  })
})
