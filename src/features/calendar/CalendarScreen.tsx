import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccounts } from '@/features/accounts/queries'
import { FilterSheet } from '@/features/activity/FilterSheet'
import { activeFilterCount } from '@/features/activity/filters'
import { monthLabel, shiftMonth } from '@/features/activity/group'
import { useCategories } from '@/features/categories/queries'
import { useToday, useWeekStart } from '@/features/profile/useToday'
import { monthGrid, weekdayLabels } from '@/lib/calendarGrid'
import { formatCompact, formatMoney } from '@/lib/money'
import { ALL_LAYERS, markerSummary, markersByDay, visibleMarkers, type Layers, type Marker } from '@/lib/markers'
import { useUi } from '@/lib/uiStore'
import { Amount } from '@/ui/Amount'
import { Chip } from '@/ui/Chip'
import { Skeleton } from '@/ui/Skeleton'
import { DaySheet } from './DaySheet'
import { shortDate } from './dateText'
import { NoteSheet } from './NoteSheet'
import { useCalendarMonth } from './queries'
import type { CalendarItem, CalendarNote } from './types'
import { useCalendarFilters } from './useCalendarFilters'

const AgendaView = lazy(() => import('./AgendaView').then((m) => ({ default: m.AgendaView })))
const PaymentSheet = lazy(() => import('@/features/money/PaymentSheet').then((m) => ({ default: m.PaymentSheet })))

const LAYERS_KEY = 'mm-cal-layers'
const VIEW_KEY = 'mm-cal-view'

function loadLayers(): Layers {
  try {
    const raw = JSON.parse(localStorage.getItem(LAYERS_KEY) ?? 'null') as Partial<Layers> | null
    if (raw) return { dues: raw.dues !== false, spending: raw.spending !== false, notes: raw.notes !== false }
  } catch { /* storage blocked or corrupt */ }
  return ALL_LAYERS
}
const loadView = (): 'month' | 'agenda' => { try { return localStorage.getItem(VIEW_KEY) === 'agenda' ? 'agenda' : 'month' } catch { return 'month' } }
const remember = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

const TONE_DOT: Record<Marker['tone'], string> = {
  red: 'bg-money-red', amber: 'bg-money-amber', blue: 'bg-money-blue', green: 'bg-money-green', purple: 'bg-money-purple', grey: 'bg-money-grey',
}
const TONE_TEXT: Record<Marker['tone'], string> = {
  red: 'text-money-red', amber: 'text-money-amber', blue: 'text-money-blue', green: 'text-money-green', purple: 'text-money-purple', grey: 'text-money-grey',
}

