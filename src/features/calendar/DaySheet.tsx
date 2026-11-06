import { useToasts, showUndo } from '@/ui/toastStore'
import { rowLabel } from '@/lib/labels'
import { describeRepeat, occurrencesBetween } from '@/lib/repeat'
import type { ScheduleRow } from '@/lib/schedule'
import { Amount } from '@/ui/Amount'
import { secondaryBtn } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { TxnRow } from '@/features/activity/TxnRow'
import { TONE_CLS } from '@/features/money/status'
import { shortDate, longDate } from './dateText'
import { useProfile } from '@/features/profile/useProfile'
import { useTickTask, useUndoTick } from './queries'
import type { CalendarItem, CalendarMonth, CalendarNote } from './types'

const asRow = (i: CalendarItem): ScheduleRow => ({ seq: i.seq, due_date: i.due_date, due_paise: i.due_paise, principal_paise: i.due_paise, interest_paise: 0, paid_paise: i.paid_paise, paid_on: i.paid_on })
const isPaid = (i: CalendarItem) => i.paid_paise >= i.due_paise

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section aria-label={title}><h3 className="mb-1 text-sm font-medium text-muted">{title}</h3>{children}</section>
}

/** Everything about one day, computed from the cached month payload (opens instantly, no request). */
export function DaySheet({ date, data, today, onClose, onPay, onOpenEntry, onOpenActivity, onAddTxn, onAddNote, onEditNote }: {
  date: string; data: CalendarMonth; today: string
  onClose: () => void
  onPay: (i: CalendarItem) => void
  onOpenEntry: (id: string) => void
  onOpenActivity: (date: string) => void
  onAddTxn: () => void
  onAddNote: () => void
  onEditNote: (n: CalendarNote) => void
}) {
  const tick = useTickTask()
  const timezone = useProfile().data?.timezone
  const undoTick = useUndoTick()

  const due = data.items.filter((i) => !isPaid(i) && i.due_date === date)
  const paid = data.items.filter((i) => isPaid(i) && ((i.paid_on ?? i.due_date) === date || i.due_date === date))
  const txns = data.txns.filter((t) => t.date === date)
  const total = data.days.find((d) => d.date === date)?.txn_count ?? txns.length
  const notes = data.notes.filter((n) => occurrencesBetween(n.date, n.repeat_rule, date, date).length > 0)
  const empty = due.length + paid.length + txns.length + notes.length === 0

  const onTick = async (n: CalendarNote) => {
    try {
      const r = await tick.mutateAsync({ id: n.id, date: n.date, repeat_rule: n.repeat_rule, done: n.done, remind_at: n.remind_at ?? null, ...(timezone ? { timezone } : {}) })
      showUndo(r.movedTo ? `"${n.title}" done · next ${shortDate(r.movedTo)}` : n.done ? `"${n.title}" reopened` : `"${n.title}" done`, () => undoTick.mutate(r.undo))
    } catch (e) {
      useToasts.getState().show({ message: `Couldn't update: ${(e as Error).message}` })
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={longDate(date)}>
      <div className="space-y-4">
        {empty && <p className="py-4 text-center text-muted">Nothing on this day.</p>}

        {due.length > 0 && (
          <Section title="Due">
            <ul className="divide-y divide-line">
              {due.map((i) => {
                const label = rowLabel(asRow(i), today)
                return (
                  <li key={`${i.entry_id}-${i.seq}`} className="flex min-h-14 items-center gap-2 py-1">
                    <button className="min-w-0 flex-1 text-left" onClick={() => onOpenEntry(i.entry_id)} aria-label={`${i.title}, instalment ${i.seq}, open details`}>
                      <span className="block truncate font-medium">{i.title}</span>
                      <span className="flex items-center gap-2 text-sm text-muted">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLS[label.tone]}`}>{label.text}</span>
                        {i.name && <span className="truncate">{i.name}</span>}
                      </span>
                    </button>
                    <Amount paise={i.remaining_paise} tone={i.direction === 'receive' ? 'in' : 'out'} className="shrink-0 font-semibold" />
                    <button onClick={() => onPay(i)} aria-label={`${i.direction === 'receive' ? 'Receive' : 'Pay'} ${i.title}`} className="min-h-11 shrink-0 rounded-full bg-accent px-4 text-sm font-medium text-on-accent">
                      {i.direction === 'receive' ? 'Receive' : 'Pay'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </Section>
        )}

        {paid.length > 0 && (
          <Section title="Paid">
            <ul className="divide-y divide-line">
              {paid.map((i) => {
                const label = rowLabel(asRow(i), today)
                const paidHere = (i.paid_on ?? i.due_date) === date
                return (
                  <li key={`${i.entry_id}-${i.seq}`}>
                    <button className="flex min-h-14 w-full items-center justify-between gap-2 text-left" onClick={() => onOpenEntry(i.entry_id)} aria-label={`${i.title}, instalment ${i.seq}, ${label.text}, open details`}>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{i.title}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLS[label.tone]}`}>{label.text}</span>
                          <span>{paidHere ? (i.paid_on && i.paid_on !== i.due_date ? `was due ${shortDate(i.due_date)}` : 'on the due date') : `paid ${shortDate(i.paid_on as string)}`}</span>
                        </span>
                      </span>
                      <Amount paise={i.due_paise} tone={i.direction === 'receive' ? 'in' : 'out'} className="shrink-0 font-semibold" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </Section>
        )}

        {txns.length > 0 && (
          <Section title="Spending & income">
            <div className="-mx-4 divide-y divide-line">
              {txns.map((t) => <TxnRow key={t.id} row={t} onOpen={() => onOpenActivity(date)} />)}
            </div>
            {total > txns.length && <button className="min-h-11 text-sm font-medium text-accent" onClick={() => onOpenActivity(date)}>See all {total} in Activity</button>}
          </Section>
        )}

        {notes.length > 0 && (
          <Section title="Notes & tasks">
            <ul className="divide-y divide-line">
              {notes.map((n) => {
                const done = n.kind === 'task' && !n.repeat_rule && n.done
                return (
                  <li key={n.id} className="flex min-h-12 items-center gap-2">
                    {n.kind === 'task' ? (
                      <button role="checkbox" aria-checked={done} aria-label={`${done ? 'Reopen' : 'Mark done'}: ${n.title}`} onClick={() => void onTick(n)}
                              className={`flex h-11 w-11 shrink-0 items-center justify-center text-lg ${done ? 'text-money-green' : 'text-muted'}`}>{done ? '☑' : '☐'}</button>
                    ) : <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center text-money-purple">•</span>}
                    <button className="min-w-0 flex-1 py-2 text-left" onClick={() => onEditNote(n)} aria-label={`${n.title}, edit`}>
                      <span className={`block truncate ${done ? 'text-muted line-through' : 'font-medium'}`}>{n.title}</span>
                      {(describeRepeat(n.repeat_rule) || n.body) && <span className="block truncate text-sm text-muted">{[describeRepeat(n.repeat_rule), n.body].filter(Boolean).join(' · ')}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </Section>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button className={secondaryBtn} onClick={onAddTxn}>Add transaction</button>
          <button className={secondaryBtn} onClick={onAddNote}>Add note / task</button>
        </div>
      </div>
    </Sheet>
  )
}
