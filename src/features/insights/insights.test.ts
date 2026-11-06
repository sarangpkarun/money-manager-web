import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { EMPTY_FACTS, T, buildInsights, parseFacts, type InsightFacts } from './rules'

const today = '2026-11-15'
const facts = (o: Partial<InsightFacts> = {}): InsightFacts => ({ ...EMPTY_FACTS, month: { spent_paise: 0, prev_total_paise: 0, days_elapsed: 15, days_in_month: 30 }, ...o })
const texts = (f: InsightFacts, t = today) => buildInsights(f, t).map((i) => i.text)

describe('buildInsights', () => {
  it('nothing to say gives an empty list', () => {
    expect(buildInsights(EMPTY_FACTS, today)).toEqual([])
    expect(buildInsights(facts(), today)).toEqual([])
  })

  describe('1. category up or down', () => {
    const cat = (name: string, now: number, before: number, id: string | null = name) => ({ id, name, this_paise: now, prev_to_date_paise: before })
    it('says up/down with the percentage and the previous month, and drills into that category this month', () => {
      const r = buildInsights(facts({ categories: [cat('Food', 1_320_000, 1_000_000, 'c-food'), cat('Travel', 500_000, 1_000_000, 'c-travel')] }), today)
      expect(r.map((i) => i.text)).toEqual(['Food spend up 32% vs October so far', 'Travel spend down 50% vs October so far'])
      expect(r[0]!.drill).toEqual({ path: '/activity', search: '?cat=c-food&d=month&type=spend' })
    })
    it('ignores changes of 20% or less, changes under ₹500, categories that were empty before, and the first days of a month', () => {
      expect(texts(facts({ categories: [cat('A', 120_000, 100_000)] }))).toEqual([]) // exactly 20%
      expect(texts(facts({ categories: [cat('B', 12_000, 5_000)] }))).toEqual([]) // +140% but only ₹70
      expect(texts(facts({ categories: [cat('C', 90_000, 0)] }))).toEqual([])
      expect(texts(facts({ month: { spent_paise: 1, prev_total_paise: 1, days_elapsed: 4, days_in_month: 30 }, categories: [cat('D', 300_000, 100_000)] }))).toEqual([])
    })
    it('keeps the two biggest changes; Uncategorised has no category filter in its drill', () => {
      const r = buildInsights(facts({ categories: [cat('A', 300_000, 100_000), cat('B', 200_000, 100_000), cat('C', 900_000, 100_000), cat('Uncategorised', 400_000, 100_000, null)] }), today)
        .filter((i) => i.id.startsWith('category:'))
      expect(r.map((i) => i.id)).toEqual(['category:C', 'category:none'])
      expect(r.find((i) => i.id === 'category:none')?.drill.search).toBe('?d=month&type=spend')
    })
    it('names the month before today, across a year change', () => {
      expect(texts(facts({ categories: [cat('Food', 300_000, 100_000)] }), '2027-01-15')[0]).toContain('vs December')
    })
  })

  describe('2. projection', () => {
    const m = (spent: number, prev: number, elapsed = 15) => ({ spent_paise: spent, prev_total_paise: prev, days_elapsed: elapsed, days_in_month: 30 })
    it('projects average daily spend over the month and compares it with last month', () => {
      expect(texts(facts({ month: m(150_000, 200_000) }))).toEqual(['On track to spend ₹3,000 this month, 50% more than October (₹2,000)'])
      expect(texts(facts({ month: m(50_000, 200_000) }))[0]).toContain('less than October')
    })
    it('stays quiet for small differences, no last month, no spend, or before day 5', () => {
      expect(texts(facts({ month: m(100_000, 200_000) }))).toEqual([]) // projects exactly last month
      expect(texts(facts({ month: m(110_000, 200_000) }))).toEqual([]) // +10%
      expect(texts(facts({ month: m(100_000, 0) }))).toEqual([])
      expect(texts(facts({ month: m(0, 100_000) }))).toEqual([])
      expect(texts(facts({ month: m(100_000, 10_000, 4) }))).toEqual([])
    })
  })

  describe('3. people', () => {
    const late = (name: string, days: number, paise = 1_000_000, id: string | null = name) => ({ person_id: id, name, overdue_paise: paise, days_late: days, entry_id: `e-${name}` })
    it('names who is late for more than 7 days and links to the entry', () => {
      const r = buildInsights(facts({ people_overdue: [late('Arun', 12)] }), today)
      expect(r[0]).toMatchObject({ text: 'Arun is 12 days late on ₹10,000', drill: { path: '/money/entry/e-Arun' } })
      expect(texts(facts({ people_overdue: [late('Arun', 7)] }))).toEqual([]) // exactly 7: not yet
      expect(texts(facts({ people_overdue: [late('Arun', 8)] }))).toEqual(['Arun is 8 days late on ₹10,000'])
    })
    it('adds the largest outstanding person unless they were already named as late', () => {
      const big = { person_id: 'p-ravi', name: 'Ravi', outstanding_paise: 2_500_000 }
      expect(texts(facts({ largest_outstanding: big }))).toEqual(['Ravi owes you the most: ₹25,000'])
      expect(texts(facts({ largest_outstanding: big, people_overdue: [late('Ravi', 30, 100, 'p-ravi')] }))).toEqual(['Ravi is 30 days late on ₹1'])
      expect(texts(facts({ largest_outstanding: { ...big, outstanding_paise: 0 } }))).toEqual([])
    })
    it('at most two late people, the latest first', () => {
      const r = texts(facts({ people_overdue: [late('A', 40), late('B', 20), late('C', 10)] }))
      expect(r).toEqual(['A is 40 days late on ₹10,000', 'B is 20 days late on ₹10,000'])
      expect(texts(facts({ people_overdue: [late('A', 1)] }))).toEqual([])
    })
    it('1 day is singular', () => {
      expect(texts(facts({ people_overdue: [late('Z', 8)] }))[0]).toContain('8 days')
    })
  })

  describe('4. credit cards', () => {
    const card = (o: Partial<InsightFacts['cards'][number]> = {}) => ({ id: 'c1', name: 'HDFC', outstanding_paise: 6_000_000, limit_paise: 10_000_000, due_day: null, ...o })
    it('warns above 50% use, not at or below it', () => {
      expect(texts(facts({ cards: [card()] }))).toEqual(['HDFC is 60% used (₹60,000 of ₹1,00,000)'])
      expect(texts(facts({ cards: [card({ outstanding_paise: 5_000_000 })] }))).toEqual([]) // exactly 50%
      expect(buildInsights(facts({ cards: [card()] }), today)[0]!.drill).toEqual({ path: '/activity', search: '?acc=c1' })
    })
    it('warns when the bill is due within 5 days (today, tomorrow, in N days) and there is something to pay', () => {
      const low = { outstanding_paise: 1_200_000 }
      expect(texts(facts({ cards: [card({ ...low, due_day: 15 })] }))).toEqual(['HDFC bill of ₹12,000 is due today'])
      expect(texts(facts({ cards: [card({ ...low, due_day: 16 })] }))).toEqual(['HDFC bill of ₹12,000 is due tomorrow'])
      expect(texts(facts({ cards: [card({ ...low, due_day: 20 })] }))).toEqual(['HDFC bill of ₹12,000 is due in 5 days'])
      expect(texts(facts({ cards: [card({ ...low, due_day: 21 })] }))).toEqual([])
      expect(texts(facts({ cards: [card({ outstanding_paise: 0, due_day: 16 })] }))).toEqual([])
    })
    it('a busy and almost-due card gives both messages, the bill first', () => {
      expect(texts(facts({ cards: [card({ due_day: 17 })] }))).toEqual(['HDFC bill of ₹60,000 is due in 2 days', 'HDFC is 60% used (₹60,000 of ₹1,00,000)'])
    })
  })

  describe('5. paid for others, not returned', () => {
    it('over 30 days', () => {
      const g = (name: string, days: number) => ({ entry_id: `e-${name}`, name, left_paise: 200_000, days })
      expect(texts(facts({ for_others_aged: [g('Arun', 56)] }))).toEqual(['Arun still owes ₹2,000 for what you paid, 56 days ago'])
      expect(texts(facts({ for_others_aged: [g('Arun', 30)] }))).toEqual([])
      expect(buildInsights(facts({ for_others_aged: [g('Arun', 56)] }), today)[0]!.drill.path).toBe('/money/entry/e-Arun')
      expect(texts(facts({ for_others_aged: [g('A', 90), g('B', 80), g('C', 70)] }))).toHaveLength(2)
    })
  })

  describe('6. paying on time', () => {
    it('late payments this year, singular and plural', () => {
      expect(texts(facts({ streak: { early_this_year: 0, late_this_year: 1, early_in_a_row: 0 } }))).toEqual(['1 payment paid late this year'])
      expect(texts(facts({ streak: { early_this_year: 0, late_this_year: 3, early_in_a_row: 0 } }))).toEqual(['3 payments paid late this year'])
    })
    it('a streak of 3+ early, else a count of 2+ early this year, else nothing', () => {
      expect(texts(facts({ streak: { early_this_year: 5, late_this_year: 0, early_in_a_row: 3 } }))).toEqual(['3 payments in a row paid early'])
      expect(texts(facts({ streak: { early_this_year: 3, late_this_year: 0, early_in_a_row: 2 } }))).toEqual(['3 payments paid early this year'])
      expect(texts(facts({ streak: { early_this_year: 1, late_this_year: 0, early_in_a_row: 1 } }))).toEqual([])
    })
  })

  describe('7. budgets', () => {
    const b = (spent: number, limit = 100_000, cat: string | null = 'c-food', name = 'Food') => ({ category_id: cat, name, limit_paise: limit, spent_paise: spent })
    it('near (80%+) and over', () => {
      expect(texts(facts({ budgets: [b(79_000)] }))).toEqual([])
      expect(texts(facts({ budgets: [b(80_000)] }))).toEqual(['Food budget is 80% used (₹800 of ₹1,000)'])
      expect(texts(facts({ budgets: [b(100_000)] }))).toEqual(['Food budget is 100% used (₹1,000 of ₹1,000)'])
      expect(texts(facts({ budgets: [b(130_000)] }))).toEqual(['Food budget is over by ₹300 (₹1,300 of ₹1,000)'])
    })
    it('overall budget has no category in its drill; no budgets (or a zero limit) means no insight', () => {
      expect(buildInsights(facts({ budgets: [b(90_000, 100_000, null, 'Overall')] }), today)[0]!.drill.search).toBe('?d=month&type=spend')
      expect(texts(facts({ budgets: [b(10, 0)] }))).toEqual([])
      expect(texts(facts({ budgets: [] }))).toEqual([])
    })
  })

  describe('8. highlights', () => {
    it('largest spend and most used account (3+ payments)', () => {
      const f = facts({ largest_spend: { id: 't', title: 'TV', amount_paise: 1_800_000, date: '2026-11-03', category_id: 'c-el', category: 'Electronics' }, top_account: { id: 'a1', name: 'Cash', count: 12 } })
      expect(texts(f)).toEqual(['Biggest spend this month: ₹18,000 on Electronics', 'Most used account this month: Cash (12 payments)'])
      expect(texts(facts({ largest_spend: { id: 't', title: 'TV', amount_paise: 500, date: '2026-11-03', category: null }, top_account: { id: 'a1', name: 'Cash', count: 2 } }))).toEqual(['Biggest spend this month: ₹5 (TV)'])
    })
  })

  describe('ranking and cap', () => {
    const busy = facts({
      people_overdue: [{ person_id: 'a', name: 'Arun', overdue_paise: 1_000_000, days_late: 12, entry_id: 'e1' }],
      cards: [{ id: 'c1', name: 'HDFC', outstanding_paise: 6_000_000, limit_paise: 10_000_000, due_day: 17 }],
      for_others_aged: [{ entry_id: 'e2', name: 'Meera', left_paise: 100_000, days: 40 }],
      budgets: [{ category_id: 'c', name: 'Food', limit_paise: 100_000, spent_paise: 120_000 }],
      categories: [{ id: 'c', name: 'Food', this_paise: 300_000, prev_to_date_paise: 100_000 }],
      streak: { early_this_year: 5, late_this_year: 2, early_in_a_row: 3 },
      largest_spend: { id: 't', title: null, amount_paise: 9_000, date: '2026-11-03', category: 'Food' },
    })
    it('shows five at most, most important first (over budget, late friend, bill, …) and drops the least important', () => {
      const r = buildInsights(busy, today)
      expect(r).toHaveLength(T.MAX_SHOWN)
      expect(r.map((i) => i.id)).toEqual(['budget:c', 'overdue:a', 'bill:c1', 'for-others:e2', 'utilisation:c1'])
    })
    it('property: never more than five, sorted by severity, unique ids, deterministic', () => {
      const arb = fc.record({
        days: fc.integer({ min: 0, max: 200 }), paise: fc.integer({ min: 0, max: 5_000_000 }), due: fc.option(fc.integer({ min: 1, max: 31 }), { nil: null }),
        late: fc.integer({ min: 0, max: 5 }), early: fc.integer({ min: 0, max: 9 }), spent: fc.integer({ min: 0, max: 400_000 }), elapsed: fc.integer({ min: 1, max: 30 }),
      })
      fc.assert(fc.property(arb, (v) => {
        const f = facts({
          month: { spent_paise: v.spent, prev_total_paise: 200_000, days_elapsed: v.elapsed, days_in_month: 30 },
          people_overdue: [{ person_id: 'p', name: 'P', overdue_paise: v.paise, days_late: v.days, entry_id: 'e' }],
          cards: [{ id: 'c', name: 'C', outstanding_paise: v.paise, limit_paise: 3_000_000, due_day: v.due }],
          for_others_aged: [{ entry_id: 'g', name: 'G', left_paise: v.paise, days: v.days }],
          streak: { early_this_year: v.early, late_this_year: v.late, early_in_a_row: Math.min(v.early, 3) },
          budgets: [{ category_id: null, name: 'Overall', limit_paise: 300_000, spent_paise: v.spent }],
          categories: [{ id: 'k', name: 'K', this_paise: v.spent, prev_to_date_paise: 100_000 }],
        })
        const a = buildInsights(f, today)
        expect(a.length).toBeLessThanOrEqual(5)
        expect(a.map((i) => i.severity)).toEqual([...a.map((i) => i.severity)].sort((x, y) => y - x))
        expect(new Set(a.map((i) => i.id)).size).toBe(a.length)
        expect(buildInsights(f, today)).toEqual(a)
        for (const i of a) expect(i.text.length).toBeGreaterThan(0)
      }))
    })
  })
})

