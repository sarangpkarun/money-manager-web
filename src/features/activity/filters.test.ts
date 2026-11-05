import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  activeFilterCount, monthRange, parseFilters, presetRange, resolveRange, serializeFilters, toRpcFilters,
  type ActivityFilters,
} from './filters'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const sp = (s: string) => new URLSearchParams(s)

describe('presetRange (today = Thu 5 Nov 2026)', () => {
  const today = '2026-11-05'
  it.each([
    ['today', { from: '2026-11-05', to: '2026-11-05' }],
    ['week', { from: '2026-11-02', to: '2026-11-08' }],
    ['month', { from: '2026-11-01', to: '2026-11-30' }],
    ['last_month', { from: '2026-10-01', to: '2026-10-31' }],
    ['year', { from: '2026-01-01', to: '2026-12-31' }],
  ] as const)('%s', (p, range) => expect(presetRange(p, today)).toEqual(range))
  it('week can start on Sunday', () => expect(presetRange('week', today, 0)).toEqual({ from: '2026-11-01', to: '2026-11-07' }))
  it('last month across a year boundary', () => expect(presetRange('last_month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' }))
  it('custom has no fixed range', () => expect(presetRange('custom', today)).toBeNull())
})

describe('resolveRange', () => {
  const today = '2026-11-05'
  it('defaults to the month picked in the month switcher', () => {
    expect(resolveRange({}, today, '2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })
  it('a preset overrides the month', () => expect(resolveRange({ preset: 'today' }, today, '2026-09')).toEqual({ from: today, to: today }))
  it('custom uses from/to, open-ended on a missing side', () => {
    expect(resolveRange({ preset: 'custom', from: '2026-01-01', to: '2026-02-01' }, today, '2026-09')).toEqual({ from: '2026-01-01', to: '2026-02-01' })
    expect(resolveRange({ preset: 'custom', from: '2026-01-01' }, today, '2026-09').to).toBe('9999-12-31')
    expect(resolveRange({ preset: 'custom', to: '2026-02-01' }, today, '2026-09').from).toBe('0001-01-01')
  })
  it('custom with no dates falls back to the month', () => {
    expect(resolveRange({ preset: 'custom' }, today, '2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })
})

describe('URL round trip', () => {
  const full: ActivityFilters = {
    preset: 'custom', from: '2026-01-01', to: '2026-02-01', kinds: ['spend', 'transfer'], accounts: [A, B],
    categories: [A], min: 1000, max: 500000, q: 'chai', place: 'Cafe', tag: 'work',
  }
  it('serialises and parses back to the same filters', () => {
    expect(parseFilters(serializeFilters(full))).toEqual(full)
  })
  it('an empty filter set is an empty query', () => expect(serializeFilters({}).toString()).toBe(''))
  it('dates are only kept for the custom preset', () => {
    expect(parseFilters(sp('d=month&from=2026-01-01&to=2026-02-01'))).toEqual({ preset: 'month' })
    expect(serializeFilters({ preset: 'month', from: '2026-01-01' }).toString()).toBe('d=month')
  })
  it('swaps a reversed custom range', () => {
    expect(parseFilters(sp('d=custom&from=2026-03-01&to=2026-01-01'))).toEqual({ preset: 'custom', from: '2026-01-01', to: '2026-03-01' })
  })
  it('drops invalid values instead of failing', () => {
    expect(parseFilters(sp('d=nope&type=spend,bogus&acc=not-a-uuid&min=-5&max=abc&q=%20%20&from=2026-02-30'))).toEqual({})
    expect(parseFilters(sp(`type=spend&acc=${A}&min=100`))).toEqual({ kinds: ['spend'], accounts: [A], min: 100 })
  })
  it('round-trips arbitrary valid filters', () => {
    const word = fc.stringMatching(/^[A-Za-z0-9 ]{1,20}$/).filter((s) => s.trim().length > 0).map((s) => s.trim())
    fc.assert(
      fc.property(
        fc.record({
          kinds: fc.option(fc.subarray(['spend', 'received', 'transfer'] as const, { minLength: 1 }), { nil: undefined }),
          min: fc.option(fc.integer({ min: 0, max: 1e9 }), { nil: undefined }),
          max: fc.option(fc.integer({ min: 0, max: 1e9 }), { nil: undefined }),
          q: fc.option(word, { nil: undefined }),
          place: fc.option(word, { nil: undefined }),
        }),
        (f) => {
          const clean = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) as ActivityFilters
          return JSON.stringify(parseFilters(serializeFilters(clean))) === JSON.stringify(clean)
        },
      ),
    )
  })
})

describe('toRpcFilters', () => {
  it('maps UI kinds to database kinds and always sends a date range', () => {
    const r = toRpcFilters({ kinds: ['spend', 'received'], accounts: [A], min: 5, q: 'x' }, '2026-11-05', '2026-11')
    expect(r).toEqual({ from: '2026-11-01', to: '2026-11-30', kinds: ['expense', 'income'], accounts: [A], min: 5, q: 'x' })
  })
  it('includes every optional filter when set', () => {
    const r = toRpcFilters({ categories: [B], max: 9, place: 'p', tag: 't' }, '2026-11-05', '2026-11')
    expect(r).toMatchObject({ categories: [B], max: 9, place: 'p', tag: 't' })
  })
})

describe('activeFilterCount', () => {
  it('counts each active filter once; search text is not counted', () => {
    expect(activeFilterCount({})).toBe(0)
    expect(activeFilterCount({ q: 'x' })).toBe(0)
    expect(activeFilterCount({ preset: 'today', kinds: ['spend'], accounts: [A], categories: [B], min: 1, max: 2, place: 'p', tag: 't' })).toBe(7)
  })
})
