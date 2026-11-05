import { isValidDate } from '@/lib/dates'
import { parseRupees, toRupeeInput } from '@/lib/money'
import type { ActivityFilters, DatePreset, UiKind } from './filters'

/** What the filter sheet edits: strings for text inputs, arrays for chip groups. Applied only on "Apply". */
export interface FilterDraft {
  preset: DatePreset | ''
  from: string
  to: string
  kinds: UiKind[]
  accounts: string[]
  categories: string[]
  min: string
  max: string
  place: string
  tag: string
}

export function filtersToDraft(f: ActivityFilters): FilterDraft {
  return {
    preset: f.preset ?? '', from: f.from ?? '', to: f.to ?? '', kinds: f.kinds ?? [], accounts: f.accounts ?? [], categories: f.categories ?? [],
    min: f.min !== undefined ? toRupeeInput(f.min) : '', max: f.max !== undefined ? toRupeeInput(f.max) : '', place: f.place ?? '', tag: f.tag ?? '',
  }
}

export type DraftResult = { ok: true; filters: ActivityFilters } | { ok: false; errors: Record<string, string> }

/** `keepQ` carries over the search text, which has its own box outside the sheet. */
export function draftToFilters(d: FilterDraft, keepQ?: string): DraftResult {
  const errors: Record<string, string> = {}
  const f: ActivityFilters = {}

  if (d.preset) f.preset = d.preset
  if (d.preset === 'custom') {
    if (!d.from && !d.to) errors.dates = 'Pick at least one date'
    else if ((d.from && !isValidDate(d.from)) || (d.to && !isValidDate(d.to))) errors.dates = 'Enter valid dates'
    else if (d.from && d.to && d.from > d.to) errors.dates = 'Start is after the end'
    if (d.from) f.from = d.from
    if (d.to) f.to = d.to
  }

  const amount = (s: string, key: 'min' | 'max') => {
    if (!s.trim()) return undefined
    const p = parseRupees(s)
    if (p === null || p < 0) { errors[key] = 'Enter a valid amount'; return undefined }
    return p
  }
  const min = amount(d.min, 'min')
  const max = amount(d.max, 'max')
  if (min !== undefined && max !== undefined && min > max) errors.max = 'Maximum is below the minimum'
  if (min !== undefined) f.min = min
  if (max !== undefined) f.max = max

  if (d.kinds.length) f.kinds = d.kinds
  if (d.accounts.length) f.accounts = d.accounts
  if (d.categories.length) f.categories = d.categories
  if (d.place.trim()) f.place = d.place.trim()
  if (d.tag.trim()) f.tag = d.tag.trim().replace(/^#/, '').toLowerCase()
  if (keepQ) f.q = keepQ

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, filters: f }
}
