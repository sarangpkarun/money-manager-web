import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { monthGrid, weekdayLabels } from './calendarGrid'
import { markerSummary, markersByDay, visibleMarkers, ALL_LAYERS, type CalItem, type CalNote } from './markers'
import { formatCompact } from './money'
import { describeRepeat, formatRepeat, nextOccurrence, occurrencesBetween, parseRepeat } from './repeat'

describe('parseRepeat / formatRepeat / describeRepeat', () => {
  it('accepts the named rules and "every N units", any case and spacing', () => {
    expect(parseRepeat('daily')).toEqual({ n: 1, unit: 'day' })
    expect(parseRepeat(' Weekly ')).toEqual({ n: 1, unit: 'week' })
    expect(parseRepeat('MONTHLY')).toEqual({ n: 1, unit: 'month' })
    expect(parseRepeat('yearly')).toEqual({ n: 1, unit: 'year' })
    expect(parseRepeat('every 2 weeks')).toEqual({ n: 2, unit: 'week' })
    expect(parseRepeat('Every   3   Months')).toEqual({ n: 3, unit: 'month' })
    expect(parseRepeat('every day')).toEqual({ n: 1, unit: 'day' })
    expect(parseRepeat('every 1 year')).toEqual({ n: 1, unit: 'year' })
  })
  it('rejects anything else', () => {
    for (const bad of [null, undefined, '', '  ', 'sometimes', 'every 0 days', 'every -2 days', 'every 1000 days', 'every 2', 'every 2 fortnights', 'weekly on monday', 'every 1.5 weeks'])
      expect(parseRepeat(bad as string), String(bad)).toBeNull()
  })
  it('canonical text round-trips', () => {
    for (const r of ['daily', 'weekly', 'monthly', 'yearly', 'every 2 days', 'every 6 months', 'every 5 years']) expect(formatRepeat(parseRepeat(r)!)).toBe(r)
  })
  it('describes for the UI', () => {
    expect(describeRepeat('weekly')).toBe('Every week')
    expect(describeRepeat('every 2 weeks')).toBe('Every 2 weeks')
    expect(describeRepeat('nope')).toBeNull()
  })
})

describe('occurrencesBetween / nextOccurrence', () => {
  it('no rule: the start date if it is in the window', () => {
    expect(occurrencesBetween('2026-11-10', null, '2026-11-01', '2026-11-30')).toEqual(['2026-11-10'])
    expect(occurrencesBetween('2026-12-10', null, '2026-11-01', '2026-11-30')).toEqual([])
  })
  it('daily / weekly / every N, including a start long before the window', () => {
    expect(occurrencesBetween('2026-11-01', 'daily', '2026-11-03', '2026-11-05')).toEqual(['2026-11-03', '2026-11-04', '2026-11-05'])
    expect(occurrencesBetween('2026-09-07', 'weekly', '2026-11-01', '2026-11-30')).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
    expect(occurrencesBetween('2026-11-01', 'every 10 days', '2026-11-01', '2026-12-01')).toEqual(['2026-11-01', '2026-11-11', '2026-11-21', '2026-12-01'])
    expect(occurrencesBetween('2026-12-01', 'daily', '2026-11-01', '2026-11-30')).toEqual([]) // not started yet
  })
  it('monthly keeps the original day and clamps to month end (31 Jan → 28 Feb → 31 Mar)', () => {
    expect(occurrencesBetween('2026-01-31', 'monthly', '2026-01-01', '2026-05-31')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
    expect(occurrencesBetween('2028-01-31', 'monthly', '2028-02-01', '2028-02-29')).toEqual(['2028-02-29'])
    expect(occurrencesBetween('2026-01-15', 'every 2 months', '2026-01-01', '2026-07-31')).toEqual(['2026-01-15', '2026-03-15', '2026-05-15', '2026-07-15'])
  })
  it('yearly: 29 Feb becomes 28 Feb in common years and returns in leap years', () => {
    expect(occurrencesBetween('2028-02-29', 'yearly', '2028-01-01', '2032-12-31')).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'])
  })
  it('is capped', () => expect(occurrencesBetween('2026-01-01', 'daily', '2026-01-01', '2030-12-31', 10)).toHaveLength(10))
  it('nextOccurrence is the first one strictly after the date', () => {
    expect(nextOccurrence('2026-11-10', 'weekly')).toBe('2026-11-17')
    expect(nextOccurrence('2026-11-10', 'weekly', '2026-11-17')).toBe('2026-11-24')
    expect(nextOccurrence('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(nextOccurrence('2026-11-10', 'every 2 weeks', '2026-12-31')).toBe('2027-01-05')
    expect(nextOccurrence('2026-11-10', null)).toBeNull()
    expect(nextOccurrence('2026-11-10', 'garbage')).toBeNull()
  })
  it('property: occurrences strictly increase, stay in the window, and agree with nextOccurrence', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 400 }), fc.integer({ min: 0, max: 200 }),
      fc.constantFrom('daily', 'weekly', 'monthly', 'yearly', 'every 3 days', 'every 2 weeks', 'every 5 months'),
      fc.constantFrom('2026-01-31', '2026-02-28', '2028-02-29', '2026-11-10'),
      (offset, span, rule, start) => {
        const from = nextOccurrence(start, 'daily', start)! >= start ? addDaysLocal(start, offset) : start
        const to = addDaysLocal(from, span)
        const occ = occurrencesBetween(start, rule, from, to)
        occ.forEach((d, i) => { expect(d >= from && d <= to).toBe(true); if (i) expect(d > occ[i - 1]!).toBe(true) })
        if (occ.length) expect(nextOccurrence(start, rule, addDaysLocal(occ[0]!, -1))).toBe(occ[0])
      }))
  })
})
function addDaysLocal(d: string, n: number): string { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }

