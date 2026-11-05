import { parseRupees, toRupeeInput } from '@/lib/money'
import type { Account, AccountType, Category, InsertRow } from '@/lib/db'

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank' }, { value: 'upi', label: 'UPI' },
  { value: 'credit_card', label: 'Credit card' }, { value: 'wallet', label: 'Wallet' },
]

export interface AccountForm {
  name: string
  type: AccountType
  /** Rupees. For a credit card this is the amount already owed. */
  opening: string
  limit: string
  statementDay: string
  dueDay: string
  color: string
}

export const emptyAccountForm = (): AccountForm => ({ name: '', type: 'bank', opening: '', limit: '', statementDay: '', dueDay: '', color: '#3b82f6' })

export function accountToForm(a: Account): AccountForm {
  const card = a.type === 'credit_card'
  return {
    name: a.name, type: a.type,
    opening: a.opening_balance_paise === 0 ? '' : toRupeeInput(card ? -a.opening_balance_paise : a.opening_balance_paise),
    limit: a.credit_limit_paise ? toRupeeInput(a.credit_limit_paise) : '',
    statementDay: a.statement_day ? String(a.statement_day) : '', dueDay: a.due_day ? String(a.due_day) : '', color: a.color ?? '#3b82f6',
  }
}

export type Validated<T> = { ok: true; values: T } | { ok: false; errors: Record<string, string> }

const day = (s: string): number | null | 'bad' => {
  if (!s.trim()) return null
  const n = Number(s)
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : 'bad'
}

export function validateAccount(f: AccountForm): Validated<InsertRow<'accounts'>> {
  const errors: Record<string, string> = {}
  const name = f.name.trim()
  if (!name) errors.name = 'Enter a name'
  else if (name.length > 40) errors.name = 'Keep it under 40 characters'

  const card = f.type === 'credit_card'
  const open = f.opening.trim() ? parseRupees(f.opening) : 0
  if (open === null) errors.opening = 'Enter a valid amount'

  let limit: number | null = null
  let statement: number | null = null
  let due: number | null = null
  if (card) {
    if (f.limit.trim()) {
      const l = parseRupees(f.limit)
      if (l === null || l <= 0) errors.limit = 'Enter a limit above zero'
      else limit = l
    }
    const s = day(f.statementDay)
    const d = day(f.dueDay)
    if (s === 'bad') errors.statementDay = 'Use a day from 1 to 31'
    else statement = s
    if (d === 'bad') errors.dueDay = 'Use a day from 1 to 31'
    else due = d
  }
  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    values: {
      name, type: f.type, color: f.color, credit_limit_paise: limit, statement_day: statement, due_day: due,
      opening_balance_paise: card ? -(open as number) || 0 : (open as number),
    },
  }
}

export interface CategoryForm { name: string; kind: 'expense' | 'income'; icon: string; color: string }

export const emptyCategoryForm = (kind: 'expense' | 'income' = 'expense'): CategoryForm => ({ name: '', kind, icon: '', color: '#3b82f6' })

export const categoryToForm = (c: Category): CategoryForm => ({
  name: c.name, kind: c.kind === 'income' ? 'income' : 'expense', icon: c.icon ?? '', color: c.color ?? '#3b82f6',
})

export function validateCategory(f: CategoryForm): Validated<InsertRow<'categories'>> {
  const errors: Record<string, string> = {}
  const name = f.name.trim()
  if (!name) errors.name = 'Enter a name'
  else if (name.length > 30) errors.name = 'Keep it under 30 characters'
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, values: { name, kind: f.kind, icon: f.icon || null, color: f.color } }
}
