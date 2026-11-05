import { describe, expect, it } from 'vitest'
import { emptyPlanForm, formToSpec, modeLabel, needsCount, needsRate, previewFor, usesInterestChips } from './planForm'

const form = (o = {}) => ({ ...emptyPlanForm('2026-12-05'), count: '10', ...o })

describe('plan form', () => {
  it('starts empty on the equal split', () => expect(emptyPlanForm('2026-12-05')).toMatchObject({ mode: 'equal', count: '', interest: 'none', dates: [] }))

  it('converts typed text into a spec and drops what is invalid', () => {
    expect(formToSpec(form(), 5_000_000)).toMatchObject({ mode: 'equal', principal: 5_000_000, count: 10, firstDate: '2026-12-05', rateBps: undefined })
    expect(formToSpec(form({ count: 'ten' }), 1)).toMatchObject({ count: undefined })
    expect(formToSpec(form({ mode: 'installment', amount: '5,000' }), 1).amount).toBe(500_000)
    expect(formToSpec(form({ mode: 'installment', amount: '2500+2500' }), 1).amount).toBe(500_000)
    expect(formToSpec(form({ mode: 'installment', amount: 'abc' }), 1).amount).toBeUndefined()
    expect(formToSpec(form({ interest: 'flat', rate: '10' }), 1)).toMatchObject({ interest: 'flat', rateBps: 1000 })
    expect(formToSpec(form({ mode: 'emi', rate: '12.5' }), 1)).toMatchObject({ interest: undefined, rateBps: 1250 })
  })

  it('custom dates are sorted and the first one is the first date', () => {
    const s = formToSpec(form({ mode: 'custom', dates: ['2027-02-01', '', '2026-12-20'] }), 1)
    expect(s.dates).toEqual(['2026-12-20', '2027-02-01'])
    expect(s.firstDate).toBe('2026-12-20')
    expect(formToSpec(form({ mode: 'custom' }), 1).firstDate).toBe('')
  })

  it('previews live: scenario C numbers; null until there is an amount; message when incomplete', () => {
    expect(previewFor(form(), 0)).toBeNull()
    const c = previewFor(form({ mode: 'nocost', count: '9', firstDate: '2026-12-10' }), 5_400_000)
    expect(c && c.ok && c.preview).toMatchObject({ count: 9, monthly: 600_000, totalInterest: 0, lastDate: '2027-08-10' })
    expect(previewFor(form({ count: '' }), 100)).toEqual({ ok: false, error: 'How many instalments?' })
    expect(previewFor(form({ mode: 'emi' }), 100)).toEqual({ ok: false, error: 'Enter an interest rate' })
  })

  it('knows which fields each mode needs', () => {
    expect(['equal', 'weekly', 'installment', 'custom'].every((m) => usesInterestChips(m as never))).toBe(true)
    expect(usesInterestChips('emi')).toBe(false)
    expect(usesInterestChips('nocost')).toBe(false)
    expect(needsCount('equal') && needsCount('weekly') && needsCount('emi') && needsCount('nocost')).toBe(true)
    expect(needsCount('installment') || needsCount('custom')).toBe(false)
    expect(needsRate(form({ mode: 'emi' }))).toBe(true)
    expect(needsRate(form({ interest: 'flat' }))).toBe(true)
    expect(needsRate(form())).toBe(false)
    expect(needsRate(form({ mode: 'nocost' }))).toBe(false)
  })

  it('modeLabel', () => {
    expect(modeLabel('nocost')).toBe('No-cost EMI')
    expect(modeLabel('weekly')).toBe('Weekly')
  })
})
