import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { diffDays, hasDueDate } from '@/lib/dates'
import { interestToDate } from '@/lib/interest'
import { formatMoney } from '@/lib/money'
import { Amount } from '@/ui/Amount'
import { ConfirmSheet } from '@/ui/ConfirmSheet'
import { primaryBtn, secondaryBtn } from '@/ui/Field'
import { Skeleton } from '@/ui/Skeleton'
import { showUndo } from '@/ui/toastStore'
import { dayLabel } from '@/features/activity/group'
import { useToday } from '@/features/profile/useToday'
import { EditEntrySheet } from './EditEntrySheet'
import { EntryBadge } from './EntryBadge'
import { PaymentSheet } from './PaymentSheet'
import { dueText, entryStatusOf } from './status'
import { type EntryDetail, useDeleteEntry, useDeletePayment, useEntry, useMarkUnpaid, useRecordPayment } from './queries'

const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, '')}%`

function interestLine(e: EntryDetail, today: string): { main: string; extra?: string } {
  if (e.interest === 'none' || !e.rate_bps) return { main: 'No interest' }
  const added = formatMoney(e.total_payable_paise - e.principal_paise)
  if (e.interest === 'flat') return { main: `Flat ${pct(e.rate_bps)}, ${added} added` }
  const accrued = interestToDate({ principal: e.principal_paise, interest: 'simple', rateBps: e.rate_bps, startDate: e.start_date }, today)
  return { main: `Simple ${pct(e.rate_bps)} a year, ${added} to the due date`, extra: `Accrued so far: ${formatMoney(accrued)}` }
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4 py-2"><dt className="text-muted">{label}</dt><dd className="text-right">{children}</dd></div>
}

/** Entry detail: progress, payments, receive/pay, mark as unpaid, edit and delete. Shown as an overlay at /money/entry/:id. */
export default function EntryScreen({ id }: { id: string }) {
  const today = useToday()
  const navigate = useNavigate()
  const q = useEntry(id)
  const del = useDeleteEntry()
  const delPayment = useDeletePayment()
  const record = useRecordPayment()
  const unpaid = useMarkUnpaid()
  const [paying, setPaying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'unpaid' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const e = q.data
  const back = () => navigate('/money', { replace: true })

  let body
  if (q.isPending) body = <div className="space-y-3 p-4"><Skeleton className="h-40" /><Skeleton className="h-32" /></div>
  else if (q.isError) body = <div role="alert" className="m-4 rounded-2xl bg-surface p-4 text-center">Couldn't load this entry. <button className="text-accent" onClick={() => void q.refetch()}>Retry</button></div>
  else if (!e) body = <div className="m-4 rounded-2xl bg-surface p-4 text-center">This entry no longer exists.</div>
  else {
    const s = e.schedule_items[0]
    const total = s?.due_paise ?? e.total_payable_paise
    const paid = s?.paid_paise ?? 0
    const left = total - paid
    const dueDate = s?.due_date ?? e.due_date
    const status = entryStatusOf({ total_paise: total, paid_paise: paid, due_date: dueDate }, today)
    const progress = total > 0 ? Math.min(100, Math.round((paid * 100) / total)) : 0
    const receiving = e.direction === 'receive'
    const interest = interestLine(e, today)
    const payments = [...e.payments].sort((a, b) => (a.paid_on < b.paid_on ? 1 : a.paid_on > b.paid_on ? -1 : (b.created_at ?? '').localeCompare(a.created_at ?? '')))

    const removePayment = async (p: (typeof payments)[number]) => {
      setError(null)
      try {
        const gone = await delPayment.mutateAsync(p.id)
        showUndo(`Payment of ${formatMoney(gone.amount_paise)} deleted`, () =>
          record.mutate({ id: gone.id, entry_id: gone.entry_id, amount_paise: gone.amount_paise, paid_on: gone.paid_on, account_id: gone.account_id ?? '', mode: gone.mode, note: gone.note }))
      } catch (err) {
        setError((err as Error).message)
      }
    }

    body = (
      <div className="space-y-4 px-4 pb-8">
        <section aria-label="Progress" className="rounded-2xl bg-surface p-4 text-center">
          <div className="mb-1 flex items-center justify-center gap-2"><EntryBadge status={status} /><span className="text-sm text-muted">{dueText(dueDate, today, diffDays)}</span></div>
          <div className="text-sm text-muted">{status === 'paid' ? 'Settled' : receiving ? 'Still to receive' : 'Still to pay'}</div>
          <Amount paise={left} tone={status === 'paid' ? 'neutral' : receiving ? 'in' : 'out'} className="text-4xl font-bold" />
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Paid so far" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted"><span>{formatMoney(paid)} paid</span><span>of {formatMoney(total)}</span></div>
        </section>

        {e.status === 'open'
          ? <button className={primaryBtn} onClick={() => setPaying(true)}>{receiving ? 'Receive money' : 'Pay back'}</button>
          : <p className="text-center text-sm text-muted">Settled {e.settled_on ? dayLabel(e.settled_on, today) : ''}</p>}

        <dl className="divide-y divide-line rounded-2xl bg-surface px-4">
          <Line label={receiving ? 'Lent to' : 'Borrowed from'}>{e.people?.name ?? 'No person'}</Line>
          <Line label="Amount">{formatMoney(e.principal_paise)}</Line>
          <Line label="Interest">{interest.main}{interest.extra && <span className="block text-sm text-muted">{interest.extra}</span>}</Line>
          <Line label="Started">{dayLabel(e.start_date, today)}</Line>
          <Line label="Due">{hasDueDate(dueDate) ? dueDate : 'No due date'}</Line>
          {e.notes && <Line label="Notes">{e.notes}</Line>}
        </dl>

        <section aria-label="Payments">
          <h2 className="mb-2 text-sm font-medium text-muted">Payments</h2>
          {payments.length === 0 ? <p className="rounded-2xl bg-surface p-4 text-center text-muted">No payments yet.</p> : (
            <ul className="divide-y divide-line rounded-2xl bg-surface px-4">
              {payments.map((p) => (
                <li key={p.id} className="flex min-h-14 items-center justify-between gap-3">
                  <span className="min-w-0">
                    <Amount paise={p.amount_paise} tone={receiving ? 'in' : 'out'} className="font-semibold" />
                    <span className="block truncate text-sm text-muted">{dayLabel(p.paid_on, today)}{p.mode ? ` · ${p.mode}` : ''}{p.note ? ` · ${p.note}` : ''}</span>
                  </span>
                  <button className="min-h-11 px-2 text-sm text-money-red" aria-label={`Delete payment of ${formatMoney(p.amount_paise)}`} onClick={() => void removePayment(p)}>Delete</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && <p role="alert" className="text-sm text-money-red">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button className={secondaryBtn} onClick={() => setEditing(true)}>Edit</button>
          <button className={secondaryBtn} disabled={payments.length === 0} onClick={() => setConfirm('unpaid')}>Mark as unpaid</button>
        </div>
        <button className={`${secondaryBtn} text-money-red`} onClick={() => setConfirm('delete')}>Delete entry</button>

        {paying && <PaymentSheet entryId={e.id} direction={e.direction} remaining={left} today={today} defaultAccountId={payments[0]?.account_id} onClose={() => setPaying(false)} />}
        {editing && <EditEntrySheet entry={e} onClose={() => setEditing(false)} />}
        {confirm === 'unpaid' && (
          <ConfirmSheet title="Mark as unpaid?" confirmLabel="Mark as unpaid" busy={unpaid.isPending} onClose={() => setConfirm(null)}
            message={`This removes all ${payments.length} payment${payments.length === 1 ? '' : 's'} and their transactions, and the full ${formatMoney(total)} becomes due again.`}
            onConfirm={() => void unpaid.mutateAsync(e.id).then(() => setConfirm(null)).catch((err: Error) => { setError(err.message); setConfirm(null) })} />
        )}
        {confirm === 'delete' && (
          <ConfirmSheet title="Delete this entry?" confirmLabel="Delete entry" busy={del.isPending} onClose={() => setConfirm(null)}
            message="This removes the entry, its payments and the transactions they created, so account balances go back to how they were before. This cannot be undone."
            onConfirm={() => void del.mutateAsync(e.id).then(back).catch((err: Error) => { setError(err.message); setConfirm(null) })} />
        )}
      </div>
    )
  }

  return (
    <div className="pb-safe pt-safe fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-bg">
      <header className="sticky top-0 z-10 bg-bg/95 px-4 pb-2 pt-3 backdrop-blur">
        <Link to="/money" replace className="mb-1 inline-flex min-h-11 items-center text-accent">‹ Money</Link>
        <h1 className="truncate text-2xl font-bold">{e?.title ?? 'Entry'}</h1>
      </header>
      {body}
    </div>
  )
}
