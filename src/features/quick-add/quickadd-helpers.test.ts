import { describe, expect, it } from 'vitest'
import { evaluateAmount } from './amount'
import { pickDefaultAccount, rankCategories } from './suggest'

describe('evaluateAmount', () => {
  it('plain amounts are not expressions', () => {
    expect(evaluateAmount('120')).toEqual({ paise: 12_000, isExpression: false, preview: null })
    expect(evaluateAmount('1,234.50').paise).toBe(123_450)
  })
  it('"450+120" evaluates to 57,000 paise with a preview', () => {
    expect(evaluateAmount('450+120')).toEqual({ paise: 57_000, isExpression: true, preview: '= ₹570' })
    expect(evaluateAmount('10/4').preview).toBe('= ₹2.50')
  })
  it('empty and invalid input give null', () => {
    expect(evaluateAmount('')).toEqual({ paise: null, isExpression: false, preview: null })
    expect(evaluateAmount('  ').paise).toBeNull()
    expect(evaluateAmount('12+').paise).toBeNull()
    expect(evaluateAmount('abc').paise).toBeNull()
  })
})

describe('rankCategories', () => {
  const cats = [
    { id: 'food', kind: 'expense', sort: 1 }, { id: 'groc', kind: 'expense', sort: 2 }, { id: 'travel', kind: 'expense', sort: 3 },
    { id: 'fuel', kind: 'expense', sort: 4 }, { id: 'salary', kind: 'income', sort: 1 },
  ]
  const tx = (cat: string, date: string, kind = 'expense') => ({ kind, category_id: cat, account_id: null, date })
  it('most-used first, then most recent, then saved order; other kinds excluded', () => {
    const recent = [tx('travel', '2026-11-01'), tx('travel', '2026-11-02'), tx('groc', '2026-11-03'), tx('fuel', '2026-10-01'), tx('salary', '2026-11-04', 'income')]
    expect(rankCategories(cats, recent, 'expense').map((c) => c.id)).toEqual(['travel', 'groc', 'fuel', 'food'])
    expect(rankCategories(cats, recent, 'income').map((c) => c.id)).toEqual(['salary'])
  })
  it('ties on count are broken by recency, then saved order', () => {
    const recent = [tx('fuel', '2026-11-05'), tx('groc', '2026-11-01')]
    expect(rankCategories(cats, recent, 'expense').map((c) => c.id)).toEqual(['fuel', 'groc', 'food', 'travel'])
    const same = [tx('travel', '2026-11-01'), tx('food', '2026-11-01')]
    expect(rankCategories(cats, same, 'expense').map((c) => c.id).slice(0, 2)).toEqual(['food', 'travel'])
  })
  it('falls back to saved order with no history and ignores uncategorised rows', () => {
    expect(rankCategories(cats, [], 'expense').map((c) => c.id)).toEqual(['food', 'groc', 'travel', 'fuel'])
    expect(rankCategories(cats, [{ kind: 'expense', category_id: null, account_id: null, date: '2026-11-01' }], 'expense')[0]?.id).toBe('food')
  })
})

describe('pickDefaultAccount', () => {
  const accs = [{ id: 'a', archived: true }, { id: 'b', archived: false }, { id: 'c', archived: null }]
  it('uses the last-used account when it is still active', () => expect(pickDefaultAccount(accs, 'c')?.id).toBe('c'))
  it('ignores archived or unknown last-used accounts and takes the first active', () => {
    expect(pickDefaultAccount(accs, 'a')?.id).toBe('b')
    expect(pickDefaultAccount(accs, 'zzz')?.id).toBe('b')
    expect(pickDefaultAccount(accs, null)?.id).toBe('b')
  })
  it('is undefined when there is no active account', () => expect(pickDefaultAccount([{ id: 'a', archived: true }], null)).toBeUndefined())
})
