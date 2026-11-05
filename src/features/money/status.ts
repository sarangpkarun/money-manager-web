import { hasDueDate, type DateStr } from '@/lib/dates'
import { statusFromTotals, type EntryStatusLabel, type Tone } from '@/lib/labels'

/** Pending / Partial / Overdue / Paid, the same words everywhere (lists, detail, Home). */
export function entryStatusOf(e: { total_paise: number; paid_paise: number; due_date: DateStr | null }, today: DateStr): EntryStatusLabel {
  return statusFromTotals(e.total_paise, e.paid_paise, hasDueDate(e.due_date) ? e.due_date : null, today)
}

export const STATUS_TEXT: Record<EntryStatusLabel, string> = { pending: 'Pending', partial: 'Partial', overdue: 'Overdue', paid: 'Paid' }
export const STATUS_TONE: Record<EntryStatusLabel, Tone> = { pending: 'amber', partial: 'blue', overdue: 'red', paid: 'green' }

/** Tailwind classes per tone for small badges. */
export const TONE_CLS: Record<Tone, string> = {
  green: 'bg-money-green/15 text-money-green', blue: 'bg-money-blue/15 text-money-blue', amber: 'bg-money-amber/15 text-money-amber',
  red: 'bg-money-red/15 text-money-red', grey: 'bg-surface-2 text-muted',
}

/** "Due 12 Dec" / "No due date" helper text input (days until due, negative when late). */
export function dueText(due: DateStr | null, today: DateStr, diff: (a: DateStr, b: DateStr) => number): string {
  if (!hasDueDate(due)) return 'No due date'
  const left = diff(today, due)
  if (left === 0) return 'Due today'
  return left > 0 ? `Due in ${left} day${left === 1 ? '' : 's'}` : `${-left} day${left === -1 ? '' : 's'} overdue`
}
