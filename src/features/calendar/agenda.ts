import type { DateStr } from '@/lib/dates'
import { occurrencesBetween } from '@/lib/repeat'
import type { CalendarItem, CalendarNote } from './types'

export interface AgendaDay {
  date: DateStr
  /** unpaid rows due this day (overdue ones sit on their own due date) */
  due: CalendarItem[]
  /** rows paid this day */
  paid: CalendarItem[]
  notes: CalendarNote[]
}

const isPaid = (i: CalendarItem) => i.paid_paise >= i.due_paise

/**
 * Items grouped by day inside [from, to]: unpaid rows on their due date, paid rows on the day they were paid, notes and tasks on
 * each of their occurrences. Only days that have something are returned, plus today (so the list always has an anchor).
 */
export function agendaDays(items: CalendarItem[], notes: CalendarNote[], from: DateStr, to: DateStr, today: DateStr): AgendaDay[] {
  const days = new Map<DateStr, AgendaDay>()
  const day = (date: DateStr): AgendaDay => {
    let d = days.get(date)
    if (!d) { d = { date, due: [], paid: [], notes: [] }; days.set(date, d) }
    return d
  }
  for (const it of items) {
    if (!isPaid(it)) { if (it.due_date >= from && it.due_date <= to) day(it.due_date).due.push(it) }
    else {
      const on = it.paid_on ?? it.due_date
      if (on >= from && on <= to) day(on).paid.push(it)
    }
  }
  for (const n of notes) for (const d of occurrencesBetween(n.date, n.repeat_rule, from, to)) day(d).notes.push(n)
  if (today >= from && today <= to) day(today)
  return [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** The range covered by loaded agenda windows. */
export const loadedRange = (windows: { from: DateStr; to: DateStr }[]): { from: DateStr; to: DateStr } => ({
  from: windows[0]?.from ?? '2000-01-01',
  to: windows[windows.length - 1]?.to ?? '2000-01-01',
})

/** Rows and notes from several windows without duplicates (windows do not overlap, but a row can be due in one and paid in another). */
export function mergeWindows(windows: { items: CalendarItem[]; notes: CalendarNote[] }[]): { items: CalendarItem[]; notes: CalendarNote[] } {
  const items = new Map<string, CalendarItem>()
  const notes = new Map<string, CalendarNote>()
  for (const w of windows) {
    for (const i of w.items) items.set(`${i.entry_id}:${i.seq}`, i)
    for (const n of w.notes) notes.set(n.id, n)
  }
  return { items: [...items.values()], notes: [...notes.values()] }
}
