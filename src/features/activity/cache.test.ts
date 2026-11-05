import { describe, expect, it } from 'vitest'
import type { Account, ActivityRow, Category } from '@/lib/db'
import { insertIntoPages, matchesFilters, removeFromPages, rowFromInput, type NewTxnInput } from './cache'

const input = (o: Partial<NewTxnInput> = {}): NewTxnInput => ({
  id: 'n1', kind: 'expense', amount_paise: 12_000, date: '2026-11-05', account_id: 'acc1', category_id: 'cat1', title: ' Lunch ', ...o,
})
const accounts = [{ id: 'acc1', name: 'Cash' }, { id: 'acc2', name: 'Bank' }] as Account[]
const categories = [{ id: 'cat1', name: 'Food', icon: '🍔', color: '#f00' }] as Category[]

describe('rowFromInput', () => {
  it('fills names, icons and trims text', () => {
    expect(rowFromInput(input({ place: ' Cafe ', notes: '  ' }), accounts, categories)).toMatchObject({
      id: 'n1', account_name: 'Cash', category_name: 'Food', category_icon: '🍔', title: 'Lunch', place: 'Cafe',
      notes: null, to_account_id: null, for_other_paise: 0, entry_id: null, tags: [],
    })
  })
  it('transfers carry the destination and no category', () => {
    const r = rowFromInput(input({ kind: 'transfer', to_account_id: 'acc2', category_id: 'cat1' }), accounts, categories)
    expect(r).toMatchObject({ to_account_id: 'acc2', to_account_name: 'Bank', category_id: null, category_name: null })
  })
  it('works before accounts and categories have loaded', () => {
    expect(rowFromInput(input())).toMatchObject({ account_name: null, category_name: null })
  })
})

describe('matchesFilters', () => {
  const row = rowFromInput(input({ amount_paise: 50_000 }), accounts, categories)
  it('checks date, kind, account, category and amount', () => {
    expect(matchesFilters(row, { from: '2026-11-01', to: '2026-11-30' })).toBe('yes')
    expect(matchesFilters(row, { from: '2026-11-06' })).toBe('no')
    expect(matchesFilters(row, { to: '2026-11-04' })).toBe('no')
    expect(matchesFilters(row, { kinds: ['income'] })).toBe('no')
    expect(matchesFilters(row, { kinds: ['expense', 'income'] })).toBe('yes')
    expect(matchesFilters(row, { accounts: ['acc2'] })).toBe('no')
    expect(matchesFilters(row, { accounts: ['acc1'] })).toBe('yes')
    expect(matchesFilters(row, { categories: ['x'] })).toBe('no')
    expect(matchesFilters(row, { min: 60_000 })).toBe('no')
    expect(matchesFilters(row, { max: 40_000 })).toBe('no')
    expect(matchesFilters(row, { min: 50_000, max: 50_000 })).toBe('yes')
  })
  it('an account filter also matches the destination of a transfer', () => {
    const t = rowFromInput(input({ kind: 'transfer', to_account_id: 'acc2' }), accounts, categories)
    expect(matchesFilters(t, { accounts: ['acc2'] })).toBe('yes')
  })
  it('text filters cannot be judged locally unless something already rules the row out', () => {
    expect(matchesFilters(row, { q: 'lunch' })).toBe('unknown')
    expect(matchesFilters(row, { place: 'x' })).toBe('unknown')
    expect(matchesFilters(row, { tag: 't' })).toBe('unknown')
    expect(matchesFilters(row, { q: 'lunch', from: '2027-01-01' })).toBe('no')
  })
})

type R = Pick<ActivityRow, 'id' | 'date'>
const r = (id: string, date: string): R => ({ id, date })

describe('page helpers', () => {
  it('insertIntoPages places by date, newest first within a day', () => {
    const pages = [[r('a', '2026-11-05'), r('b', '2026-11-03')], [r('c', '2026-11-01')]]
    expect(insertIntoPages(pages, r('n', '2026-11-05'))[0]?.map((x) => x.id)).toEqual(['n', 'a', 'b'])
    expect(insertIntoPages(pages, r('n', '2026-11-04'))[0]?.map((x) => x.id)).toEqual(['a', 'n', 'b'])
    expect(insertIntoPages(pages, r('n', '2026-11-09'))[0]?.map((x) => x.id)).toEqual(['n', 'a', 'b'])
  })
  it('a row older than everything on page one goes to the end of page one', () => {
    expect(insertIntoPages([[r('a', '2026-11-05')]], r('n', '2026-01-01'))[0]?.map((x) => x.id)).toEqual(['a', 'n'])
  })
  it('replaces an existing row with the same id (no duplicates) and leaves later pages alone', () => {
    const pages = [[r('a', '2026-11-05')], [r('n', '2026-10-01')]]
    const out = insertIntoPages(pages, r('n', '2026-11-05'))
    expect(out.flat().map((x) => x.id).sort()).toEqual(['a', 'n'])
    expect(out[1]).toEqual([])
  })
  it('works on an empty cache', () => {
    expect(insertIntoPages([], r('n', '2026-11-05'))).toEqual([[r('n', '2026-11-05')]])
  })
  it('removeFromPages drops the row everywhere', () => {
    expect(removeFromPages([[r('a', 'x'), r('b', 'y')], [r('a', 'z')]], 'a')).toEqual([[r('b', 'y')], []])
  })
})
