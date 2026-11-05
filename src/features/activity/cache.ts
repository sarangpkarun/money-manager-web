import type { Account, ActivityRow, Category, TxnKind } from '@/lib/db'

/** Filters as sent to the RPCs (see toRpcFilters). */
export interface RpcFilters {
  from?: string; to?: string; kinds?: string[]; accounts?: string[]; categories?: string[]
  min?: number; max?: number; q?: string; place?: string; tag?: string
}

export type Match = 'yes' | 'no' | 'unknown'

/**
 * Would this row appear under these filters? 'unknown' for text filters (q/place/tag), which the server evaluates;
 * the caller then skips the optimistic insert and just refetches.
 */
export function matchesFilters(r: Pick<ActivityRow, 'date' | 'kind' | 'account_id' | 'to_account_id' | 'category_id' | 'amount_paise'>, f: RpcFilters): Match {
  if (f.from && r.date < f.from) return 'no'
  if (f.to && r.date > f.to) return 'no'
  if (f.kinds && !f.kinds.includes(r.kind)) return 'no'
  if (f.accounts && !(f.accounts.includes(r.account_id ?? '') || f.accounts.includes(r.to_account_id ?? ''))) return 'no'
  if (f.categories && !f.categories.includes(r.category_id ?? '')) return 'no'
  if (f.min !== undefined && r.amount_paise < f.min) return 'no'
  if (f.max !== undefined && r.amount_paise > f.max) return 'no'
  return f.q || f.place || f.tag ? 'unknown' : 'yes'
}

/** Puts a row on the first page in date-descending position (newest created first within a day); replaces a same-id row. */
export function insertIntoPages<T extends { id: string; date: string }>(pages: T[][], row: T): T[][] {
  const cleaned = removeFromPages(pages, row.id)
  const first = cleaned[0] ?? []
  const at = first.findIndex((r) => r.date <= row.date)
  const next = [...first]
  next.splice(at === -1 ? next.length : at, 0, row)
  return [next, ...cleaned.slice(1)]
}

export function removeFromPages<T extends { id: string }>(pages: T[][], id: string): T[][] {
  return pages.map((p) => p.filter((r) => r.id !== id))
}

export interface NewTxnInput {
  id: string
  kind: Extract<TxnKind, 'expense' | 'income' | 'transfer'>
  amount_paise: number
  date: string
  account_id: string
  to_account_id?: string | null
  category_id?: string | null
  title?: string | null
  place?: string | null
  notes?: string | null
  tags?: string[]
}

/** Builds the list row the user will see, before the server answers. */
export function rowFromInput(i: NewTxnInput, accounts: Account[] = [], categories: Category[] = []): ActivityRow {
  const name = (id?: string | null) => accounts.find((a) => a.id === id)?.name ?? null
  const cat = i.kind === 'transfer' ? undefined : categories.find((c) => c.id === i.category_id)
  return {
    id: i.id, kind: i.kind, amount_paise: i.amount_paise, date: i.date,
    account_id: i.account_id, account_name: name(i.account_id),
    to_account_id: i.kind === 'transfer' ? (i.to_account_id ?? null) : null,
    to_account_name: i.kind === 'transfer' ? name(i.to_account_id) : null,
    category_id: cat?.id ?? null, category_name: cat?.name ?? null, category_icon: cat?.icon ?? null, category_color: cat?.color ?? null,
    title: i.title?.trim() || null, place: i.place?.trim() || null, notes: i.notes?.trim() || null,
    tags: i.tags ?? [], for_other_paise: 0, entry_id: null, created_at: new Date().toISOString(),
  }
}
