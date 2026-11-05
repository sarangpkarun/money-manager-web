import { diffDays, type DateStr } from './dates'
import { isPaid, remaining } from './allocate'
import type { Paise } from './money'
import type { ScheduleRow } from './schedule'

/** Semantic colour tokens (spec 6.1): green on-time/in, blue early, amber late/due, red overdue, grey settled. */
export type Tone = 'green' | 'blue' | 'amber' | 'red' | 'grey'

export type RowLabelKind =
  | 'paid_early' | 'paid_on_time' | 'paid_late' | 'paid' // paid = fully paid but no date recorded
  | 'overdue' | 'overdue_partial' | 'upcoming'

export interface RowLabel {
  kind: RowLabelKind
  /** Early/late/overdue days; days until due for 'upcoming' (0 = due today). */
  days: number
  tone: Tone
  text: string
}

const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`

/** Spec 4.4: early / on time / late / overdue / upcoming for one plan row. "Overdue" starts the day AFTER the due date. */
export function rowLabel(row: ScheduleRow, today: DateStr): RowLabel {
  if (isPaid(row)) {
    if (!row.paid_on) return { kind: 'paid', days: 0, tone: 'green', text: 'Paid' }
    const delta = diffDays(row.paid_on, row.due_date) // positive = paid before the due date
    if (delta > 0) return { kind: 'paid_early', days: delta, tone: 'blue', text: `Paid early (${plural(delta)})` }
    if (delta === 0) return { kind: 'paid_on_time', days: 0, tone: 'green', text: 'Paid on time' }
    return { kind: 'paid_late', days: -delta, tone: 'amber', text: `Paid late (${plural(-delta)})` }
  }
  const late = diffDays(row.due_date, today)
  if (late > 0) {
    return row.paid_paise > 0
      ? { kind: 'overdue_partial', days: late, tone: 'red', text: `Overdue (partial, ${plural(late)} late)` }
      : { kind: 'overdue', days: late, tone: 'red', text: `Overdue (${plural(late)} late)` }
  }
  const until = 0 - late // not `-late`: that would be -0 on the due date
  return { kind: 'upcoming', days: until, tone: 'amber', text: until === 0 ? 'Due today' : `Due in ${plural(until)}` }
}

export type EntryStatusLabel = 'paid' | 'overdue' | 'partial' | 'pending'

/** Pending / Partial / Overdue / Paid for an entry from its totals and (optionally) its earliest unpaid due date. */
export function statusFromTotals(total: Paise, paid: Paise, overdueDue: DateStr | null, today: DateStr): EntryStatusLabel {
  if (paid >= total) return 'paid'
  if (overdueDue !== null && overdueDue < today) return 'overdue'
  return paid > 0 ? 'partial' : 'pending'
}

/** Entry status from plan rows: any unpaid row past its due date makes the entry overdue. */
export function entryStatus(rows: ScheduleRow[], today: DateStr): EntryStatusLabel {
  const total = rows.reduce((s, r) => s + r.due_paise, 0)
  const paid = rows.reduce((s, r) => s + r.paid_paise, 0)
  const firstOverdue = rows.filter((r) => remaining(r) > 0 && r.due_date < today).map((r) => r.due_date).sort()[0] ?? null
  return statusFromTotals(total, paid, firstOverdue, today)
}
