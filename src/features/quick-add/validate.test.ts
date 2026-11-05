import { describe, expect, it } from 'vitest'
import { parseTags, validateQuickAdd, type QuickAddForm } from './validate'

const form = (o: Partial<QuickAddForm> = {}): QuickAddForm => ({
  kind: 'expense', amount: '120', title: '', categoryId: 'food', accountId: 'cash', toAccountId: null, date: '2026-11-05',
  place: '', notes: '', tags: '', ...o,
})

describe('validateQuickAdd', () => {
  it('scenario E: 120 + Food + default account', () => {
    expect(validateQuickAdd(form())).toEqual({
      ok: true,
      input: { kind: 'expense', amount_paise: 12_000, date: '2026-11-05', account_id: 'cash', to_account_id: null, category_id: 'food', title: null, place: null, notes: null, tags: [] },
    })
  })
  it('evaluates expressions: 450+120 saves 57,000 paise', () => {
    expect(validateQuickAdd(form({ amount: '450+120' }))).toMatchObject({ ok: true, input: { amount_paise: 57_000 } })
  })
  it('trims text and parses tags', () => {
    expect(validateQuickAdd(form({ title: '  Lunch ', place: ' Cafe ', notes: ' x ', tags: '#Work, trip work' }))).toMatchObject({
      ok: true, input: { title: 'Lunch', place: 'Cafe', notes: 'x', tags: ['work', 'trip'] },
    })
  })
  it('requires a positive amount', () => {
    expect(validateQuickAdd(form({ amount: '' }))).toEqual({ ok: false, errors: { amount: 'Enter an amount' } })
    expect(validateQuickAdd(form({ amount: '12+' }))).toMatchObject({ ok: false, errors: { amount: 'Enter a valid amount' } })
    expect(validateQuickAdd(form({ amount: '0' }))).toMatchObject({ ok: false, errors: { amount: 'Enter a valid amount' } })
    expect(validateQuickAdd(form({ amount: '5-10' }))).toMatchObject({ ok: false, errors: { amount: 'Enter a valid amount' } })
  })
  it('requires an account', () => {
    expect(validateQuickAdd(form({ accountId: null }))).toEqual({ ok: false, errors: { account: 'Pick an account' } })
  })
  it('transfers need two different accounts and drop the category', () => {
    expect(validateQuickAdd(form({ kind: 'transfer' }))).toMatchObject({ ok: false, errors: { toAccount: 'Pick where it goes' } })
    expect(validateQuickAdd(form({ kind: 'transfer', toAccountId: 'cash' }))).toMatchObject({ ok: false, errors: { toAccount: 'Choose two different accounts' } })
    expect(validateQuickAdd(form({ kind: 'transfer', toAccountId: 'card' }))).toMatchObject({
      ok: true, input: { kind: 'transfer', to_account_id: 'card', category_id: null },
    })
  })
  it('non-transfers never carry a destination account', () => {
    expect(validateQuickAdd(form({ toAccountId: 'card' }))).toMatchObject({ ok: true, input: { to_account_id: null } })
  })
  it('collects several errors at once', () => {
    expect(validateQuickAdd(form({ amount: '', accountId: null }))).toMatchObject({ ok: false, errors: { amount: expect.any(String), account: expect.any(String) } })
  })
})

describe('parseTags', () => {
  it('lowercases, strips #, de-duplicates and caps at 10', () => {
    expect(parseTags('A, #b  a')).toEqual(['a', 'b'])
    expect(parseTags('')).toEqual([])
    expect(parseTags(Array.from({ length: 15 }, (_, i) => `t${i}`).join(' '))).toHaveLength(10)
  })
})
