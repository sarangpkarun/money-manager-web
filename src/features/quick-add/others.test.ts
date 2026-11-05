import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { emptyPlanForm } from '@/features/money/plan/planForm'
import { equalShares, myShare, newOtherRow, othersPayload, suggestFor, validateOthers, type OtherRow } from './others'

const people = [{ id: 'arun', name: 'Arun' }, { id: 'meera', name: 'Meera' }, { id: 'ravi', name: 'Ravi Kumar' }]
const row = (o: Partial<OtherRow> = {}): OtherRow => ({ ...newOtherRow('k1', 'Arun', null, '300'), ...o })
const ok = (r: ReturnType<typeof validateOthers>) => { if (!r.ok) throw new Error(JSON.stringify(r.errors)); return r }

describe('equalShares / myShare', () => {
  it('splits the bill, the last friend takes the rounding', () => {
    expect(equalShares(1_000_000, 3)).toEqual([333_333, 333_333, 333_334])
    expect(equalShares(900_000, 3)).toEqual([300_000, 300_000, 300_000])
    expect(equalShares(500_000, 1)).toEqual([500_000])
    expect(equalShares(0, 3)).toEqual([])
    expect(equalShares(100, 0)).toEqual([])
  })
  it('property: shares always add up to the bill', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100_000_000 }), fc.integer({ min: 1, max: 12 }), (total, n) => {
      const s = equalShares(total, n)
      expect(s).toHaveLength(n)
      expect(s.reduce((a, b) => a + b, 0)).toBe(total)
    }))
  })
  it('your share is what is left, never negative; unknown while the bill is empty', () => {
    expect(myShare(500_000, 400_000)).toBe(100_000)
    expect(myShare(500_000, 600_000)).toBe(0)
    expect(myShare(null, 100)).toBeNull()
  })
})

describe('validateOthers', () => {
  it('one friend, the full amount', () => {
    const r = ok(validateOthers(30_000, [row({ amount: '300' })], people, '2026-11-10'))
    expect(r.owed).toBe(30_000)
    expect(r.items).toEqual([{ key: 'k1', entryId: null, personId: 'arun', personName: 'Arun', amount_paise: 30_000, due_date: null, rows: null }])
  })
  it('three-way split reconciles to the bill; shares can also be less than the bill (partial)', () => {
    const rows = [row({ key: 'a', amount: '100' }), row({ key: 'b', personText: 'Meera', amount: '100' }), row({ key: 'c', personText: 'Ravi Kumar', amount: '100' })]
    expect(ok(validateOthers(30_000, rows, people, '2026-11-10')).owed).toBe(30_000)
    expect(ok(validateOthers(50_000, [row({ amount: '400' })], people, '2026-11-10')).owed).toBe(40_000) // ₹5,000 bill, ₹4,000 for a friend
  })
  it('amount expressions and a due date work; a new name has no id yet', () => {
    const r = ok(validateOthers(100_000, [row({ personText: 'Priya', amount: '200+100', due: '2026-12-01' })], people, '2026-11-10'))
    expect(r.items[0]).toMatchObject({ personId: null, personName: 'Priya', amount_paise: 30_000, due_date: '2026-12-01' })
  })
  it('errors: no friends, no name, bad or missing amount, due before the purchase, duplicates, more than the bill', () => {
    const e = (rows: OtherRow[], total: number | null = 100_000) => { const r = validateOthers(total, rows, people, '2026-11-10'); return r.ok ? null : r.errors }
    expect(e([])).toEqual({ form: 'Choose who this was paid for' })
    expect(e([row({ personText: '  ' })])).toEqual({ k1: 'Who is it for?' })
    expect(e([row({ amount: '' })])).toEqual({ k1: 'Enter an amount' })
    expect(e([row({ amount: 'abc' })])).toEqual({ k1: 'Enter a valid amount' })
    expect(e([row({ amount: '0' })])).toEqual({ k1: 'Enter a valid amount' })
    expect(e([row({ due: '2026-11-01' })])).toEqual({ k1: 'The due date is before the purchase' })
    expect(e([row({ key: 'a' }), row({ key: 'b', personText: ' arun ' })])).toEqual({ b: 'arun is already on the list' })
    expect(e([row({ amount: '600' }), row({ key: 'b', personText: 'Meera', amount: '600' })], 100_000)).toEqual({ form: 'That is ₹200 more than the bill' })
    expect(e([row({ key: 'a', personText: 'Newbie' }), row({ key: 'b', personText: 'newbie' })])).toEqual({ b: 'newbie is already on the list' })
  })
  it('with no bill amount yet the total cannot be checked', () => expect(ok(validateOthers(null, [row()], people, '2026-11-10')).owed).toBe(30_000))

  it('a repayment plan sends rows instead of one due date; an incomplete plan is refused', () => {
    const plan = { ...emptyPlanForm('2026-12-01'), count: '3' }
    const r = ok(validateOthers(30_000, [row({ plan })], people, '2026-11-10'))
    expect(r.items[0]!.rows).toHaveLength(3)
    expect(r.items[0]!.rows!.reduce((s, x) => s + x.due_paise, 0)).toBe(30_000)
    expect(r.items[0]!.due_date).toBeNull()
    const bad = validateOthers(30_000, [row({ plan: emptyPlanForm('2026-12-01') })], people, '2026-11-10')
    expect(bad).toEqual({ ok: false, errors: { k1: 'How many instalments?' } })
    const interest = validateOthers(30_000, [row({ plan: { ...plan, interest: 'flat', rate: '10' } })], people, '2026-11-10')
    expect(interest).toEqual({ ok: false, errors: { k1: 'Money paid for a friend carries no interest' } })
  })
})

describe('othersPayload / suggestFor', () => {
  it('uses the person id (or the one created on save) and only sends what is set', () => {
    const r = ok(validateOthers(100_000, [row({ key: 'a', amount: '100', due: '2026-12-01' }), row({ key: 'b', personText: 'Priya', amount: '200' })], people, '2026-11-10'))
    expect(othersPayload(r.items, { b: 'new-id' })).toEqual([
      { person_id: 'arun', amount_paise: 10_000, due_date: '2026-12-01' }, { person_id: 'new-id', amount_paise: 20_000 },
    ])
    const withPlan = ok(validateOthers(30_000, [row({ plan: { ...emptyPlanForm('2026-12-01'), count: '2' } })], people, '2026-11-10'))
    expect(othersPayload(withPlan.items, {})[0]).toMatchObject({ person_id: 'arun', amount_paise: 30_000, rows: [expect.any(Object), expect.any(Object)] })
  })
  it('suggestions hide people already picked on other rows', () => {
    const rows = [row({ key: 'a', personId: 'arun' }), row({ key: 'b', personText: '', personId: null })]
    expect(suggestFor(people, rows, rows[1]!).map((p) => p.id)).toEqual(['meera', 'ravi'])
    expect(suggestFor(people, rows, rows[0]!).map((p) => p.id)).toContain('arun') // its own pick stays
  })
})
