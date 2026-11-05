import { describe, expect, it } from 'vitest'
import { defaultLendTitle, lendPreview, parseRatePercent, validateLend, type LendForm } from './lend'

const form = (o: Partial<LendForm> = {}): LendForm => ({
  kind: 'lent', amount: '10000', title: '', personText: 'Ravi', personId: null, accountId: 'acc', date: '2026-11-05', due: '', interest: 'none', rate: '', notes: '', ...o,
})

describe('parseRatePercent', () => {
  it('turns percent into basis points', () => {
    expect(parseRatePercent('12')).toBe(1200)
    expect(parseRatePercent(' 1.5 ')).toBe(150)
    expect(parseRatePercent('0.01')).toBe(1)
    expect(parseRatePercent('1000')).toBe(100_000)
  })
  it('rejects nonsense', () => {
    for (const bad of ['', 'abc', '-1', '0', '0.001', '1001', '1.234', '1,5']) expect(parseRatePercent(bad), bad).toBeNull()
  })
})

describe('validateLend', () => {
  it('accepts the basics and fills a default title', () => {
    const r = validateLend(form())
    expect(r).toMatchObject({ ok: true, input: { kind: 'lent', personName: 'Ravi', personId: null, title: 'Lent to Ravi', amount_paise: 1_000_000, due_date: null, interest: 'none', rate_bps: 0 } })
    expect(validateLend(form({ kind: 'borrowed', title: ' Rent help ' }))).toMatchObject({ ok: true, input: { title: 'Rent help' } })
    expect(defaultLendTitle('borrowed', 'Meera')).toBe('Borrowed from Meera')
  })
  it('amount expressions work', () => expect(validateLend(form({ amount: '5000+2500' }))).toMatchObject({ ok: true, input: { amount_paise: 750_000 } }))
  it('requires amount, person and account', () => {
    const r = validateLend(form({ amount: '', personText: '  ', accountId: null }))
    expect(r).toEqual({ ok: false, errors: { amount: 'Enter an amount', person: 'Who is it with?', account: 'Pick an account' } })
    expect(validateLend(form({ amount: 'abc' }))).toMatchObject({ ok: false, errors: { amount: 'Enter a valid amount' } })
    expect(validateLend(form({ amount: '0' }))).toMatchObject({ ok: false })
    expect(validateLend(form({ personText: 'x'.repeat(101) }))).toMatchObject({ ok: false, errors: { person: expect.any(String) } })
  })
  it('due date cannot precede the start date', () => {
    expect(validateLend(form({ due: '2026-11-01' }))).toMatchObject({ ok: false, errors: { due: 'The due date is before the start date' } })
    expect(validateLend(form({ due: '2026-11-05' }))).toMatchObject({ ok: true, input: { due_date: '2026-11-05' } })
  })
  it('interest needs a valid rate; simple also needs a due date', () => {
    expect(validateLend(form({ interest: 'flat', rate: '' }))).toMatchObject({ ok: false, errors: { rate: expect.any(String) } })
    expect(validateLend(form({ interest: 'flat', rate: '10' }))).toMatchObject({ ok: true, input: { interest: 'flat', rate_bps: 1000 } })
    expect(validateLend(form({ interest: 'simple', rate: '12' }))).toMatchObject({ ok: false, errors: { due: 'Simple interest needs a due date' } })
    expect(validateLend(form({ interest: 'simple', rate: '12', due: '2027-01-05' }))).toMatchObject({ ok: true })
  })
  it('keeps the chosen person id', () => expect(validateLend(form({ personId: 'p1' }))).toMatchObject({ ok: true, input: { personId: 'p1' } }))
})

describe('lendPreview', () => {
  it('shows nothing without interest or with incomplete input', () => {
    expect(lendPreview(form())).toBeNull()
    expect(lendPreview(form({ interest: 'flat', rate: '' }))).toBeNull()
    expect(lendPreview(form({ interest: 'flat', rate: '10', amount: '' }))).toBeNull()
    expect(lendPreview(form({ interest: 'simple', rate: '12' }))).toBeNull()
    expect(lendPreview(form({ interest: 'simple', rate: '12', due: '2026-10-01' }))).toBeNull()
  })
  it('flat: principal plus one-time percentage', () => expect(lendPreview(form({ interest: 'flat', rate: '10' }))).toBe('You get back ₹11,000 (₹1,000 interest)'))
  it('simple: days to due / 365; borrowed wording', () => {
    expect(lendPreview(form({ kind: 'borrowed', interest: 'simple', rate: '12', amount: '10000', date: '2026-01-01', due: '2026-07-01' })))
      .toBe('You pay back ₹10,595.07 (₹595.07 interest)')
  })
})
