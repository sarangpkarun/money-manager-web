import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToday } from '@/features/profile/useToday'
import { useUi } from '@/lib/uiStore'
import { Amount } from '@/ui/Amount'
import { ErrorState } from '@/ui/ErrorState'
import { Skeleton } from '@/ui/Skeleton'
import { HistoryList } from './HistoryList'
import { OwedList } from './OwedList'
import { useMoneyOverview } from './queries'

const PeopleList = lazy(() => import('./PeopleList'))

type View = 'owed' | 'owe' | 'people' | 'history'
const VIEWS: { v: View; label: string }[] = [{ v: 'owed', label: 'Owed to me' }, { v: 'owe', label: 'I owe' }, { v: 'people', label: 'People' }, { v: 'history', label: 'History' }]

export default function MoneyScreen() {
  const today = useToday()
  const navigate = useNavigate()
  const openQuickAdd = useUi((s) => s.openQuickAdd)
  const [view, setView] = useState<View>('owed')
  const q = useMoneyOverview(today)
  const stats = q.data?.stats
  const open = (id: string) => navigate(`/money/entry/${id}`)

  return (
    <div className="space-y-4 pb-6">
      <h1 className="px-4 pt-6 text-3xl font-bold">Money</h1>

      <section aria-label="Summary" className="mx-4 grid grid-cols-2 gap-3 rounded-2xl bg-surface p-4">
        <div>
          <div className="text-sm text-muted">They owe me</div>
          {stats ? <Amount paise={stats.owed_to_me} tone="in" className="text-2xl font-bold" /> : <Skeleton className="mt-1 h-8 w-24" />}
          {stats && stats.overdue_owed_to_me > 0 && <div className="text-xs text-money-red">₹ overdue: <Amount paise={stats.overdue_owed_to_me} /></div>}
        </div>
        <div>
          <div className="text-sm text-muted">I owe</div>
          {stats ? <Amount paise={stats.i_owe} tone="out" className="text-2xl font-bold" /> : <Skeleton className="mt-1 h-8 w-24" />}
          {stats && stats.overdue_i_owe > 0 && <div className="text-xs text-money-red">₹ overdue: <Amount paise={stats.overdue_i_owe} /></div>}
        </div>
      </section>

      <div role="tablist" aria-label="Money views" className="mx-4 flex gap-1 rounded-xl bg-surface-2 p-1">
        {VIEWS.map((o) => (
          <button key={o.v} role="tab" aria-selected={view === o.v} onClick={() => setView(o.v)}
                  className={`min-h-9 flex-1 rounded-lg px-1 text-sm ${view === o.v ? 'bg-accent text-on-accent' : 'text-fg'}`}>{o.label}</button>
        ))}
      </div>

      {view === 'history' ? <HistoryList today={today} onOpen={open} />
        : view === 'people' ? <Suspense fallback={<div className="px-4"><Skeleton className="h-40" /></div>}><PeopleList today={today} onOpenEntry={open} /></Suspense>
        : q.isError && !q.data ? (
          <ErrorState what="your money" onRetry={() => void q.refetch()} />
        ) : !q.data ? <div className="space-y-3 px-4" aria-busy="true" aria-label="Loading money"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
        : <OwedList direction={view === 'owed' ? 'receive' : 'pay'} entries={q.data.entries} today={today} onOpen={open}
                    onAdd={() => openQuickAdd({ kind: view === 'owed' ? 'lent' : 'borrowed' })} />}
    </div>
  )
}