const item = (o: Partial<CalItem> = {}): CalItem => ({ entry_id: 'e1', seq: 1, title: 'Loan', direction: 'pay', due_date: '2026-11-10', due_paise: 100_000, paid_paise: 0, paid_on: null, ...o })
const note = (o: Partial<CalNote> = {}): CalNote => ({ id: 'n1', kind: 'task', title: 'Call', date: '2026-11-12', repeat_rule: null, done: false, ...o })
const R = { from: '2026-11-01', to: '2026-11-30' }
const day = (m: ReturnType<typeof markersByDay>, d: string) => m.get(d)?.map((x) => [x.kind, x.tone, x.tick, x.count])

describe('markersByDay', () => {
  const today = '2026-11-15'
  it('unpaid: red if before today, amber from today on (a part-paid row is still unpaid)', () => {
    const m = markersByDay([item({ due_date: '2026-11-10' }), item({ seq: 2, due_date: '2026-11-15' }), item({ seq: 3, due_date: '2026-11-20', paid_paise: 5 })], [], today, ALL_LAYERS, R)
    expect(day(m, '2026-11-10')).toEqual([['overdue', 'red', false, 1]])
    expect(day(m, '2026-11-15')).toEqual([['due', 'amber', false, 1]])
    expect(day(m, '2026-11-20')).toEqual([['due', 'amber', false, 1]])
  })
  it('paid on the due date, or with no paid date: green ✓ on the due date', () => {
    const m = markersByDay([item({ paid_paise: 100_000, paid_on: '2026-11-10' }), item({ seq: 2, due_date: '2026-11-11', paid_paise: 100_000, paid_on: null })], [], today, ALL_LAYERS, R)
    expect(day(m, '2026-11-10')).toEqual([['paid_on_time', 'green', true, 1]])
    expect(day(m, '2026-11-11')).toEqual([['paid_on_time', 'green', true, 1]])
  })
  it('scenario B: paid EARLY gives a blue ✓ on the due date AND on the paid date', () => {
    const m = markersByDay([item({ due_date: '2026-12-05', paid_paise: 100_000, paid_on: '2026-11-20' })], [], today, ALL_LAYERS, { from: '2026-11-01', to: '2026-12-31' })
    expect(day(m, '2026-12-05')).toEqual([['paid_early', 'blue', true, 1]])
    expect(day(m, '2026-11-20')).toEqual([['paid_early', 'blue', true, 1]])
  })
  it('scenario D: paid LATE gives an amber ✓ on the due date and on the paid date', () => {
    const m = markersByDay([item({ due_date: '2026-11-13', paid_paise: 100_000, paid_on: '2026-11-15' })], [], today, ALL_LAYERS, R)
    expect(day(m, '2026-11-13')).toEqual([['paid_late', 'amber', true, 1]])
    expect(day(m, '2026-11-15')).toEqual([['paid_late', 'amber', true, 1]])
    expect(markerSummary(m.get('2026-11-15'))).toBe('1 paid late')
  })
  it('only dates inside the range get a marker (the other end belongs to the other month)', () => {
    const m = markersByDay([item({ due_date: '2026-12-05', paid_paise: 100_000, paid_on: '2026-11-20' })], [], today, ALL_LAYERS, R)
    expect([...m.keys()]).toEqual(['2026-11-20'])
  })
  it('several items of one kind on a day are counted, not repeated', () => {
    const m = markersByDay([item(), item({ seq: 2 }), item({ seq: 3 })], [], today, ALL_LAYERS, R)
    expect(day(m, '2026-11-10')).toEqual([['overdue', 'red', false, 3]])
  })
  it('notes and tasks: purple; a finished one-off task is a grey ✓; a repeating task is never "done"', () => {
    const m = markersByDay([], [note(), note({ id: 'n2', kind: 'note', date: '2026-11-13' }), note({ id: 'n3', date: '2026-11-14', done: true }), note({ id: 'n4', date: '2026-11-02', repeat_rule: 'weekly', done: true })], today, ALL_LAYERS, R)
    expect(day(m, '2026-11-12')).toEqual([['task', 'purple', false, 1]])
    expect(day(m, '2026-11-13')).toEqual([['note', 'purple', false, 1]])
    expect(day(m, '2026-11-14')).toEqual([['task_done', 'grey', true, 1]])
    expect(day(m, '2026-11-09')).toEqual([['task', 'purple', false, 1]]) // repeating: shows on every occurrence
    expect(day(m, '2026-11-30')).toEqual([['task', 'purple', false, 1]])
  })
  it('layers switch the dues and notes markers off', () => {
    const items = [item()]; const notes = [note({ date: '2026-11-10' })]
    expect(day(markersByDay(items, notes, today, { ...ALL_LAYERS, dues: false }, R), '2026-11-10')).toEqual([['task', 'purple', false, 1]])
    expect(day(markersByDay(items, notes, today, { ...ALL_LAYERS, notes: false }, R), '2026-11-10')).toEqual([['overdue', 'red', false, 1]])
    expect(markersByDay(items, notes, today, { dues: false, spending: true, notes: false }, R).size).toBe(0)
  })
  it('orders by importance and the visible list is capped at 3, so red/amber are never hidden', () => {
    const m = markersByDay(
      [item({ due_date: '2026-11-10', paid_paise: 100_000, paid_on: '2026-11-10' }), item({ seq: 2 }), item({ seq: 3, paid_paise: 100_000, paid_on: '2026-11-08' }), item({ seq: 4, paid_paise: 100_000, paid_on: '2026-11-12' })],
      [note({ date: '2026-11-10' }), note({ id: 'x', kind: 'note', date: '2026-11-10' })], today, ALL_LAYERS, R)
    const all = m.get('2026-11-10')!
    expect(all.map((x) => x.kind)).toEqual(['overdue', 'paid_early', 'paid_late', 'paid_on_time', 'task', 'note'])
    expect(visibleMarkers(all).map((x) => x.kind)).toEqual(['overdue', 'paid_early', 'paid_late'])
    expect(visibleMarkers(undefined)).toEqual([])
    expect(markerSummary(all)).toContain('1 overdue')
    expect(markerSummary(undefined)).toBe('')
  })
})

