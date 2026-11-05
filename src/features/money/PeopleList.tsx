import { useMemo, useState } from 'react'
import { Amount } from '@/ui/Amount'
import { Chip } from '@/ui/Chip'
import { EmptyState } from '@/ui/EmptyState'
import { inputCls, secondaryBtn } from '@/ui/Field'
import { Skeleton } from '@/ui/Skeleton'
import { ImportSheet } from './ImportSheet'
import { MergeSheet } from './MergeSheet'
import { PersonSheet } from './PersonSheet'
import { findDuplicates, normaliseName } from './people'
import { usePeopleBalances } from './queries'
import type { PersonBalance } from './types'

type Filter = 'all' | 'owes' | 'owe' | 'archived'
type Sort = 'name' | 'net'
const FILTERS: { v: Filter; label: string }[] = [{ v: 'all', label: 'All' }, { v: 'owes', label: 'Owes me' }, { v: 'owe', label: 'I owe' }, { v: 'archived', label: 'Archived' }]

const net = (p: PersonBalance) => p.owed_to_me_paise - p.i_owe_paise

export default function PeopleList({ today, onOpenEntry }: { today: string; onOpenEntry: (id: string) => void }) {
  const q = usePeopleBalances()
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('name')
  const [text, setText] = useState('')
  const [sheet, setSheet] = useState<{ id: string | null } | null>(null)
  const [importing, setImporting] = useState(false)
  const [merging, setMerging] = useState(false)

  const all = useMemo(() => q.data ?? [], [q.data])
  const dups = useMemo(() => findDuplicates(all.filter((p) => !p.archived).map((p) => ({ id: p.person_id, name: p.name, phone: p.phone }))), [all])
  const rows = useMemo(() => {
    const needle = normaliseName(text)
    return all
      .filter((p) => (filter === 'archived' ? !!p.archived : !p.archived))
      .filter((p) => (filter === 'owes' ? p.owed_to_me_paise > 0 : filter === 'owe' ? p.i_owe_paise > 0 : true))
      .filter((p) => !needle || normaliseName(p.name).includes(needle) || (p.phone ?? '').replace(/\D/g, '').includes(needle.replace(/\D/g, '') || '\u0000'))
      .sort((a, b) => (sort === 'net' ? Math.abs(net(b)) - Math.abs(net(a)) : 0) || a.name.localeCompare(b.name))
  }, [all, filter, sort, text])

  return (
    <div className="space-y-3">
      <div className="flex gap-2 px-4">
        <input type="search" aria-label="Search people" placeholder="Search name or phone" value={text} onChange={(e) => setText(e.target.value)} className={inputCls} />
        <button onClick={() => setSheet({ id: null })} className="h-12 shrink-0 rounded-xl bg-accent px-4 font-semibold text-white">Add</button>
      </div>
      <div className="-mx-0 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Filter people">
        {FILTERS.map((f) => <Chip key={f.v} selected={filter === f.v} onClick={() => setFilter(f.v)}>{f.label}</Chip>)}
      </div>

      {dups.length > 0 && (
        <button onClick={() => setMerging(true)} className="mx-4 flex min-h-11 w-[calc(100%-2rem)] items-center justify-between rounded-xl bg-money-amber/15 px-4 text-left text-money-amber">
          <span>{dups.length} possible duplicate{dups.length === 1 ? '' : 's'}</span><span className="font-medium">Review</span>
        </button>
      )}

      {q.isPending ? <div className="space-y-2 px-4"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        : q.isError ? <div role="alert" className="mx-4 rounded-2xl bg-surface p-4 text-center">Couldn't load people. <button className="text-accent" onClick={() => void q.refetch()}>Retry</button></div>
        : rows.length === 0 ? (
          <EmptyState title={all.length === 0 ? 'No people yet' : 'No one matches'} hint={all.length === 0 ? 'Add the people you lend to or borrow from.' : 'Try another filter or search.'} />
        ) : (
          <>
            <label className="flex items-center justify-end gap-2 px-4 text-sm text-muted">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-fg">
                <option value="name">Name</option><option value="net">Biggest balance</option>
              </select>
            </label>
            <ul className="mx-4 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
              {rows.map((p) => {
                const n = net(p)
                return (
                  <li key={p.person_id}>
                    <button onClick={() => setSheet({ id: p.person_id })} aria-label={`${p.name}, open details`} className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-2 text-left">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{p.name}</span>
                        <span className="block truncate text-sm text-muted">{p.open_count > 0 ? `${p.open_count} open` : p.entry_count > 0 ? 'All settled' : p.phone ?? 'No entries'}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        {n === 0 ? <span className="text-sm text-muted">Settled</span> : (
                          <>
                            <span className="block text-xs text-muted">{n > 0 ? 'owes you' : 'you owe'}</span>
                            <Amount paise={Math.abs(n)} tone={n > 0 ? 'in' : 'out'} className="font-semibold" />
                          </>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}

      <div className="px-4"><button className={secondaryBtn} onClick={() => setImporting(true)}>Import people</button></div>

      {sheet && <PersonSheet personId={sheet.id} today={today} onOpenEntry={(id) => { setSheet(null); onOpenEntry(id) }} onClose={() => setSheet(null)} />}
      {importing && <ImportSheet existing={all.map((p) => ({ id: p.person_id, name: p.name, phone: p.phone }))} onClose={() => setImporting(false)} />}
      {merging && <MergeSheet groups={dups} onClose={() => setMerging(false)} />}
    </div>
  )
}
