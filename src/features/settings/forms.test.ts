import { describe, expect, it } from 'vitest'
import type { Account, Category } from '@/lib/db'
import { accountToForm, categoryToForm, emptyAccountForm, emptyCategoryForm, validateAccount, validateCategory } from './forms'

const base = { ...emptyAccountForm(), name: 'HDFC' }

describe('validateAccount', () => {
  it('a plain bank account', () => {
    expect(validateAccount({ ...base, opening: '1,500.50' })).toEqual({
      ok: true,
      values: { name: 'HDFC', type: 'bank', color: '#3b82f6', credit_limit_paise: null, statement_day: null, due_day: null, opening_balance_paise: 150_050 },
    })
  })
  it('a blank opening balance is zero; negative balances are allowed (overdraft)', () => {
    expect(validateAccount(base)).toMatchObject({ ok: true, values: { opening_balance_paise: 0 } })
    expect(validateAccount({ ...base, opening: '-200' })).toMatchObject({ ok: true, values: { opening_balance_paise: -20_000 } })
  })
  it('a credit card stores what you already owe as a negative balance, with limit and days', () => {
    const r = validateAccount({ ...base, type: 'credit_card', opening: '12000', limit: '100000', statementDay: '5', dueDay: '25' })
    expect(r).toMatchObject({ ok: true, values: { opening_balance_paise: -1_200_000, credit_limit_paise: 10_000_000, statement_day: 5, due_day: 25 } })
    expect(validateAccount({ ...base, type: 'credit_card' })).toMatchObject({ ok: true, values: { opening_balance_paise: 0, credit_limit_paise: null } })
  })
  it('limit and days are ignored for non-cards', () => {
    expect(validateAccount({ ...base, limit: '5000', statementDay: '9' })).toMatchObject({ ok: true, values: { credit_limit_paise: null, statement_day: null } })
  })
  it('reports field errors', () => {
    expect(validateAccount({ ...base, name: '  ' })).toEqual({ ok: false, errors: { name: 'Enter a name' } })
    expect(validateAccount({ ...base, name: 'x'.repeat(41) })).toMatchObject({ ok: false, errors: { name: expect.any(String) } })
    expect(validateAccount({ ...base, opening: 'abc' })).toMatchObject({ ok: false, errors: { opening: expect.any(String) } })
    const bad = validateAccount({ ...base, type: 'credit_card', limit: '0', statementDay: '32', dueDay: 'x' })
    expect(bad).toMatchObject({ ok: false, errors: { limit: expect.any(String), statementDay: expect.any(String), dueDay: expect.any(String) } })
  })
})

describe('accountToForm round trip', () => {
  const acct = (o: Partial<Account>): Account => ({
    id: 'a', name: 'Card', type: 'credit_card', opening_balance_paise: -1_200_000, credit_limit_paise: 10_000_000, statement_day: 5, due_day: 25,
    color: '#ef4444', sort: 0, archived: false, user_id: 'u', ...o,
  })
  it('editing a card shows the owed amount as positive and re-validates to the same values', () => {
    const form = accountToForm(acct({}))
    expect(form).toMatchObject({ opening: '12000', limit: '100000', statementDay: '5', dueDay: '25' })
    expect(validateAccount(form)).toMatchObject({ ok: true, values: { opening_balance_paise: -1_200_000, credit_limit_paise: 10_000_000 } })
  })
  it('zero balance shows blank; non-card keeps its sign', () => {
    expect(accountToForm(acct({ type: 'cash', opening_balance_paise: 0, credit_limit_paise: null, statement_day: null, due_day: null, color: null }))).toMatchObject({ opening: '', limit: '', color: '#3b82f6' })
    expect(accountToForm(acct({ type: 'bank', opening_balance_paise: -5000 })).opening).toBe('-50')
  })
})

describe('categories', () => {
  it('validates name and keeps kind, icon and colour', () => {
    expect(validateCategory({ ...emptyCategoryForm('income'), name: ' Salary ', icon: '💼' })).toEqual({
      ok: true, values: { name: 'Salary', kind: 'income', icon: '💼', color: '#3b82f6' },
    })
    expect(validateCategory({ ...emptyCategoryForm(), name: 'Misc' })).toMatchObject({ ok: true, values: { icon: null } })
    expect(validateCategory(emptyCategoryForm())).toEqual({ ok: false, errors: { name: 'Enter a name' } })
    expect(validateCategory({ ...emptyCategoryForm(), name: 'x'.repeat(31) })).toMatchObject({ ok: false })
  })
  it('categoryToForm fills defaults', () => {
    const c = { id: 'c', name: 'Food', kind: 'expense', icon: null, color: null, sort: 0, archived: false, user_id: 'u' } as Category
    expect(categoryToForm(c)).toEqual({ name: 'Food', kind: 'expense', icon: '', color: '#3b82f6' })
  })
})
