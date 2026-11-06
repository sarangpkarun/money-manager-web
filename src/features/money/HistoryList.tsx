import { useMemo } from 'react'
import { Amount } from '@/ui/Amount'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { Skeleton } from '@/ui/Skeleton'
import { secondaryBtn } from '@/ui/Field'
import { dayLabel } from '@/features/activity/group'
import { EntryBadge } from './EntryBadge'
import { useMoneyHistory } from './queries'

/** Settled entries, newest first. */
export function HistoryList({ today, onOpen }: { today: string; onOpen: (id: string) => void }) {
  const q = useMoneyHistory()
  const rows = useMemo(() => q.data?.pages.flat() ?? [], [q.data])
  if (q.isPending) return <div className="space-y-3 px-4"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
  if (q.isError) return <ErrorState what="history" onRetry={() => void q.refetch()} />
  if (rows.length === 0) return <EmptyState title="Nothing settled yet" hint="Loans that are fully paid move here." />
  return (
    <div className="space-y-3">
      <ul className="mx-4 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
        {rows.map((r) => (
          <li key={r.id}>
            <button onClick={() => onOpen(r.id)} className="block min-h-16 w-full px-4 py-3 text-left">
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{r.title}</span>
                <Amount paise={r.total_paise} tone={r.direction === 'receive' ? 'in' : 'out'} className="shrink-0 font-semibold" />
              </span>
              <span className="mt-1 flex items-center justify-between text-sm text-muted">
                <span className="flex items-center gap-2"><EntryBadge status="paid" /><span>{r.person_name ?? 'No person'}</span></span>
                <span>Settled {dayLabel(r.settled_on, today)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <div className="px-4"><button className={secondaryBtn} disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          {q.isFetchingNextPage ? 'Loading…' : 'Load more'}</button></div>
      )}
    </div>
  )
}
