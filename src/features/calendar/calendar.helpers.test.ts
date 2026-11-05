import { describe, expect, it } from 'vitest'
import { agendaDays, loadedRange, mergeWindows } from './agenda'
import { longDate, shortDate } from './dateText'
import type { CalendarItem, CalendarNote } from './types'

const item = (o: Partial<CalendarItem> = {}): CalendarItem => ({
  entry_id: 'e1', seq: 1, kind: 'borrowed', title: 'Loan', name: 'Ravi', direction: 'pay', due_date: '2026-11-10', due_paise: 100_000, paid_paise: 0, paid_on: null, remaining_paise: 100_000, ...o,
})
const note = (o: Partial<CalendarNote> = {}): CalendarNote => ({ id: 'n1', kind: 'task', title: 'Call', date: '2026-11-12', repeat_rule: null, done: false, body: null, entry_id: null, ...o })

describe('date text', () => {
  it('shortDate and longDate', () => {
    expect(shortDate('2026-11-05')).toBe('5 Nov')
    expect(shortDate('2026-01-31')).toBe('31 Jan')
    expect(longDate('2026-11-05')).toBe('Thursday, 5 Nov 2026')
    expect(longDate('2028-02-29')).toBe('Tuesday, 29 Feb 2028')
  })
})

describe('agendaDays', () => {
  const R = ['2026-11-01', '2026-11-30'] as const
  it('puts unpaid rows on their due date, paid rows on the day they were paid, and always includes today', () => {
    const days = agendaDays([item(), item({ seq: 2, due_date: '2026-11-20', paid_paise: 100_000, paid_on: '2026-11-12' }), item({ seq: 3, due_date: '2026-12-10' })], [], ...R, '2026-11-15')
    expect(days.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-12', '2026-11-15'])
    expect(days[0]!.due.map((i) => i.seq)).toEqual([1])
    expect(days[1]!.paid.map((i) => i.seq)).toEqual([2])
    expect(days[2]).toMatchObject({ due: [], paid: [], notes: [] }) // today, empty
  })
  it('paid rows with no paid date sit on their due date; items outside the range are ignored', () => {
    const days = agendaDays([item({ paid_paise: 100_000, paid_on: null }), item({ seq: 2, due_date: '2027-01-01' })], [], ...R, '2026-12-25')
    expect(days.map((d) => d.date)).toEqual(['2026-11-10'])
  })
  it('expands repeating notes inside the range', () => {
    const days = agendaDays([], [note({ id: 'w', date: '2026-11-02', repeat_rule: 'weekly' }), note({ id: 'o' })], ...R, '2026-12-25')
    expect(days.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-09', '2026-11-12', '2026-11-16', '2026-11-23', '2026-11-30'])
    expect(days.find((d) => d.date === '2026-11-12')!.notes.map((n) => n.id)).toEqual(['o'])
  })
  it('loadedRange and mergeWindows', () => {
    expect(loadedRange([{ from: '2026-11-01', to: '2026-11-30' }, { from: '2026-12-01', to: '2026-12-30' }])).toEqual({ from: '2026-11-01', to: '2026-12-30' })
    const m = mergeWindows([{ items: [item()], notes: [note()] }, { items: [item(), item({ seq: 2 })], notes: [note(), note({ id: 'n2' })] }])
    expect(m.items.map((i) => i.seq)).toEqual([1, 2])
    expect(m.notes.map((n) => n.id)).toEqual(['n1', 'n2'])
  })
})
