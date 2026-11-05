import { entryInterest } from '@/lib/interest'
import { formatMoney } from '@/lib/money'
import { evaluateAmount } from './amount'

export type LendKind = 'lent' | 'borrowed'
export type LendInterest = 'none' | 'flat' | 'simple'

export interface LendForm {
  kind: LendKind
  amount: string
  title: string
  personText: string
  /** chosen existing person; null = match by name or create on save */
  personId: string | null
  accountId: string | null
  date: string
  /** yyyy-MM-dd or '' for none */
  due: string
  interest: LendInterest
  /** percent per the interest kind, e.g. "12" or "1.5" */
  rate: string
  notes: string
}

export interface LendInput {
  kind: LendKind
  personId: string | null
  personName: string
  title: string
  amount_paise: number
  account_id: string
  start_date: string
  due_date: string | null
  interest: LendInterest
  rate_bps: number
  notes: string | null
}

export type LendResult = { ok: true; input: LendInput } | { ok: false; errors: Record<string, string> }

/** "12" or "1.5" percent to basis points (1200, 150); null if not a sensible rate (0.01% to 1000%). */
export function parseRatePercent(s: string): number | null {
  const t = s.trim()
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return null
  const bps = Math.round(Number(t) * 100)
  return bps >= 1 && bps <= 100_000 ? bps : null
}

export const defaultLendTitle = (kind: LendKind, person: string): string => (kind === 'lent' ? `Lent to ${person}` : `Borrowed from ${person}`)

export function validateLend(f: LendForm): LendResult {
  const errors: Record<string, string> = {}
  const { paise } = evaluateAmount(f.amount)
  if (paise === null || paise <= 0) errors.amount = f.amount.trim() ? 'Enter a valid amount' : 'Enter an amount'
  const personName = f.personText.trim()
  if (!personName) errors.person = 'Who is it with?'
  else if (personName.length > 100) errors.person = 'Keep the name under 100 characters'
  if (!f.accountId) errors.account = 'Pick an account'
  if (f.due && f.due < f.date) errors.due = 'The due date is before the start date'

  let rate = 0
  if (f.interest !== 'none') {
    const r = parseRatePercent(f.rate)
    if (r === null) errors.rate = 'Enter a rate such as 12 or 1.5'
    else rate = r
    if (f.interest === 'simple' && !f.due) errors.due = 'Simple interest needs a due date'
  }
  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    input: {
      kind: f.kind, personId: f.personId, personName, title: f.title.trim() || defaultLendTitle(f.kind, personName),
      amount_paise: paise as number, account_id: f.accountId as string, start_date: f.date, due_date: f.due || null,
      interest: f.interest, rate_bps: rate, notes: f.notes.trim() || null,
    },
  }
}

/** "Total to get back ₹11,000 (₹1,000 interest)" under the amount while interest is set; null when there is none. */
export function lendPreview(f: LendForm): string | null {
  const { paise } = evaluateAmount(f.amount)
  const rate = parseRatePercent(f.rate)
  if (paise === null || paise <= 0 || f.interest === 'none' || rate === null) return null
  if (f.interest === 'simple' && (!f.due || f.due < f.date)) return null
  const interest = entryInterest({ principal: paise, interest: f.interest, rateBps: rate, startDate: f.date, dueDate: f.due || null })
  return `${f.kind === 'lent' ? 'You get back' : 'You pay back'} ${formatMoney(paise + interest)} (${formatMoney(interest)} interest)`
}
