import type { ActivityRow } from '@/lib/db'
import { categoryIcon } from '@/lib/palette'
import { Amount, type AmountTone } from '@/ui/Amount'
import { pendingBadge } from './rowText'

/** Transactions created by a loan, EMI or instalment belong to that entry: they are changed from the entry, never directly. */
export const isLinked = (r: Pick<ActivityRow, 'entry_id'>) => !!r.entry_id
export const isEditable = (r: Pick<ActivityRow, 'kind' | 'entry_id'>) => !isLinked(r) && (r.kind === 'expense' || r.kind === 'income' || r.kind === 'transfer')

export function rowTitle(r: ActivityRow): string {
  if (r.title) return r.title
  if (r.kind === 'transfer') return `${r.account_name ?? 'Account'} → ${r.to_account_name ?? 'Account'}`
  return r.category_name ?? (r.kind === 'income' ? 'Income' : 'Expense')
}

export function rowTone(kind: string): AmountTone {
  return kind === 'expense' || kind === 'debt_out' ? 'out' : kind === 'income' || kind === 'debt_in' ? 'in' : 'neutral'
}

export function TxnRow({ row, onOpen }: { row: ActivityRow; onOpen: () => void }) {
  const tone = rowTone(row.kind)
  const icon = row.kind === 'transfer' ? '↔️' : categoryIcon({ name: row.category_name ?? '', icon: row.category_icon })
  const sub = [row.place, row.kind === 'transfer' ? null : row.account_name].filter(Boolean).join(' · ')
  const badge = pendingBadge(row.others)
  return (
    <button onClick={onOpen} className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
            style={{ background: `${row.category_color ?? '#64748b'}26` }} aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{rowTitle(row)}</span>
        {(sub || badge) && (
          <span className="block truncate text-sm text-muted">{sub}{badge && <span className="text-money-amber">{sub ? ' · ' : ''}{badge}</span>}</span>
        )}
      </span>
      <Amount paise={row.amount_paise} tone={tone} sign={tone !== 'neutral'} className="shrink-0 font-semibold" />
      <span className="sr-only">, open details</span>
    </button>
  )
}
