import type { Paise } from './money'
import type { ScheduleRow } from './schedule'

export type RowChange =
  | { kind: 'moved'; seq: number; from: string; to: string }
  | { kind: 'amount'; seq: number; from: Paise; to: Paise }
  | { kind: 'removed'; seq: number; due_date: string; due_paise: Paise }
  | { kind: 'completed'; seq: number; paid_paise: Paise }

/** What a plan edit would do, row by row: shown to the user before they confirm. */
export function diffRows(before: ScheduleRow[], after: ScheduleRow[]): RowChange[] {
  const next = new Map(after.map((r) => [r.seq, r]))
  const out: RowChange[] = []
  for (const b of before) {
    const a = next.get(b.seq)
    if (!a) { out.push({ kind: 'removed', seq: b.seq, due_date: b.due_date, due_paise: b.due_paise }); continue }
    if (a.due_date !== b.due_date) out.push({ kind: 'moved', seq: b.seq, from: b.due_date, to: a.due_date })
    if (a.due_paise !== b.due_paise) {
      if (a.due_paise === a.paid_paise && a.paid_paise > 0) out.push({ kind: 'completed', seq: b.seq, paid_paise: a.paid_paise })
      else out.push({ kind: 'amount', seq: b.seq, from: b.due_paise, to: a.due_paise })
    }
  }
  return out
}

/** The last due date among rows that still owe something (the new "last instalment"), or null when nothing is owed. */
export function lastOpenDate(rows: ScheduleRow[]): string | null {
  const open = rows.filter((r) => r.due_paise > r.paid_paise).map((r) => r.due_date).sort()
  return open[open.length - 1] ?? null
}
