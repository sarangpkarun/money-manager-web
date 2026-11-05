import { describe, expect, it } from 'vitest'
import { ageingBars, ageingTotal } from './ageing'
import { groupByPerson } from './group'
import { findDuplicates, matchPeople, normaliseName, normalisePhone, parsePeopleText } from './people'
import { dueText, entryStatusOf, STATUS_TEXT } from './status'
import { diffDays } from '@/lib/dates'
import type { OverviewEntry } from './types'

const e = (o: Partial<OverviewEntry>): OverviewEntry => ({
  id: 'e', kind: 'lent', direction: 'receive', title: 'Loan', person_id: 'p1', person_name: 'Ravi', principal_paise: 100_000, total_paise: 100_000,
  paid_paise: 0, outstanding_paise: 100_000, start_date: '2026-11-01', overdue_paise: 0, rows_total: 1, rows_paid: 0, due_date: null, ...o,
})

describe('entryStatusOf', () => {
  const today = '2026-11-15'
  it('maps totals and due date to Pending / Partial / Overdue / Paid', () => {
    expect(entryStatusOf({ total_paise: 100, paid_paise: 0, due_date: '2026-12-01' }, today)).toBe('pending')
    expect(entryStatusOf({ total_paise: 100, paid_paise: 40, due_date: '2026-12-01' }, today)).toBe('partial')
    expect(entryStatusOf({ total_paise: 100, paid_paise: 40, due_date: '2026-11-01' }, today)).toBe('overdue')
    expect(entryStatusOf({ total_paise: 100, paid_paise: 100, due_date: '2026-11-01' }, today)).toBe('paid')
    expect(entryStatusOf({ total_paise: 100, paid_paise: 0, due_date: '9999-12-31' }, today)).toBe('pending')
    expect(entryStatusOf({ total_paise: 100, paid_paise: 0, due_date: null }, today)).toBe('pending')
    expect(STATUS_TEXT.overdue).toBe('Overdue')
  })
  it('dueText', () => {
    expect(dueText(null, '2026-11-15', diffDays)).toBe('No due date')
    expect(dueText('2026-11-15', '2026-11-15', diffDays)).toBe('Due today')
    expect(dueText('2026-11-16', '2026-11-15', diffDays)).toBe('Due in 1 day')
    expect(dueText('2026-11-20', '2026-11-15', diffDays)).toBe('Due in 5 days')
    expect(dueText('2026-11-14', '2026-11-15', diffDays)).toBe('1 day overdue')
    expect(dueText('2026-11-10', '2026-11-15', diffDays)).toBe('5 days overdue')
  })
})

describe('groupByPerson', () => {
  const entries = [
    e({ id: '1', person_id: 'a', person_name: 'Asha', outstanding_paise: 50_000, due_date: '2026-11-20' }),
    e({ id: '2', person_id: 'b', person_name: 'Bala', outstanding_paise: 200_000, due_date: '2026-11-01' }),
    e({ id: '3', person_id: 'a', person_name: 'Asha', outstanding_paise: 30_000, due_date: '2026-10-01' }),
    e({ id: '4', person_id: null, person_name: null, outstanding_paise: 10_000 }),
    e({ id: '5', direction: 'pay', kind: 'borrowed', person_id: 'c', person_name: 'Chitra', outstanding_paise: 5_000 }),
  ]
  it('only the requested direction, totals per person', () => {
    const g = groupByPerson(entries, 'receive', '2026-11-15')
    expect(g.map((x) => x.name).sort()).toEqual(['Asha', 'Bala', 'No person'])
    const asha = g.find((x) => x.name === 'Asha')!
    expect(asha).toMatchObject({ outstanding: 80_000, overdue: 30_000, nextDue: '2026-10-01' })
    expect(asha.entries).toHaveLength(2)
    expect(g.find((x) => x.name === 'No person')).toMatchObject({ personId: null, nextDue: null, overdue: 0 })
    expect(groupByPerson(entries, 'pay', '2026-11-15').map((x) => x.name)).toEqual(['Chitra'])
  })
  it('sorts by overdue, amount or name', () => {
    expect(groupByPerson(entries, 'receive', '2026-11-15', 'overdue').map((x) => x.name)).toEqual(['Bala', 'Asha', 'No person'])
    expect(groupByPerson(entries, 'receive', '2026-11-15', 'amount').map((x) => x.name)).toEqual(['Bala', 'Asha', 'No person'])
    expect(groupByPerson(entries, 'receive', '2026-11-15', 'name').map((x) => x.name)).toEqual(['Asha', 'Bala', 'No person'])
  })
})

describe('people helpers', () => {
  it('normalises names and phones', () => {
    expect(normaliseName('  R.  Kumar ')).toBe('r kumar')
    expect(normaliseName('José')).toBe('jose')
    expect(normalisePhone('+91 98765-43210')).toBe('9876543210')
    expect(normalisePhone(null)).toBe('')
  })
  it('finds duplicates by name or phone, transitively', () => {
    const people = [
      { id: '1', name: 'Ravi Kumar', phone: null }, { id: '2', name: 'ravi  kumar' }, { id: '3', name: 'Ravi K', phone: '98765 43210' },
      { id: '4', name: 'R Kumar', phone: '+91 9876543210' }, { id: '5', name: 'Meera' }, { id: '6', name: '!!!' }, { id: '7', name: '???' },
    ]
    const groups = findDuplicates(people).map((g) => g.map((p) => p.id).sort())
    expect(groups).toEqual([['1', '2'], ['3', '4']])
    expect(findDuplicates([{ id: 'a', name: 'X', phone: '123' }, { id: 'b', name: 'Y', phone: '123' }])).toEqual([]) // too short to trust
  })
  it('parses pasted text and CSV, skipping header and flagging duplicates', () => {
    const rows = parsePeopleText('Name,Phone\nAsha, 98765 43210\n"Bala";\nmeera\tx\nASHA\n\n,\nRavi,98765 43210\n!!!', [{ id: '1', name: 'Meera' }])
    expect(rows).toEqual([
      { name: 'Asha', phone: '98765 43210', duplicate: false },
      { name: 'Bala', phone: null, duplicate: false },
      { name: 'meera', phone: 'x', duplicate: true },
      { name: 'ASHA', phone: null, duplicate: true },
      { name: 'Ravi', phone: '98765 43210', duplicate: true },
    ])
  })
  it('matchPeople ranks prefix, word start, substring', () => {
    const people = [{ id: '1', name: 'Kumar Ravi' }, { id: '2', name: 'Ravi Shankar' }, { id: '3', name: 'Gravin' }, { id: '4', name: 'Meera' }]
    expect(matchPeople(people, 'rav').map((p) => p.id)).toEqual(['2', '1', '3'])
    expect(matchPeople(people, '').map((p) => p.id)).toEqual(['1', '2', '3', '4'])
    expect(matchPeople(people, 'zzz')).toEqual([])
    expect(matchPeople(people, 'rav', 1)).toHaveLength(1)
  })
})

describe('ageing', () => {
  it('bars are fractions of the largest bucket', () => {
    const a = { current: 100, d1_30: 50, d31_60: 0, d61_plus: 25 }
    const bars = ageingBars(a)
    expect(bars.map((b) => b.fraction)).toEqual([1, 0.5, 0, 0.25])
    expect(bars.map((b) => b.late)).toEqual([false, true, true, true])
    expect(ageingTotal(a)).toBe(175)
    expect(ageingBars({ current: 0, d1_30: 0, d31_60: 0, d61_plus: 0 }).every((b) => b.fraction === 0)).toBe(true)
  })
})
