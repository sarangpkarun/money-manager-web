import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { rowLabel } from '@/lib/labels'
import { describeRepeat } from '@/lib/repeat'
import type { ScheduleRow } from '@/lib/schedule'
import { Amount } from '@/ui/Amount'
import { Skeleton } from '@/ui/Skeleton'
import { dayLabel } from '@/features/activity/group'
import { TONE_CLS } from '@/features/money/status'
import { agendaDays, mergeWindows } from './agenda'
import { useAgenda } from './queries'
import type { CalendarItem, CalendarNote } from './types'

const asRow = (i: CalendarItem): ScheduleRow => ({ seq: i.seq, due_date: i.due_date, due_paise: i.due_paise, principal_paise: i.due_paise, interest_paise: 0, paid_paise: i.paid_paise, paid_on: i.paid_on })

/** Sentinel that fires `onVisible` when scrolled into view (no-op where IntersectionObserver is missing). */
function Sentinel({ onVisible, label }: { onVisible: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) onVisible() }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [onVisible])
  return <div ref={ref} aria-label={label} className="h-6" />
}

/** Dated items only (dues, payments, notes and tasks), grouped by day, anchored on Today, loading more as you scroll either way. */
export function AgendaView({ today, onOpenEntry, onOpenNote, onOpenDay }: {
  today: string
  onOpenEntry: (id: string) => void
  onOpenNote: (n: CalendarNote) => void
  onOpenDay: (date: string) => void
}) {
  const q = useAgenda(today)
  const pages = q.data?.pages
  const days = useMemo(() => {
    if (!pages || pages.length === 0) return []
    const merged = mergeWindows(pages)
    return agendaDays(merged.items, merged.notes, pages[0]!.from, pages[pages.length - 1]!.to, today)
  }, [pages, today])

  // anchor on Today once, and keep the scroll position when older days are added above
  const todayRef = useRef<HTMLElement>(null)
  const anchored = useRef(false)
  const before = useRef<{ height: number; first: string } | null>(null)
  useLayoutEffect(() => {
    const scroller = todayRef.current?.closest<HTMLElement>('[data-tab-scroll]') ?? null
    if (!anchored.current && todayRef.current && typeof todayRef.current.scrollIntoView === 'function') {
      todayRef.current.scrollIntoView({ block: 'start' })
      anchored.current = true
    } else if (before.current && scroller && days[0]?.date !== before.current.first) {
      scroller.scrollTop += scroller.scrollHeight - before.current.height
      before.current = null
    }
  }, [days])

  const loadOlder = () => {
    if (!q.hasPreviousPage || q.isFetchingPreviousPage || !anchored.current) return
    const scroller = todayRef.current?.closest<HTMLElement>('[data-tab-scroll]')
    before.current = { height: scroller?.scrollHeight ?? 0, first: days[0]?.date ?? '' }
    void q.fetchPreviousPage()
  }
  const loadNewer = () => { if (q.hasNextPage && !q.isFetchingNextPage && anchored.current) void q.fetchNextPage() }

  if (q.isPending) return <div className="space-y-3 px-4" aria-busy="true" aria-label="Loading agenda"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
  if (q.isError && !pages) {
    return <div role="alert" className="mx-4 rounded-2xl bg-surface p-4 text-center">Couldn't load the agenda. <button className="text-accent" onClick={() => void q.refetch()}>Retry</button></div>
  }

  return (
    <div aria-label="Agenda">
      <Sentinel onVisible={loadOlder} label="Earlier" />
      {days.map((d) => {
        const isToday = d.date === today
        const nothing = d.due.length + d.paid.length + d.notes.length === 0
        return (
          <section key={d.date} ref={isToday ? todayRef : undefined} aria-label={dayLabel(d.date, today)} className="mb-2">
            <button onClick={() => onOpenDay(d.date)} className={`sticky top-0 z-[1] flex min-h-11 w-full items-center bg-bg/95 px-4 text-left text-sm font-semibold backdrop-blur ${isToday ? 'text-accent' : 'text-muted'}`}>
              {dayLabel(d.date, today)}
            </button>
            {nothing ? <p className="px-4 pb-2 text-muted">{isToday ? 'Nothing today' : 'Nothing'}</p> : (
              <ul className="mx-4 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
                {d.due.map((i) => {
                  const l = rowLabel(asRow(i), today)
                  return (
                    <li key={`d-${i.entry_id}-${i.seq}`}>
                      <button onClick={() => onOpenEntry(i.entry_id)} aria-label={`${i.title}, instalment ${i.seq}, ${l.text}, open details`} className="flex min-h-14 w-full items-center justify-between gap-2 px-4 py-2 text-left">
                        <span className="min-w-0"><span className="block truncate font-medium">{i.title}</span>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLS[l.tone]}`}>{l.text}</span></span>
                        <Amount paise={i.remaining_paise} tone={i.direction === 'receive' ? 'in' : 'out'} className="shrink-0 font-semibold" />
                      </button>
                    </li>
                  )
                })}
                {d.paid.map((i) => {
                  const l = rowLabel(asRow(i), today)
                  return (
                    <li key={`p-${i.entry_id}-${i.seq}`}>
                      <button onClick={() => onOpenEntry(i.entry_id)} aria-label={`${i.title}, instalment ${i.seq}, ${l.text}, open details`} className="flex min-h-14 w-full items-center justify-between gap-2 px-4 py-2 text-left">
                        <span className="min-w-0"><span className="block truncate font-medium">{i.title}</span>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLS[l.tone]}`}>{l.text}</span></span>
                        <Amount paise={i.due_paise} tone={i.direction === 'receive' ? 'in' : 'out'} className="shrink-0 font-semibold" />
                      </button>
                    </li>
                  )
                })}
                {d.notes.map((n) => (
                  <li key={`n-${n.id}`}>
                    <button onClick={() => onOpenNote(n)} aria-label={`${n.title}, ${n.kind}, edit`} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left">
                      <span aria-hidden className="text-money-purple">{n.kind === 'task' ? (n.done && !n.repeat_rule ? '☑' : '☐') : '•'}</span>
                      <span className="min-w-0"><span className={`block truncate ${n.done && !n.repeat_rule ? 'text-muted line-through' : 'font-medium'}`}>{n.title}</span>
                        {describeRepeat(n.repeat_rule) && <span className="block text-sm text-muted">{describeRepeat(n.repeat_rule)}</span>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
      <Sentinel onVisible={loadNewer} label="Later" />
    </div>
  )
}
