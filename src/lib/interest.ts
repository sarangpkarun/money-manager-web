import { diffDays, type DateStr } from './dates'
import { mulDiv, type Paise } from './money'

export type SimpleKind = 'none' | 'flat' | 'simple'
export type Period = 'monthly' | 'weekly'

/** rate_bps is "% x 100" (12.5% = 1250). Flat = a one-time percentage of principal, regardless of term. */
export const flatInterest = (principal: Paise, rateBps: number): Paise => mulDiv(principal, rateBps, 10_000)

/** Simple interest: principal x annual rate x days / 365. */
export const simpleInterestForDays = (principal: Paise, rateBps: number, days: number): Paise =>
  days <= 0 ? 0 : mulDiv(principal, rateBps * days, 10_000 * 365)

/** Simple interest over a plan term of `periods` instalments (months/12 or weeks/52 of a year). */
export const simpleInterestForTerm = (principal: Paise, rateBps: number, periods: number, period: Period): Paise =>
  mulDiv(principal, rateBps * periods, 10_000 * (period === 'monthly' ? 12 : 52))

/** Total interest for a plan under a non-reducing interest kind. */
export function planInterest(kind: SimpleKind, principal: Paise, rateBps: number, periods: number, period: Period): Paise {
  if (kind === 'none' || rateBps === 0) return 0
  return kind === 'flat' ? flatInterest(principal, rateBps) : simpleInterestForTerm(principal, rateBps, periods, period)
}

/** Interest accrued by `today` on a single-date entry (flat is fixed; simple accrues daily; none is 0). */
export function interestToDate(
  e: { principal: Paise; interest: SimpleKind; rateBps: number; startDate: DateStr },
  today: DateStr,
): Paise {
  if (e.interest === 'none' || e.rateBps === 0) return 0
  if (e.interest === 'flat') return flatInterest(e.principal, e.rateBps)
  return simpleInterestForDays(e.principal, e.rateBps, diffDays(e.startDate, today))
}

/**
 * Interest fixed at creation of a single-date entry (mirrors create_entry in SQL): flat = a one-time percentage,
 * simple = principal x rate x days(start..due)/365 and needs a due date, none = 0.
 */
export function entryInterest(e: { principal: Paise; interest: SimpleKind; rateBps: number; startDate: DateStr; dueDate: DateStr | null }): Paise {
  if (e.interest === 'none' || e.rateBps <= 0) return 0
  if (e.interest === 'flat') return flatInterest(e.principal, e.rateBps)
  if (!e.dueDate) throw new RangeError('simple interest needs a due date')
  return simpleInterestForDays(e.principal, e.rateBps, diffDays(e.startDate, e.dueDate))
}
