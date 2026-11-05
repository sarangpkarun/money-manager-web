import { z } from 'zod'
import { addDays, endOfMonth, startOfMonth, startOfWeek, isValidDate, addMonths, type DateStr } from '@/lib/dates'

export const DATE_PRESETS = ['today', 'week', 'month', 'last_month', 'year', 'custom'] as const
export type DatePreset = (typeof DATE_PRESETS)[number]

/** UI-level transaction types. Entry-based types (lent, on behalf, borrowed, EMI, instalment) arrive in later phases. */
export const UI_KINDS = ['spend', 'received', 'transfer'] as const
export type UiKind = (typeof UI_KINDS)[number]
const KIND_TO_DB: Record<UiKind, string> = { spend: 'expense', received: 'income', transfer: 'transfer' }

export interface ActivityFilters {
  preset?: DatePreset
  from?: DateStr
  to?: DateStr
  kinds?: UiKind[]
  accounts?: string[]
  categories?: string[]
  /** paise */ min?: number
  /** paise */ max?: number
  q?: string
  place?: string
  tag?: string
}

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const csv = z.string().transform((s) => s.split(',').filter(Boolean))
const kindList = csv.pipe(z.array(z.enum(UI_KINDS)).min(1))
const uuidList = csv.pipe(z.array(uuid).min(1))
const text = z.string().trim().min(1).max(100)
const paise = z.string().regex(/^\d{1,15}$/).transform(Number)
const date = z.string().refine(isValidDate)

/** Reads filters from the URL; anything invalid is dropped rather than failing. */
export function parseFilters(sp: URLSearchParams): ActivityFilters {
  const pick = <T,>(key: string, schema: z.ZodType<T>): T | undefined => {
    const v = sp.get(key)
    if (v === null) return undefined
    const r = schema.safeParse(v)
    return r.success ? r.data : undefined
  }
  const out: ActivityFilters = {
    preset: pick('d', z.enum(DATE_PRESETS)),
    from: pick('from', date),
    to: pick('to', date),
    kinds: pick('type', kindList),
    accounts: pick('acc', uuidList),
    categories: pick('cat', uuidList),
    min: pick('min', paise),
    max: pick('max', paise),
    q: pick('q', text),
    place: pick('place', text),
    tag: pick('tag', text),
  }
  if (out.preset !== 'custom') {
    delete out.from
    delete out.to
  } else if (out.from && out.to && out.from > out.to) [out.from, out.to] = [out.to, out.from]
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as ActivityFilters
}

export function serializeFilters(f: ActivityFilters): URLSearchParams {
  const sp = new URLSearchParams()
  if (f.preset) sp.set('d', f.preset)
  if (f.preset === 'custom') {
    if (f.from) sp.set('from', f.from)
    if (f.to) sp.set('to', f.to)
  }
  if (f.kinds?.length) sp.set('type', f.kinds.join(','))
  if (f.accounts?.length) sp.set('acc', f.accounts.join(','))
  if (f.categories?.length) sp.set('cat', f.categories.join(','))
  if (f.min !== undefined) sp.set('min', String(f.min))
  if (f.max !== undefined) sp.set('max', String(f.max))
  if (f.q) sp.set('q', f.q)
  if (f.place) sp.set('place', f.place)
  if (f.tag) sp.set('tag', f.tag)
  return sp
}

export interface DateRange { from: DateStr; to: DateStr }

export const monthRange = (month: string): DateRange => ({ from: startOfMonth(`${month}-01`), to: endOfMonth(`${month}-01`) })

/** The date range a preset stands for (null = no explicit date filter). */
export function presetRange(p: DatePreset, today: DateStr, weekStartsOn: 0 | 1 = 1): DateRange | null {
  switch (p) {
    case 'today': return { from: today, to: today }
    case 'week': { const from = startOfWeek(today, weekStartsOn); return { from, to: addDays(from, 6) } }
    case 'month': return { from: startOfMonth(today), to: endOfMonth(today) }
    case 'last_month': { const prev = addMonths(startOfMonth(today), -1); return { from: startOfMonth(prev), to: endOfMonth(prev) } }
    case 'year': return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` }
    case 'custom': return null
  }
}

/** Effective date range: an explicit preset/custom range wins; otherwise the month picked in the month switcher. */
export function resolveRange(f: ActivityFilters, today: DateStr, month: string, weekStartsOn: 0 | 1 = 1): DateRange {
  if (f.preset === 'custom' && (f.from || f.to)) return { from: f.from ?? '0001-01-01', to: f.to ?? '9999-12-31' }
  if (f.preset && f.preset !== 'custom') return presetRange(f.preset, today, weekStartsOn) as DateRange
  return monthRange(month)
}

/** Filters as the `p_filters` JSON the search/summary RPCs expect. */
export function toRpcFilters(f: ActivityFilters, today: DateStr, month: string, weekStartsOn: 0 | 1 = 1): Record<string, unknown> {
  const r = resolveRange(f, today, month, weekStartsOn)
  const out: Record<string, unknown> = { from: r.from, to: r.to }
  if (f.kinds?.length) out.kinds = f.kinds.map((k) => KIND_TO_DB[k])
  if (f.accounts?.length) out.accounts = f.accounts
  if (f.categories?.length) out.categories = f.categories
  if (f.min !== undefined) out.min = f.min
  if (f.max !== undefined) out.max = f.max
  if (f.q) out.q = f.q
  if (f.place) out.place = f.place
  if (f.tag) out.tag = f.tag
  return out
}

/** Number shown on the filter badge (search text is not counted: it has its own box). */
export function activeFilterCount(f: ActivityFilters): number {
  return [f.preset, f.kinds?.length, f.accounts?.length, f.categories?.length, f.min !== undefined || f.max !== undefined, f.place, f.tag]
    .filter(Boolean).length
}
