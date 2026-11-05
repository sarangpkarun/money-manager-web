import type { ActivityRow } from '@/lib/db'
import type { CalItem, CalNote } from '@/lib/markers'

export interface CalendarItem extends CalItem {
  kind: string
  name: string | null
  remaining_paise: number
}

export interface CalendarNote extends CalNote {
  body: string | null
  entry_id: string | null
  /** instant the note should ring (ISO), if any */
  remind_at?: string | null
}

export interface CalendarDay { date: string; spent: number; received: number; txn_count: number }

/** Output of `calendar_month`. */
export interface CalendarMonth {
  month: string
  start: string
  end: string
  totals: { spent: number; received: number; dues_paise: number; overdue_paise: number }
  days: CalendarDay[]
  items: CalendarItem[]
  txns: ActivityRow[]
  notes: CalendarNote[]
}

/** Output of `calendar_agenda`. */
export interface AgendaWindow { from: string; to: string; items: CalendarItem[]; notes: CalendarNote[] }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Cheap runtime guard so a server/client mismatch shows the error state instead of rendering NaN. */
export function parseCalendarMonth(data: unknown): CalendarMonth {
  const d = data as Partial<CalendarMonth> | null
  const t = d?.totals
  const ok = !!d && !!t && ['spent', 'received', 'dues_paise', 'overdue_paise'].every((k) => isNum((t as unknown as Record<string, unknown>)[k]))
    && Array.isArray(d.days) && Array.isArray(d.items) && Array.isArray(d.txns) && Array.isArray(d.notes)
  if (!ok) throw new Error('Unexpected calendar response')
  return d as CalendarMonth
}

export function parseAgendaWindow(data: unknown): AgendaWindow {
  const d = data as Partial<AgendaWindow> | null
  if (!d || !Array.isArray(d.items) || !Array.isArray(d.notes) || typeof d.from !== 'string' || typeof d.to !== 'string') throw new Error('Unexpected agenda response')
  return d as AgendaWindow
}
