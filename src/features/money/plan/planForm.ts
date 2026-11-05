import { PLAN_MODES, planPreview, type PlanMode, type PlanPreviewResult, type PlanSpec } from '@/lib/plan'
import type { SimpleKind } from '@/lib/interest'
import { evaluateAmount } from '@/features/quick-add/amount'
import { parseRatePercent } from '@/features/quick-add/lend'

/** The plan form as typed (all strings, so half-typed input is fine). */
export interface PlanFormState {
  mode: PlanMode
  count: string
  /** installment: amount of each row (rupees) */
  amount: string
  firstDate: string
  interest: SimpleKind
  /** percent, e.g. "12" */
  rate: string
  /** custom */
  dates: string[]
}

export const emptyPlanForm = (firstDate: string, mode: PlanMode = 'equal'): PlanFormState => ({
  mode, count: '', amount: '', firstDate, interest: 'none', rate: '', dates: [],
})

/** Modes that take interest from the interest chips (EMI modes carry their own). */
export const usesInterestChips = (m: PlanMode): boolean => m === 'equal' || m === 'weekly' || m === 'installment' || m === 'custom'
export const needsRate = (f: PlanFormState): boolean => f.mode === 'emi' || (usesInterestChips(f.mode) && f.interest !== 'none')
export const needsCount = (m: PlanMode): boolean => m === 'equal' || m === 'weekly' || m === 'emi' || m === 'nocost'

/** The spec for `planPreview` from what was typed. Fields that are empty or invalid stay undefined so the preview explains what is missing. */
export function formToSpec(f: PlanFormState, principal: number): PlanSpec {
  const count = /^\d{1,4}$/.test(f.count.trim()) ? Number(f.count) : undefined
  const amount = f.amount.trim() ? evaluateAmount(f.amount).paise ?? undefined : undefined
  const rateBps = parseRatePercent(f.rate) ?? undefined
  const dates = f.dates.filter(Boolean).sort()
  return {
    mode: f.mode, principal, count, amount, firstDate: f.mode === 'custom' ? (dates[0] ?? '') : f.firstDate,
    dates: f.mode === 'custom' ? dates : undefined,
    interest: usesInterestChips(f.mode) ? f.interest : undefined, rateBps,
  }
}

/** Preview, or null while there is nothing to preview yet (no amount typed). */
export function previewFor(f: PlanFormState, principal: number): PlanPreviewResult | null {
  if (!principal || principal <= 0) return null
  return planPreview(formToSpec(f, principal))
}

export const modeLabel = (m: PlanMode): string => PLAN_MODES.find((x) => x.value === m)?.label ?? m
