import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAccounts } from '@/features/accounts/queries'
import { FilterSheet } from '@/features/activity/FilterSheet'
import { activeFilterCount, serializeFilters } from '@/features/activity/filters'
import { monthLabel, shiftMonth } from '@/features/activity/group'
import { useCategories } from '@/features/categories/queries'
import { useProfile } from '@/features/profile/useProfile'
import { useToday } from '@/features/profile/useToday'
import { useUi } from '@/lib/uiStore'
import { EmptyState } from '@/ui/EmptyState'
import { Skeleton } from '@/ui/Skeleton'
import { CardsCard, DueSoonCard, EmiLoadCard, NetPositionCard, PeopleCard, RecentCard, ThisMonthCard, WhereItWentCard, type Drill } from './cards'
import type { DueSoonItem } from './dashboardTypes'
import { applyLayout, type CardId } from './layout'
import { useDashboard } from './queries'
import { useHomeFilters } from './useHomeFilters'

const PaymentSheet = lazy(() => import('@/features/money/PaymentSheet').then((m) => ({ default: m.PaymentSheet })))

export default function HomeScreen() {
  const navigate = useNavigate()
  const today = useToday()
  const month = useUi((s) => s.month)
  const setMonth = useUi((s) => s.setMonth)
  const openQuickAdd = useUi((s) => s.openQuickAdd)
  const setActivitySearch = useUi((s) => s.setActivitySearch)
  const { data: profile } = useProfile()
  const { filters, setFilters, rpc } = useHomeFilters()
  const dash = useDashboard(month, today, rpc)
  const [filterOpen, setFilterOpen] = useState(false)
  const [pay, setPay] = useState<DueSoonItem | null>(null)
  const accounts = useAccounts().data ?? []
  const categories = useCategories().data ?? []
  const filterCount = activeFilterCount(filters)
  const d = dash.data

  /** Opens Activity for the same month and the same filters, narrowed further by `extra`. */
  const drill: Drill = (extra) => {
    const sp = serializeFilters(filters)
    for (const [k, v] of Object.entries(extra)) sp.set(k, v)
    const qs = sp.toString()
    setActivitySearch(qs ? `?${qs}` : '')
    navigate({ pathname: '/activity', search: qs })
  }
  const seeAll = () => drill({})

  const order = useMemo(() => applyLayout(profile?.dashboard_layout, ['this_month', 'where_it_went', 'net_position', 'due_soon', 'people', 'emi_load', 'cards', 'recent']), [profile?.dashboard_layout])
  const empty = !!d && d.month.count === 0 && d.recent.length === 0

  const render = (id: CardId) => {
    if (!d) return null
    switch (id) {
      case 'this_month': return <ThisMonthCard key={id} d={d} today={today} onOpen={seeAll} />
      case 'where_it_went': return <WhereItWentCard key={id} d={d} drill={drill} />
      case 'net_position': return <NetPositionCard key={id} d={d} onOpen={() => navigate('/money')} />
      case 'people': return <PeopleCard key={id} d={d} onOpen={() => navigate('/money')} />
      case 'due_soon': return <DueSoonCard key={id} d={d} today={today} onPay={setPay} onOpen={(eid) => navigate(`/money/entry/${eid}`)} />
      case 'emi_load': return <EmiLoadCard key={id} d={d} today={today} onOpen={() => navigate('/money')} />
      case 'cards': return <CardsCard key={id} d={d} drill={drill} today={today} />
      case 'recent': return <RecentCard key={id} d={d} onSeeAll={seeAll} />
      default: return null // reserved for later phases
    }
  }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between px-4 pt-6">
        <h1 className="text-3xl font-bold">Hello{profile?.name ? `, ${profile.name}` : ''}</h1>
        <Link to="/settings" aria-label="Settings" className="flex h-11 w-11 items-center justify-center rounded-full bg-accent font-semibold text-white">
          {(profile?.name ?? '?').slice(0, 1).toUpperCase()}
        </Link>
      </div>

      <div className="flex items-center justify-between px-4">
        <div className="flex items-center gap-1">
          <button aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className="h-11 w-11 text-xl">‹</button>
          <span className="min-w-32 text-center text-sm font-medium">{monthLabel(month)}</span>
          <button aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} className="h-11 w-11 text-xl">›</button>
        </div>
        <button onClick={() => setFilterOpen(true)} aria-label={filterCount ? `Filters, ${filterCount} active` : 'Filters'}
                className={`relative h-11 w-11 rounded-xl border ${filterCount ? 'border-accent bg-accent text-white' : 'border-line bg-surface-2'}`}>
          <span aria-hidden>⚙︎</span>
          {filterCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-money-red px-1 text-xs text-white">{filterCount}</span>}
        </button>
      </div>

      {dash.isError && !d ? (
        <div role="alert" className="mx-4 rounded-2xl bg-surface p-4 text-center">
          <p className="mb-3">Couldn't load your dashboard.</p>
          <button onClick={() => void dash.refetch()} className="min-h-11 rounded-full bg-accent px-5 text-white">Retry</button>
        </div>
      ) : !d ? (
        <div className="space-y-4 px-4" aria-busy="true" aria-label="Loading dashboard">
          <Skeleton className="h-72" /><Skeleton className="h-80" /><Skeleton className="h-40" />
        </div>
      ) : empty ? (
        <EmptyState title={filterCount ? 'Nothing matches' : `Nothing in ${monthLabel(month)}`}
                    hint={filterCount ? 'Try clearing the filters.' : 'Add an expense to see your month take shape.'}
                    action={<button onClick={() => openQuickAdd()} className="min-h-11 rounded-full bg-accent px-5 text-white">Add expense</button>} />
      ) : (
        order.map(render)
      )}

      {pay && (
        <Suspense fallback={null}>
          <PaymentSheet entryId={pay.entry_id} direction={pay.direction} remaining={pay.remaining_paise} targetSeq={pay.seq} today={today} onClose={() => setPay(null)} />
        </Suspense>
      )}
      {filterOpen && <FilterSheet hideDate filters={filters} accounts={accounts} categories={categories} onApply={setFilters} onClose={() => setFilterOpen(false)} />}
    </div>
  )
}
