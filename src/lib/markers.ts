import type { DateStr } from './dates'
import { occurrencesBetween } from './repeat'

export type MarkerKind = 'overdue' | 'due' | 'paid_early' | 'paid_late' | 'paid_on_time' | 'task' | 'note' | 'task_done'
export type MarkerTone = 'red' | 'amber' | 'blue' | 'green' | 'purple' | 'grey'

export interface Marker {
  kind: MarkerKind
  tone: MarkerTone
  /** ✓ instead of a dot */
  tick: boolean
  /** how many items this marker stands for that day */
  count: number
  /** plain words for screen readers ("paid early") */
  label: string
}

/** A plan row as `calendar_month` / `calendar_agenda` return it. */
export interface CalItem {
  entry_id: string
  seq: number
  title: string
  direction: 'receive' | 'pay'
  due_date: DateStr
  due_paise: number
  paid_paise: number
  paid_on: DateStr | null
}

export interface CalNote {
  id: string
  kind: 'note' | 'task'
  title: string
  date: DateStr
  repeat_rule: string | null
  done: boolean
}

export interface Layers { dues: boolean; spending: boolean; notes: boolean }
export const ALL_LAYERS: Layers = { dues: true, spending: true, notes: true }

/** Most important first: what is late and unpaid must never be hidden by the 3-marker cap. */
const ORDER: MarkerKind[] = ['overdue', 'due', 'paid_early', 'paid_late', 'paid_on_time', 'task', 'note', 'task_done']
const SPEC: Record<MarkerKind, { tone: MarkerTone; tick: boolean; label: string }> = {
  overdue: { tone: 'red', tick: false, label: 'overdue' },
  due: { tone: 'amber', tick: false, label: 'due' },
  paid_early: { tone: 'blue', tick: true, label: 'paid early' },
  paid_late: { tone: 'amber', tick: true, label: 'paid late' },
  paid_on_time: { tone: 'green', tick: true, label: 'paid on time' },
  task: { tone: 'purple', tick: false, label: 'task' },
  note: { tone: 'purple', tick: false, label: 'note' },
  task_done: { tone: 'grey', tick: true, label: 'task done' },
}

export const MAX_MARKERS = 3

type Bucket = Map<DateStr, Map<MarkerKind, number>>

const add = (b: Bucket, date: DateStr, kind: MarkerKind) => {
  const day = b.get(date) ?? new Map<MarkerKind, number>()
  day.set(kind, (day.get(kind) ?? 0) + 1)
  b.set(date, day)
}

/**
 * Markers per day for plan rows and notes/tasks, inside [range.from, range.to]. Each day's list is ordered by importance and NOT capped
 * (use `visibleMarkers` to draw; use the whole list for accessible text).
 *  - unpaid row: red on its due date if that is before today, amber otherwise (a part-paid row is still unpaid)
 *  - paid on the due date, or with no recorded paid date: green ✓ on the due date
 *  - paid EARLY: blue ✓ on the due date AND on the day it was paid
 *  - paid LATE: amber ✓ on the due date AND on the day it was paid
 *  - open note: purple; open task: purple; completed one-off task: grey ✓ (a repeating task is never "done": ticking moves it)
 */
export function markersByDay(items: CalItem[], notes: CalNote[], today: DateStr, layers: Layers, range: { from: DateStr; to: DateStr }): Map<DateStr, Marker[]> {
  const bucket: Bucket = new Map()
  const inRange = (d: DateStr) => d >= range.from && d <= range.to
  if (layers.dues) {
    for (const it of items) {
      if (it.paid_paise < it.due_paise) {
        if (inRange(it.due_date)) add(bucket, it.due_date, it.due_date < today ? 'overdue' : 'due')
        continue
      }
      if (!it.paid_on || it.paid_on === it.due_date) {
        if (inRange(it.due_date)) add(bucket, it.due_date, 'paid_on_time')
        continue
      }
      const kind: MarkerKind = it.paid_on < it.due_date ? 'paid_early' : 'paid_late'
      if (inRange(it.due_date)) add(bucket, it.due_date, kind)
      if (inRange(it.paid_on)) add(bucket, it.paid_on, kind)
    }
  }
  if (layers.notes) {
    for (const n of notes) {
      const repeats = !!n.repeat_rule
      const kind: MarkerKind = n.kind === 'note' ? 'note' : !repeats && n.done ? 'task_done' : 'task'
      for (const d of occurrencesBetween(n.date, n.repeat_rule, range.from, range.to)) add(bucket, d, kind)
    }
  }
  const out = new Map<DateStr, Marker[]>()
  for (const [date, kinds] of bucket) {
    out.set(date, ORDER.filter((k) => kinds.has(k)).map((k) => ({ kind: k, count: kinds.get(k) as number, ...SPEC[k] })))
  }
  return out
}

export const visibleMarkers = (list: Marker[] | undefined): Marker[] => (list ?? []).slice(0, MAX_MARKERS)

/** "2 overdue, 1 paid early" */
export function markerSummary(list: Marker[] | undefined): string {
  return (list ?? []).map((m) => `${m.count} ${m.label}`).join(', ')
}