describe('parseFacts', () => {
  it('takes the RPC result as is', () => {
    const raw = { month: { spent_paise: 5, prev_total_paise: 4, days_elapsed: 2, days_in_month: 30 }, categories: [{ id: null, name: 'X', this_paise: 1, prev_to_date_paise: 2 }], streak: { early_this_year: 1, late_this_year: 0, early_in_a_row: 1 }, top_account: { id: 'a', name: 'Cash', count: 4 } }
    const f = parseFacts(raw)
    expect(f.month.spent_paise).toBe(5)
    expect(f.categories).toHaveLength(1)
    expect(f.top_account?.name).toBe('Cash')
    expect(f.cards).toEqual([])
  })
  it('missing or malformed parts become empty; junk input gives empty facts', () => {
    expect(parseFacts(null)).toEqual(EMPTY_FACTS)
    expect(parseFacts('x')).toEqual(EMPTY_FACTS)
    const f = parseFacts({ categories: 'no', cards: {}, month: [], streak: 3, largest_spend: 'x', top_account: 5, largest_outstanding: [1] })
    expect(f.categories).toEqual([])
    expect(f.cards).toEqual([])
    expect(f.month).toEqual(EMPTY_FACTS.month)
    expect(f.streak).toEqual(EMPTY_FACTS.streak)
    expect(f.largest_spend).toBeNull()
    expect(f.top_account).toBeNull()
    expect(buildInsights(f, today)).toEqual([])
  })
  it('a partial object fills the missing numbers from the defaults', () => {
    expect(parseFacts({ month: { spent_paise: 9 } }).month).toEqual({ ...EMPTY_FACTS.month, spent_paise: 9 })
  })
})
