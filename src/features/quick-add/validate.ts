import type { NewTxnInput } from '@/features/activity/cache'
import { evaluateAmount } from './amount'

export type TxnQuickKind = 'expense' | 'income' | 'transfer'
/** Everything the sheet's type switch offers; Lent and Borrowed create an entry instead of a transaction (see lend.ts). */
export type QuickKind = TxnQuickKind | 'lent' | 'borrowed'

export interface QuickAddForm {
  kind: QuickKind
  amount: string
  title: string
  categoryId: string | null
  accountId: string | null
  toAccountId: string | null
  date: string
  place: string
  notes: string
  tags: string
}

export const isLend = (k: QuickKind): k is 'lent' | 'borrowed' => k === 'lent' || k === 'borrowed'

export type QuickAddResult = { ok: true; input: Omit<NewTxnInput, 'id'> } | { ok: false; errors: Record<string, string> }

/** "work, trip  Work" -> ['work', 'trip'] (lowercase, unique, max 10). */
export function parseTags(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean))].slice(0, 10)
}

export function validateQuickAdd(f: QuickAddForm): QuickAddResult {
  if (isLend(f.kind)) return { ok: false, errors: { kind: 'Use validateLend for lent and borrowed' } }
  const errors: Record<string, string> = {}
  const { paise } = evaluateAmount(f.amount)
  if (paise === null || paise <= 0) errors.amount = f.amount.trim() ? 'Enter a valid amount' : 'Enter an amount'
  if (!f.accountId) errors.account = 'Pick an account'
  if (f.kind === 'transfer') {
    if (!f.toAccountId) errors.toAccount = 'Pick where it goes'
    else if (f.toAccountId === f.accountId) errors.toAccount = 'Choose two different accounts'
  }
  if (Object.keys(errors).length) return { ok: false, errors }
  const transfer = f.kind === 'transfer'
  return {
    ok: true,
    input: {
      kind: f.kind, amount_paise: paise as number, date: f.date, account_id: f.accountId as string,
      to_account_id: transfer ? f.toAccountId : null, category_id: transfer ? null : f.categoryId,
      title: f.title.trim() || null, place: f.place.trim() || null, notes: f.notes.trim() || null, tags: parseTags(f.tags),
    },
  }
}