function Glyph({ m }: { m: Marker }) {
  return m.tick
    ? <span aria-hidden className={`text-[11px] font-bold leading-none ${TONE_TEXT[m.tone]}`} data-marker={`${m.kind}`}>✓</span>
    : <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[m.tone]}`} data-marker={`${m.kind}`} />
}

type Sub = { kind: 'note'; note: CalendarNote | null; date: string } | { kind: 'pay'; item: CalendarItem } | null

export default function CalendarScreen() {
  const today = useToday()
  const weekStart = useWeekStart()
  const navigate = useNavigate()
  const month = useUi((s) => s.month)
  const setMonth = useUi((s) => s.setMonth)
  const openQuickAdd = useUi((s) => s.openQuickAdd)
  const setActivitySearch = useUi((s) => s.setActivitySearch)
  const { filters, setFilters, rpc } = useCalendarFilters()
  const q = useCalendarMonth(month, today, rpc)
  const data = q.data
  const [layers, setLayers] = useState<Layers>(loadLayers)
  const [view, setViewState] = useState<'month' | 'agenda'>(loadView)
  const [selected, setSelected] = useState<string | null>(null)
  const [sub, setSub] = useState<Sub>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const accounts = useAccounts().data ?? []
  const categories = useCategories().data ?? []
  const filterCount = activeFilterCount(filters)

  const setView = (v: 'month' | 'agenda') => { setViewState(v); remember(VIEW_KEY, v) }
  const toggle = (k: keyof Layers) => setLayers((l) => { const next = { ...l, [k]: !l[k] }; remember(LAYERS_KEY, JSON.stringify(next)); return next })

  const grid = useMemo(() => monthGrid(month, weekStart), [month, weekStart])
  const markers = useMemo(
    () => (data ? markersByDay(data.items, data.notes, today, layers, { from: data.start, to: data.end }) : new Map<string, Marker[]>()),
    [data, today, layers],
  )
  const spend = useMemo(() => new Map((data?.days ?? []).map((d) => [d.date, d])), [data])

  const openActivity = (date: string) => {
    const qs = `?d=custom&from=${date}&to=${date}`
    setActivitySearch(qs)
    setSelected(null)
    navigate({ pathname: '/activity', search: qs })
  }
  const closeDay = () => { setSelected(null); setSub(null) }

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-center justify-between px-4 pt-6">
        <h1 className="text-3xl font-bold">Calendar</h1>
        <button onClick={() => setFilterOpen(true)} aria-label={filterCount ? `Filters, ${filterCount} active` : 'Filters'}
                className={`relative h-11 w-11 rounded-xl border ${filterCount ? 'border-accent bg-accent text-white' : 'border-line bg-surface-2'}`}>
          <span aria-hidden>⚙︎</span>
          {filterCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-money-red px-1 text-xs text-white">{filterCount}</span>}
        </button>
      </div>

      <div className="flex items-center justify-between px-4">
        <div className="flex items-center gap-1">
          <button aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className="h-11 w-11 text-xl">‹</button>
          <span className="min-w-32 text-center text-sm font-medium">{monthLabel(month)}</span>
          <button aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} className="h-11 w-11 text-xl">›</button>
        </div>
        <div role="tablist" aria-label="Calendar view" className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {(['month', 'agenda'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`min-h-9 rounded-lg px-3 text-sm ${view === v ? 'bg-accent text-white' : 'text-fg'}`}>{v === 'month' ? 'Month' : 'Agenda'}</button>
          ))}
        </div>
      </div>

      {view === 'agenda' ? (
        <Suspense fallback={<div className="px-4"><Skeleton className="h-40" /></div>}>
          <AgendaView today={today} onOpenEntry={(id) => navigate(`/money/entry/${id}`)} onOpenNote={(n) => setSub({ kind: 'note', note: n, date: n.date })} onOpenDay={(d) => { setViewState('month'); setMonth(d.slice(0, 7)); setSelected(d) }} />
        </Suspense>
      ) : (
        <>
          <div role="group" aria-label="Layers" className="flex gap-2 overflow-x-auto px-4">
            <Chip selected={layers.dues} onClick={() => toggle('dues')}>Dues</Chip>
            <Chip selected={layers.spending} onClick={() => toggle('spending')}>Spending</Chip>
            <Chip selected={layers.notes} onClick={() => toggle('notes')}>Notes</Chip>
          </div>

          <section aria-label="Month totals" className="mx-4 grid grid-cols-3 gap-2 rounded-2xl bg-surface p-3 text-center">
            {data ? (
              <>
                <div><div className="text-xs text-muted">Spent</div><Amount paise={data.totals.spent} tone="out" className="text-lg font-semibold" /></div>
                <div><div className="text-xs text-muted">Received</div><Amount paise={data.totals.received} tone="in" className="text-lg font-semibold" /></div>
                <div>
                  <div className="text-xs text-muted">Dues</div><Amount paise={data.totals.dues_paise} className="text-lg font-semibold" />
                  {data.totals.overdue_paise > 0 && <div className="text-xs text-money-red">{formatMoney(data.totals.overdue_paise)} overdue</div>}
                </div>
              </>
            ) : [0, 1, 2].map((i) => <Skeleton key={i} className="mx-auto h-10 w-16" />)}
          </section>

          {q.isError && !data ? (
            <div role="alert" className="mx-4 rounded-2xl bg-surface p-4 text-center">
              <p className="mb-3">Couldn't load the calendar.</p>
              <button onClick={() => void q.refetch()} className="min-h-11 rounded-full bg-accent px-5 text-white">Retry</button>
            </div>
          ) : !data ? <div className="px-4" aria-busy="true" aria-label="Loading calendar"><Skeleton className="h-80" /></div> : (
            <div className="px-2" role="grid" aria-label={monthLabel(month)}>
              <div role="row" className="grid grid-cols-7 pb-1 text-center text-xs text-muted">
                {weekdayLabels(weekStart).map((l, i) => <div key={i} role="columnheader">{l}</div>)}
              </div>
              {grid.map((week, wi) => (
                <div key={wi} role="row" className="grid grid-cols-7">
                  {week.map((d) => {
                    if (!d.inMonth) return <div key={d.date} role="gridcell" aria-hidden className="h-14 p-1 text-center text-sm text-muted/40">{d.day}</div>
                    const list = markers.get(d.date)
                    const s = spend.get(d.date)
                    const isToday = d.date === today
                    const label = [shortDate(d.date), isToday ? 'today' : '', markerSummary(list), layers.spending && s && s.spent > 0 ? `spent ${formatMoney(s.spent)}` : ''].filter(Boolean).join(', ')
                    return (
                      <div key={d.date} role="gridcell">
                        <button onClick={() => setSelected(d.date)} aria-label={label}
                                className={`flex h-14 w-full flex-col items-center justify-start gap-0.5 rounded-xl p-1 text-sm ${selected === d.date ? 'bg-accent/15' : ''} ${isToday ? 'ring-2 ring-accent' : ''}`}>
                          <span className="tabular leading-5">{d.day}</span>
                          <span className="flex h-3 items-center gap-0.5">{visibleMarkers(list).map((m) => <Glyph key={m.kind} m={m} />)}</span>
                          {layers.spending && s && s.spent > 0 && <span className="tabular text-[10px] leading-none text-muted">{formatCompact(s.spent)}</span>}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {selected && data && !sub && (
        <DaySheet date={selected} data={data} today={today} onClose={closeDay}
                  onPay={(item) => setSub({ kind: 'pay', item })}
                  onOpenEntry={(id) => { closeDay(); navigate(`/money/entry/${id}`) }}
                  onOpenActivity={openActivity}
                  onAddTxn={() => { const d = selected; closeDay(); openQuickAdd({ date: d }) }}
                  onAddNote={() => setSub({ kind: 'note', note: null, date: selected })}
                  onEditNote={(n) => setSub({ kind: 'note', note: n, date: selected })} />
      )}
      {sub?.kind === 'note' && <NoteSheet note={sub.note} date={sub.date} onClose={() => setSub(null)} />}
      {sub?.kind === 'pay' && (
        <Suspense fallback={null}>
          <PaymentSheet entryId={sub.item.entry_id} direction={sub.item.direction} remaining={sub.item.remaining_paise} targetSeq={sub.item.seq} today={today} onClose={() => setSub(null)} />
        </Suspense>
      )}
      {filterOpen && <FilterSheet hideDate filters={filters} accounts={accounts} categories={categories} onApply={setFilters} onClose={() => setFilterOpen(false)} />}
    </div>
  )
}