describe('monthGrid', () => {
  it('Monday start: 1 Nov 2026 is a Sunday, so the first week starts 26 Oct (and 30 Nov needs a sixth row)', () => {
    const g = monthGrid('2026-11', 1)
    expect(g[0]![0]).toEqual({ date: '2026-10-26', day: 26, inMonth: false })
    expect(g[0]![6]).toEqual({ date: '2026-11-01', day: 1, inMonth: true })
    expect(g).toHaveLength(6)
    expect(g.at(-1)![0]).toEqual({ date: '2026-11-30', day: 30, inMonth: true })
    expect(g.at(-1)![6]).toEqual({ date: '2026-12-06', day: 6, inMonth: false })
  })
  it('a month can need 4, 5 or 6 rows', () => {
    expect(monthGrid('2027-02', 1)).toHaveLength(4) // 1 Feb 2027 is a Monday and the month has 28 days
    expect(monthGrid('2026-02', 1)).toHaveLength(5)
    expect(monthGrid('2026-08', 1)).toHaveLength(6)
  })
  it('Sunday start', () => {
    const g = monthGrid('2026-11', 0)
    expect(g[0]![0]).toEqual({ date: '2026-11-01', day: 1, inMonth: true })
    expect(weekdayLabels(0)).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S'])
    expect(weekdayLabels(1)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S'])
  })
  it('property: weeks are 7 long, contiguous, and include every day of the month exactly once', () => {
    fc.assert(fc.property(fc.integer({ min: 2020, max: 2032 }), fc.integer({ min: 1, max: 12 }), fc.constantFrom<0 | 1>(0, 1), (y, mth, ws) => {
      const month = `${y}-${String(mth).padStart(2, '0')}`
      const g = monthGrid(month, ws)
      expect(g.length >= 4 && g.length <= 6).toBe(true)
      const flat = g.flat()
      flat.forEach((d, i) => { if (i) expect(d.date > flat[i - 1]!.date).toBe(true) })
      const inMonth = flat.filter((d) => d.inMonth)
      expect(inMonth.length).toBe(new Date(Date.UTC(y, mth, 0)).getUTCDate())
      expect(g.every((w) => w.length === 7)).toBe(true)
    }))
  })
})

describe('formatCompact', () => {
  it('small amounts are whole rupees; thousands, lakhs and crores shorten', () => {
    expect(formatCompact(45_000)).toBe('₹450')
    expect(formatCompact(99_999)).toBe('₹1k') // 999.99 rounds up to a thousand
    expect(formatCompact(99_949)).toBe('₹999')
    expect(formatCompact(120_000)).toBe('₹1.2k')
    expect(formatCompact(500_000)).toBe('₹5k')
    expect(formatCompact(1_250_000)).toBe('₹12.5k')
    expect(formatCompact(30_000_000)).toBe('₹3L')
    expect(formatCompact(1_500_000_0)).toBe('₹1.5L')
    expect(formatCompact(1_500_000_000)).toBe('₹1.5Cr')
    expect(formatCompact(-45_000)).toBe('-₹450')
    expect(formatCompact(0)).toBe('₹0')
  })
})
