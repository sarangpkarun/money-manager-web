import { formToSpec, previewFor } from '@/features/money/plan/planForm'
import type { PlanFormState } from '@/features/money/plan/planForm'
import { matchPeople, normaliseName, type PersonLike } from '@/features/money/people'
import { formatMoney } from '@/lib/money'
import { planRpcFields, rowsPayload } from '@/lib/plan'
import { splitEqual } from '@/lib/schedule'
import { evaluateAmount } from './amount'

/** One friend in the "For someone else" form, as typed. */
export interface OtherRow {
  key: string
  personText: string
  /** chosen existing person; null = match by name or create on save */
  personId: string | null
  /** rupees, as typed */
  amount: string
  /** yyyy-MM-dd or '' */
  due: string
  /** a repayment plan instead of one due date */
  plan: PlanFormState | null
  /** edit mode: the existing entry of this friend */
  entryId?: string | null
}

export const newOtherRow = (key: string, personText = '', personId: string | null = null, amount = '', entryId: string | null = null): OtherRow => ({ key, personText, personId, amount, due: '', plan: null, entryId })

/** Equal shares of the bill for `n` friends (the last takes the rounding), in paise. */
export const equalShares = (total: number, n: number): number[] => (n <= 0 || total <= 0 ? [] : splitEqual(total, n))

/** What the purchase costs you: the bill minus what the friends owe (never below zero). */
export const myShare = (total: number | null, owed: number): number | null => (total === null ? null : Math.max(total - owed, 0))

export interface OtherItem {
  key: string
  entryId: string | null
  personId: string | null
  personName: string
  amount_paise: number
  due_date: string | null
  /** plan rows to send instead of one due date */
  rows: ReturnType<typeof rowsPayload> | null
}

export type OthersResult = { ok: true; items: OtherItem[]; owed: number } | { ok: false; errors: Record<string, string> }

/**
 * Checks the friends' rows against the bill. Errors are keyed by row key (and "form" for the whole list):
 * a person on every row (each person once), an amount above zero, the shares not above the bill, a valid plan.
 */
export function validateOthers(total: number | null, rows: OtherRow[], people: PersonLike[], startDate: string): OthersResult {
  const errors: Record<string, string> = {}
  const items: OtherItem[] = []
  const seen = new Set<string>()
  let owed = 0
  if (rows.length === 0) errors.form = 'Choose who this was paid for'
  for (const r of rows) {
    const name = r.personText.trim()
    const { paise } = evaluateAmount(r.amount)
    if (!name) { errors[r.key] = 'Who is it for?'; continue }
    const existing = r.personId ?? people.find((p) => normaliseName(p.name) === normaliseName(name))?.id ?? null
    const ident = existing ?? `new:${normaliseName(name)}`
    if (seen.has(ident)) { errors[r.key] = `${name} is already on the list`; continue }
    seen.add(ident)
    if (paise === null || paise <= 0) { errors[r.key] = r.amount.trim() ? 'Enter a valid amount' : 'Enter an amount'; continue }
    if (r.due && r.due < startDate) { errors[r.key] = 'The due date is before the purchase'; continue }
    let planRows: OtherItem['rows'] = null
    if (r.plan) {
      const pv = previewFor(r.plan, paise)
      if (!pv || !pv.ok) { errors[r.key] = pv && !pv.ok ? pv.error : 'Complete the plan'; continue }
      if (pv.preview.totalInterest !== 0 || planRpcFields(formToSpec(r.plan, paise), pv.preview).interest !== 'none') { errors[r.key] = 'Money paid for a friend carries no interest'; continue }
      planRows = rowsPayload(pv.preview.rows)
    }
    owed += paise
    items.push({ key: r.key, entryId: r.entryId ?? null, personId: existing, personName: name, amount_paise: paise, due_date: planRows ? null : r.due || null, rows: planRows })
  }
  if (total !== null && owed > total) errors.form = `That is ${formatMoney(owed - total)} more than the bill`
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, items, owed }
}



/** The `p_others` payload once every friend has an id. */
export function othersPayload(items: OtherItem[], ids: Record<string, string>) {
  return items.map((i) => ({
    person_id: i.personId ?? ids[i.key]!, amount_paise: i.amount_paise,
    ...(i.rows ? { rows: i.rows } : i.due_date ? { due_date: i.due_date } : {}),
  }))
}

/** Suggestions for the person box of one row, hiding people already chosen on other rows. */
export function suggestFor(people: PersonLike[], rows: OtherRow[], row: OtherRow, limit = 6): PersonLike[] {
  const taken = new Set(rows.filter((r) => r.key !== row.key && r.personId).map((r) => r.personId))
  return matchPeople(people.filter((p) => !taken.has(p.id)), row.personText, limit)
}

/** The `p_others` list when editing a purchase: existing friends keep their entry id. */
export function editOthersPayload(items: OtherItem[], ids: Record<string, string>) {
  return items.map((i) => ({
    ...(i.entryId ? { entry_id: i.entryId } : {}), person_id: i.personId ?? ids[i.key]!, amount_paise: i.amount_paise,
    ...(i.entryId ? {} : i.due_date ? { due_date: i.due_date } : {}),
  }))
}
