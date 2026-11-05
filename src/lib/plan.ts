import type { DateStr } from './dates'
import type { Period, SimpleKind } from './interest'
import { formatMoney, type Paise } from './money'
import { buildSchedule, type PlanInput, type ScheduleRow } from './schedule'

/** What the user picks in the plan form. */
export type PlanMode = 'equal' | 'weekly' | 'installment' | 'custom' | 'emi' | 'nocost'

export interface PlanSpec {
  mode: PlanMode
  /** the amount the rows split: the loan, or price minus down payment for a purchase */
  principal: Paise
  /** equal, weekly, emi, nocost */
  count?: number
  /** installment: the fixed amount of each row */
  amount?: Paise
  firstDate: DateStr
  /** custom */
  dates?: DateStr[]
  /** none | flat | simple (custom: none | flat). Ignored for emi (reducing) and nocost. */
  interest?: SimpleKind
  rateBps?: number
}

export const PLAN_MODES: { value: PlanMode; label: string; hint: string }[] = [
  { value: 'equal', label: 'Equal split', hint: 'Same amount every month' },
  { value: 'installment', label: 'By amount', hint: 'Fixed amount each month' },
  { value: 'weekly', label: 'Weekly', hint: 'Same amount every week' },
  { value: 'custom', label: 'Custom dates', hint: 'You pick every date' },
  { value: 'emi', label: 'EMI with interest', hint: 'Reducing balance' },
  { value: 'nocost', label: 'No-cost EMI', hint: 'Seller absorbs the interest' },
]

/** The schedule input for a spec; throws RangeError (with a user-readable message) when something is missing. */
export function toPlanInput(s: PlanSpec): PlanInput {
  const need = (cond: boolean, msg: string) => { if (!cond) throw new RangeError(msg) }
  need(Number.isInteger(s.principal) && s.principal > 0, 'Enter an amount')
  need(!!s.firstDate, 'Choose the first date')
  const rateBps = s.rateBps ?? 0
  const kind = s.interest ?? 'none'
  const needRate = () => need(rateBps > 0, 'Enter an interest rate')
  switch (s.mode) {
    case 'equal':
    case 'weekly': {
      need(!!s.count && s.count >= 1, 'How many instalments?')
      if (kind !== 'none') needRate()
      return { mode: 'equal', principal: s.principal, count: s.count as number, firstDate: s.firstDate, period: s.mode === 'weekly' ? 'weekly' : 'monthly', interest: kind, rateBps }
    }
    case 'installment': {
      need(!!s.amount && s.amount > 0, 'Enter the amount of each instalment')
      if (kind !== 'none') needRate()
      return { mode: 'installment', principal: s.principal, amount: s.amount as number, firstDate: s.firstDate, period: 'monthly', interest: kind, rateBps }
    }
    case 'custom': {
      need(!!s.dates && s.dates.length >= 1, 'Add at least one date')
      if (kind === 'simple') throw new RangeError('Custom dates support no interest or flat interest')
      if (kind !== 'none') needRate()
      return { mode: 'custom', principal: s.principal, dates: s.dates as DateStr[], interest: kind === 'flat' ? 'flat' : 'none', rateBps }
    }
    case 'emi':
      need(!!s.count && s.count >= 1, 'How many months?')
      needRate()
      return { mode: 'reducing', principal: s.principal, count: s.count as number, firstDate: s.firstDate, rateBps }
    case 'nocost':
      need(!!s.count && s.count >= 1, 'How many months?')
      return { mode: 'reducing', principal: s.principal, count: s.count as number, firstDate: s.firstDate, rateBps, noCost: true }
  }
}

export interface PlanPreview {
  rows: ScheduleRow[]
  count: number
  /** the usual instalment (first row) */
  monthly: Paise
  /** true when the last row differs from the rest (rounding or a smaller remainder) */
  lastDiffers: boolean
  lastDue: Paise
  totalInterest: Paise
  totalPayable: Paise
  firstDate: DateStr
  lastDate: DateStr
}

export type PlanPreviewResult = { ok: true; preview: PlanPreview } | { ok: false; error: string }

export function planPreview(s: PlanSpec): PlanPreviewResult {
  try {
    const r = buildSchedule(toPlanInput(s))
    const first = r.rows[0] as ScheduleRow
    const last = r.rows[r.rows.length - 1] as ScheduleRow
    return {
      ok: true,
      preview: {
        rows: r.rows, count: r.rows.length, monthly: first.due_paise, lastDiffers: r.rows.length > 1 && last.due_paise !== first.due_paise, lastDue: last.due_paise,
        totalInterest: r.total_interest_paise, totalPayable: r.total_payable_paise, firstDate: first.due_date, lastDate: last.due_date,
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof RangeError ? e.message : 'Check the plan' }
  }
}

/** One-line summary under the form: "10 × ₹5,000 · interest ₹0 · last on 5 Sep 2027". */
export function planSummary(p: PlanPreview, period: Period = 'monthly'): string {
  const rows = p.lastDiffers ? `${p.count - 1} × ${formatMoney(p.monthly)} + ${formatMoney(p.lastDue)}` : `${p.count} × ${formatMoney(p.monthly)}`
  return `${rows} ${period === 'weekly' ? 'weekly' : ''}`.trim() + ` · interest ${formatMoney(p.totalInterest)} · last ${p.lastDate}`
}

export interface PlanRpcFields { interest: 'none' | 'flat' | 'simple' | 'reducing'; rateBps: number; noCost: boolean }

/** How the entry records its interest. A rate-less EMI is stored as interest-free. */
export function planRpcFields(s: PlanSpec, p: PlanPreview): PlanRpcFields {
  if (s.mode === 'nocost') return { interest: 'reducing', rateBps: s.rateBps ?? 0, noCost: true }
  if (p.totalInterest === 0) return { interest: 'none', rateBps: 0, noCost: false }
  if (s.mode === 'emi') return { interest: 'reducing', rateBps: s.rateBps ?? 0, noCost: false }
  return { interest: s.interest === 'simple' ? 'simple' : 'flat', rateBps: s.rateBps ?? 0, noCost: false }
}

/** Rows as `create_entry_with_plan` expects them. */
export const rowsPayload = (rows: ScheduleRow[]) =>
  rows.map(({ seq, due_date, due_paise, principal_paise, interest_paise }) => ({ seq, due_date, due_paise, principal_paise, interest_paise }))

/** Rows as the plan-edit RPCs expect them (full state, used as the "base" and as the new rows). */
export const rowsFull = (rows: ScheduleRow[]) =>
  rows.map(({ seq, due_date, due_paise, principal_paise, interest_paise, paid_paise, paid_on }) => ({ seq, due_date, due_paise, principal_paise, interest_paise, paid_paise, paid_on }))
