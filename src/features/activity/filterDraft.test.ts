import { describe, expect, it } from 'vitest'
import { draftToFilters, filtersToDraft, type FilterDraft } from './filterDraft'
import type { ActivityFilters } from './filters'

const empty = filtersToDraft({})
const d = (o: Partial<FilterDraft>): FilterDraft => ({ ...empty, ...o })

describe('filtersToDraft', () => {
  it('an empty filter set is an empty draft', () => {
    expect(empty).toEqual({ preset: '', from: '', to: '', kinds: [], accounts: [], categories: [], min: '', max: '', place: '', tag: '' })
  })
  it('shows amounts in rupees', () => {
    expect(filtersToDraft({ min: 150_000, max: 99_950 })).toMatchObject({ min: '1500', max: '999.5' })
  })
})

describe('draftToFilters', () => {
  it('round-trips every field', () => {
    const f: ActivityFilters = {
      preset: 'custom', from: '2026-01-01', to: '2026-02-01', kinds: ['spend'], accounts: ['a'], categories: ['c'],
      min: 100, max: 500_000, place: 'Cafe', tag: 'work',
    }
    expect(draftToFilters(filtersToDraft(f))).toEqual({ ok: true, filters: f })
  })
  it('an empty draft means no filters; search text is carried over', () => {
    expect(draftToFilters(empty)).toEqual({ ok: true, filters: {} })
    expect(draftToFilters(empty, 'chai')).toEqual({ ok: true, filters: { q: 'chai' } })
  })
  it('ignores dates unless the preset is custom', () => {
    expect(draftToFilters(d({ preset: 'week', from: '2026-01-01', to: '2026-02-01' }))).toEqual({ ok: true, filters: { preset: 'week' } })
  })
  it('custom dates: one side is enough; both missing, invalid or reversed are errors', () => {
    expect(draftToFilters(d({ preset: 'custom', from: '2026-01-01' }))).toEqual({ ok: true, filters: { preset: 'custom', from: '2026-01-01' } })
    expect(draftToFilters(d({ preset: 'custom' }))).toEqual({ ok: false, errors: { dates: 'Pick at least one date' } })
    expect(draftToFilters(d({ preset: 'custom', from: '2026-02-30' }))).toEqual({ ok: false, errors: { dates: 'Enter valid dates' } })
    expect(draftToFilters(d({ preset: 'custom', from: '2026-03-01', to: '2026-01-01' }))).toEqual({ ok: false, errors: { dates: 'Start is after the end' } })
  })
  it('validates amounts', () => {
    expect(draftToFilters(d({ min: 'abc' }))).toMatchObject({ ok: false, errors: { min: 'Enter a valid amount' } })
    expect(draftToFilters(d({ max: '-5' }))).toMatchObject({ ok: false, errors: { max: 'Enter a valid amount' } })
    expect(draftToFilters(d({ min: '500', max: '100' }))).toMatchObject({ ok: false, errors: { max: 'Maximum is below the minimum' } })
    expect(draftToFilters(d({ min: '100', max: '100' }))).toEqual({ ok: true, filters: { min: 10_000, max: 10_000 } })
    expect(draftToFilters(d({ min: '0' }))).toEqual({ ok: true, filters: { min: 0 } })
  })
  it('trims place and normalises the tag', () => {
    expect(draftToFilters(d({ place: '  Cafe ', tag: ' #Work ' }))).toEqual({ ok: true, filters: { place: 'Cafe', tag: 'work' } })
    expect(draftToFilters(d({ place: '  ', tag: '' }))).toEqual({ ok: true, filters: {} })
  })
})
