import { useState } from 'react'
import { diffDays } from '@/lib/dates'
import { Amount } from '@/ui/Amount'
import { EmptyState } from '@/ui/EmptyState'
import { EntryBadge } from './EntryBadge'
import { groupByPerson, type GroupSort } from './group'
import { dueText, entryStatusOf } from './status'
import type { Direction, OverviewEntry } from './types'

const KIND_TAG: Partial<Record<string, string>> = { emi_purchase: 'EMI', instalment: 'Instalments', on_behalf: 'Paid for' }

const SORTS: { v: GroupSort; label: string }[] = [{ v: 'overdue', label: 'Overdue first' }, { v: 'amount', label: 'Biggest first' }, { v: 'name', label: 'Name' }]

/** Open entries of one direction, grouped by person. */
export function OwedList({ direction, entries, today, onOpen, onAdd }: {
  direction: Direction; entries: OverviewEntry[]; today: string; onOpen: (id: string) => void; onAdd: () => void
}) {
  const [sort, setSort] = useState<GroupSort>('overdue')
  const groups = groupByPerson(entries, direction, today, sort)
  const owed = direction === 'receive'

  if (groups.length === 0) {
    return <EmptyState title={owed ? 'Nobody owes you' : 'You owe nobody'}
                       hint={owed ? 'Lend money to a friend and track it here.' : 'Borrowed money you still have to return shows up here.'}
                       action={<button onClick={onAdd} className="min-h-11 rounded-full bg-accent px-5 text-on-accent">{owed ? 'Lend money' : 'Add borrowed money'}</button>} />
  }
  return (
    <div className="space-y-3">
      <label className="flex items-center justify-end gap-2 px-4 text-sm text-muted">
        Sort
        <select value={sort} onChange={(e) => setSort(e.target.value as GroupSort)} className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-fg">
          {SORTS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
      </label>
      {groups.map((g) => (
        <section key={g.key} aria-label={g.name} className="mx-4 overflow-hidden rounded-2xl bg-surface">
          <header className="flex items-baseline justify-between px-4 pt-3">
            <h3 className="font-semibold">{g.name}</h3>
            <span className="text-sm text-muted">
              {g.overdue > 0 && <span className="mr-2 text-money-red">overdue <Amount paise={g.overdue} /></span>}
              <Amount paise={g.outstanding} tone={owed ? 'in' : 'out'} className="font-semibold" />
            </span>
          </header>
          <ul className="divide-y divide-line">
            {g.entries.map((e) => {
              const status = entryStatusOf(e, today)
              const pct = e.total_paise > 0 ? Math.min(100, Math.round((e.paid_paise * 100) / e.total_paise)) : 0
              return (
                <li key={e.id}>
                  <button onClick={() => onOpen(e.id)} className="block min-h-16 w-full px-4 py-3 text-left">
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{e.title}{KIND_TAG[e.kind] ? <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-normal text-muted">{KIND_TAG[e.kind]}</span> : null}</span>
                      <Amount paise={e.outstanding_paise} className="shrink-0 font-semibold" />
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-sm text-muted">
                      <span className="flex items-center gap-2"><EntryBadge status={status} /><span>{dueText(e.due_date, today, diffDays)}</span></span>
                      {e.rows_total > 1 ? <span>{e.rows_paid} of {e.rows_total} paid</span> : e.paid_paise > 0 && <span>{pct}% paid</span>}
                    </span>
                    {e.paid_paise > 0 && (
                      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
