import { describe, expect, it } from 'vitest'
import { allocatePayment } from './allocate'
import { entryStatus, rowLabel, statusFromTotals } from './labels'
import { buildSchedule, type ScheduleRow } from './schedule'

const row = (o: Partial<ScheduleRow> = {}): ScheduleRow => ({
  seq: 1, due_date: '2027-01-05', due_paise: 500_000, principal_paise: 500_000, interest_paise: 0, paid_paise: 0, paid_on: null, ...o,
})

describe('rowLabel (spec 4.4)', () => {
  it('paid early: days between paid date and due date', () => {
    const l = rowLabel(row({ paid_paise: 500_000, paid_on: '2026-12-28' }), '2026-12-29')
    expect(l).toMatchObject({ kind: 'paid_early', days: 8, tone: 'blue', text: 'Paid early (8 days)' })
  })
  it('singular day', () => {
    expect(rowLabel(row({ paid_paise: 500_000, paid_on: '2027-01-04' }), '2027-02-01').text).toBe('Paid early (1 day)')
  })
  it('paid on time', () => {
    expect(rowLabel(row({ paid_paise: 500_000, paid_on: '2027-01-05' }), '2027-02-01')).toMatchObject({ kind: 'paid_on_time', tone: 'green', text: 'Paid on time' })
  })
  it('paid late', () => {
    expect(rowLabel(row({ paid_paise: 500_000, paid_on: '2027-01-07' }), '2027-02-01')).toMatchObject({ kind: 'paid_late', days: 2, tone: 'amber', text: 'Paid late (2 days)' })
  })
  it('fully paid with no recorded date is just "Paid"', () => {
    expect(rowLabel(row({ paid_paise: 500_000 }), '2027-02-01')).toMatchObject({ kind: 'paid', tone: 'green' })
  })
  it('overdue begins the day after the due date', () => {
    expect(rowLabel(row(), '2027-01-05')).toMatchObject({ kind: 'upcoming', days: 0, text: 'Due today' })
    expect(rowLabel(row(), '2027-01-06')).toMatchObject({ kind: 'overdue', days: 1, tone: 'red', text: 'Overdue (1 day late)' })
    expect(rowLabel(row(), '2027-01-15')).toMatchObject({ kind: 'overdue', days: 10 })
  })
  it('partly paid and past due is overdue (partial); partly paid but not yet due is still upcoming', () => {
    expect(rowLabel(row({ paid_paise: 100_000 }), '2027-01-10')).toMatchObject({ kind: 'overdue_partial', days: 5, tone: 'red' })
    expect(rowLabel(row({ paid_paise: 100_000 }), '2027-01-01')).toMatchObject({ kind: 'upcoming', days: 4, text: 'Due in 4 days' })
  })
  it('upcoming singular', () => expect(rowLabel(row(), '2027-01-04').text).toBe('Due in 1 day'))
})

describe('statusFromTotals / entryStatus', () => {
  it('priority: paid > overdue > partial > pending', () => {
    expect(statusFromTotals(1000, 1000, '2020-01-01', '2026-01-01')).toBe('paid')
    expect(statusFromTotals(1000, 400, '2025-12-31', '2026-01-01')).toBe('overdue')
    expect(statusFromTotals(1000, 400, '2026-01-01', '2026-01-01')).toBe('partial')
    expect(statusFromTotals(1000, 0, null, '2026-01-01')).toBe('pending')
    expect(statusFromTotals(1000, 0, '2026-02-01', '2026-01-01')).toBe('pending')
  })
  it('from rows', () => {
    const rows = buildSchedule({ mode: 'equal', principal: 300_000, count: 3, firstDate: '2026-12-05' }).rows
    expect(entryStatus(rows, '2026-12-01')).toBe('pending')
    expect(entryStatus(rows, '2026-12-06')).toBe('overdue')
    const part = allocatePayment(rows, 100_000, '2026-12-05').rows
    expect(entryStatus(part, '2026-12-10')).toBe('partial') // row 1 paid, row 2 not due until 5 Jan
    expect(entryStatus(part, '2027-01-06')).toBe('overdue')
    expect(entryStatus(allocatePayment(rows, 300_000, '2026-12-05').rows, '2030-01-01')).toBe('paid')
  })
})

describe('scenario B: pay instalment #2 early', () => {
  it('blue "paid early (8 days)" on #2; #1 is overdue; #3 upcoming', () => {
    const rows = buildSchedule({ mode: 'equal', principal: 5_000_000, count: 10, firstDate: '2026-12-05' }).rows
    const after = allocatePayment(rows, 500_000, '2026-12-28', 2).rows
    const today = '2026-12-29'
    expect(rowLabel(after[1] as ScheduleRow, today)).toMatchObject({ kind: 'paid_early', days: 8, tone: 'blue' })
    expect(rowLabel(after[0] as ScheduleRow, today)).toMatchObject({ kind: 'overdue', days: 24 })
    expect(rowLabel(after[2] as ScheduleRow, today)).toMatchObject({ kind: 'upcoming' })
  })
})

describe('scenario D: weekly, row 3 paid first and 2 days late', () => {
  it('amber "paid late (2 days)" on row 3', () => {
    const rows = buildSchedule({ mode: 'equal', principal: 200_000, count: 4, firstDate: '2026-03-01', period: 'weekly' }).rows
    const after = allocatePayment(rows, 50_000, '2026-03-17', 3).rows // row 3 due 15 Mar
    expect(rowLabel(after[2] as ScheduleRow, '2026-03-18')).toMatchObject({ kind: 'paid_late', days: 2, tone: 'amber', text: 'Paid late (2 days)' })
    expect(rowLabel(after[0] as ScheduleRow, '2026-03-18')).toMatchObject({ kind: 'overdue', days: 17 })
  })
})

describe('entries without a due date', () => {
  const NO = { due_date: '9999-12-31', due_paise: 1000, principal_paise: 1000 }
  it('are never overdue, however long ago they started', () => {
    expect(rowLabel(row(NO), '2030-01-01')).toMatchObject({ kind: 'no_due', tone: 'grey', text: 'No due date' })
    expect(rowLabel(row({ ...NO, paid_paise: 400 }), '2030-01-01').text).toBe('Partly paid, no due date')
    expect(entryStatus([row(NO)], '2999-01-01')).toBe('pending')
    expect(entryStatus([row({ ...NO, paid_paise: 5 })], '2999-01-01')).toBe('partial')
  })
  it('settled ones say Paid, not "paid early"', () => {
    expect(rowLabel(row({ ...NO, paid_paise: 1000, paid_on: '2026-11-20' }), '2026-11-21')).toMatchObject({ kind: 'paid', text: 'Paid' })
  })
})
