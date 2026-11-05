import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isPaid, remaining } from '@/lib/allocate'
import { diffDays, hasDueDate } from '@/lib/dates'
import { formatDisplayDate } from '@/lib/display'
import { interestToDate } from '@/lib/interest'
import { rowLabel } from '@/lib/labels'
import { formatMoney } from '@/lib/money'
import type { ScheduleRow } from '@/lib/schedule'
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
import { ChangeAmountSheet, EstimateSheet, ExtraPaymentSheet, SkipSheet } from './PlanActions'
import { dueText, entryStatusOf, TONE_CLS } from './status'
import { type EntryDetail, useDeleteEntry, useDeletePayment, useEntry, useMarkUnpaid, useRecordPayment, useUpdateEntry } from './queries'
import { useUi } from '@/lib/uiStore'

const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, '')}%`
const KIND_NAME: Record<string, string> = { lent: 'Lent to', borrowed: 'Borrowed from', emi_purchase: 'Bought from', instalment: 'Instalments with', on_behalf: 'Paid for' }

function interestLine(e: EntryDetail, today: string): { main: string; extra?: string } {
  if (e.no_cost) return { main: 'No-cost EMI (no interest)' }
  if (e.interest === 'none' || !e.rate_bps) return { main: 'No interest' }
  const added = formatMoney(e.total_payable_paise - e.principal_paise)
  if (e.interest === 'flat') return { main: `Flat ${pct(e.rate_bps)}, ${added} added` }
  if (e.interest === 'reducing') return { main: `${pct(e.rate_bps)} a year on the reducing balance, ${added} interest in total` }
  const accrued = interestToDate({ principal: e.principal_paise, interest: 'simple', rateBps: e.rate_bps, startDate: e.start_date }, today)
  return { main: `Simple ${pct(e.rate_bps)} a year, ${added} to the due date`, extra: `Accrued so far: ${formatMoney(accrued)}` }
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4 py-2"><dt className="text-muted">{label}</dt><dd className="text-right">{children}</dd></div>
}

interface CashMove { key: string; id: string; amount: number; paid_on: string; mode: string | null; note: string | null; extra: boolean; account_id: string | null; created: string }

/** Parts of one payment share a transaction: show them as one cash movement. */
function groupPayments(payments: EntryDetail['payments']): CashMove[] {
  const map = new Map<string, CashMove>()
  for (const p of payments) {
    const key = p.txn_id ?? p.id
    const g = map.get(key)
    if (g) g.amount += p.amount_paise
    else map.set(key, { key, id: p.id, amount: p.amount_paise, paid_on: p.paid_on, mode: p.mode, note: p.note, extra: !p.schedule_item_id, account_id: p.account_id, created: p.created_at ?? '' })
  }
  return [...map.values()].sort((a, b) => (a.paid_on < b.paid_on ? 1 : a.paid_on > b.paid_on ? -1 : b.created.localeCompare(a.created)))
}

type RowSheet = { kind: 'pay' | 'skip' | 'change'; seq: number } | null

/** Entry detail: progress, plan rows, payments, receive/pay, plan edits, mark as unpaid, edit, delete. Overlay at /money/entry/:id. */
export default function EntryScreen({ id }: { id: string }) {
  const today = useToday()
  const navigate = useNavigate()
  const q = useEntry(id)
  const del = useDeleteEntry()
  const delPayment = useDeletePayment()
  const record = useRecordPayment()
  const unpaid = useMarkUnpaid()
  const updateEntry = useUpdateEntry()
  const setActivitySearch = useUi((s) => s.setActivitySearch)
  const [paying, setPaying] = useState(false)
  const [rowSheet, setRowSheet] = useState<RowSheet>(null)
  const [extraOpen, setExtraOpen] = useState(false)
  const [estimateOpen, setEstimateOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'unpaid' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const e = q.data
  const back = () => navigate('/money', { replace: true })
  const rows = useMemo<ScheduleRow[]>(
    () => [...(e?.schedule_items ?? [])].sort((a, b) => a.seq - b.seq).map(({ seq, due_date, due_paise, principal_paise, interest_paise, paid_paise, paid_on }) => ({ seq, due_date, due_paise, principal_paise, interest_paise, paid_paise, paid_on })),
    [e?.schedule_items],
  )

  let body
  if (q.isPending) body = <div className="space-y-3 p-4"><Skeleton className="h-40" /><Skeleton className="h-32" /></div>
  else if (q.isError) body = <div role="alert" className="m-4 rounded-2xl bg-surface p-4 text-center">Couldn't load this entry. <button className="text-accent" onClick={() => void q.refetch()}>Retry</button></div>
  else if (!e) body = <div className="m-4 rounded-2xl bg-surface p-4 text-center">This entry no longer exists.</div>
  else {
    const multi = rows.length > 1
    const left = rows.reduce((s, r) => s + Math.max(remaining(r), 0), 0)
    const extraPaid = e.payments.filter((p) => !p.schedule_item_id).reduce((s, p) => s + p.amount_paise, 0)
    const paid = rows.reduce((s, r) => s + r.paid_paise, 0) + extraPaid
    const total = paid + left
    const nextRow = rows.find((r) => !isPaid(r))
    const nextDue = nextRow && hasDueDate(nextRow.due_date) ? nextRow.due_date : null
    const status = entryStatusOf({ total_paise: total, paid_paise: paid, due_date: nextDue }, today)
    const progress = total > 0 ? Math.min(100, Math.round((paid * 100) / total)) : 0
    const receiving = e.direction === 'receive'
    const interest = interestLine(e, today)
    const moves = groupPayments(e.payments)
    const open = e.status === 'open'
    const hasExtra = extraPaid > 0

    const removePayment = async (m: CashMove) => {
      setError(null)
      try {
        const gone = await delPayment.mutateAsync(m.id)
        showUndo(`Payment of ${formatMoney(gone.amount_paise)} deleted`, () =>
          record.mutate({ id: gone.id, entry_id: gone.entry_id, amount_paise: gone.amount_paise, paid_on: gone.paid_on, account_id: gone.account_id ?? '', mode: gone.mode, note: gone.note, target_seq: gone.target_seq ?? null }))
      } catch (err) {
        setError((err as Error).message)
      }
    }

    const sheetRow = rowSheet ? rows.find((r) => r.seq === rowSheet.seq) : undefined

    body = (
      <div className="space-y-4 px-4 pb-8">
        <section aria-label="Progress" className="rounded-2xl bg-surface p-4 text-center">
          <div className="mb-1 flex items-center justify-center gap-2"><EntryBadge status={status} /><span className="text-sm text-muted">{dueText(nextDue, today, diffDays)}</span></div>
          <div className="text-sm text-muted">{status === 'paid' ? 'Settled' : receiving ? 'Still to receive' : 'Still to pay'}</div>
          <Amount paise={left} tone={status === 'paid' ? 'neutral' : receiving ? 'in' : 'out'} className="text-4xl font-bold" />
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Paid so far" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted"><span>{formatMoney(paid)} paid</span><span>of {formatMoney(total)}</span></div>
        </section>

        {open
          ? <button className={primaryBtn} onClick={() => setPaying(true)}>{receiving ? 'Receive money' : 'Pay back'}</button>
          : <p className="text-center text-sm text-muted">Settled {e.settled_on ? dayLabel(e.settled_on, today) : ''}</p>}

        {multi && (
          <section aria-label="Instalments">
            <h2 className="mb-2 text-sm font-medium text-muted">Instalments · {rows.filter(isPaid).length} of {rows.length} paid</h2>
            <ul className="divide-y divide-line rounded-2xl bg-surface px-4">
              {rows.map((r) => {
                const label = rowLabel(r, today)
                return (
                  <li key={r.seq} className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">#{r.seq} · {hasDueDate(r.due_date) ? dayLabel(r.due_date, today) : 'No due date'}</span>
                      <Amount paise={r.due_paise} className="font-semibold" />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLS[label.tone]}`}>{label.text}</span>
                      {open && !isPaid(r) && (
                        <span className="flex items-center gap-1">
                          <button className="min-h-11 px-2 text-sm font-medium text-accent" aria-label={`Pay instalment ${r.seq}`} onClick={() => setRowSheet({ kind: 'pay', seq: r.seq })}>{receiving ? 'Receive' : 'Pay'}</button>
                          <button className="min-h-11 px-2 text-sm text-muted" aria-label={`Skip month from instalment ${r.seq}`} onClick={() => setRowSheet({ kind: 'skip', seq: r.seq })}>Skip</button>
                          <button className="min-h-11 px-2 text-sm text-muted" aria-label={`Change amount of instalment ${r.seq}`} onClick={() => setRowSheet({ kind: 'change', seq: r.seq })}>Change</button>
                        </span>
                      )}
                    </div>
                    {r.paid_paise > 0 && !isPaid(r) && <div className="mt-1 text-xs text-muted">{formatMoney(r.paid_paise)} paid so far</div>}
                  </li>
                )
              })}
            </ul>
            {open && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button className={secondaryBtn} onClick={() => setExtraOpen(true)}>Extra payment</button>
                <button className={secondaryBtn} onClick={() => setEstimateOpen(true)}>Prepay estimate</button>
              </div>
            )}
          </section>
        )}

        {e.kind === 'on_behalf' && e.source && (
          <section aria-label="Linked purchase" className="rounded-2xl bg-surface p-4">
            <h2 className="mb-1 text-sm font-medium text-muted">Linked purchase</h2>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{e.source.title ?? 'Purchase'}</div>
                <div className="text-sm text-muted">{dayLabel(e.source.date, today)}{e.source.accounts ? ` · ${e.source.accounts.name}` : ''}</div>
              </div>
              <div className="shrink-0 text-right text-sm">
                <div className="tabular font-semibold">{formatMoney(e.source.amount_paise)}</div>
                <div className="text-muted">your share {formatMoney(e.source.amount_paise - e.source.for_other_paise)}</div>
              </div>
            </div>
            <button className="mt-2 min-h-11 text-sm font-medium text-accent"
                    onClick={() => { const qs = `?d=custom&from=${e.source!.date}&to=${e.source!.date}`; setActivitySearch(qs); navigate({ pathname: '/activity', search: qs }) }}>View purchase</button>
          </section>
        )}

        <dl className="divide-y divide-line rounded-2xl bg-surface px-4">
          <Line label={KIND_NAME[e.kind] ?? 'With'}>{e.people?.name ?? e.party_name ?? 'No person'}</Line>
          {e.kind === 'emi_purchase' || e.kind === 'instalment'
            ? <><Line label="Price">{formatMoney(e.principal_paise + (e.down_payment_paise ?? 0))}</Line>{(e.down_payment_paise ?? 0) > 0 && <Line label="Down payment">{formatMoney(e.down_payment_paise ?? 0)}</Line>}<Line label="Financed">{formatMoney(e.principal_paise)}</Line></>
            : <Line label="Amount">{formatMoney(e.principal_paise)}</Line>}
          <Line label="Interest">{interest.main}{interest.extra && <span className="block text-sm text-muted">{interest.extra}</span>}</Line>
          <Line label="Started">{dayLabel(e.start_date, today)}</Line>
          {!multi && <Line label="Due">{hasDueDate(rows[0]?.due_date) ? formatDisplayDate(rows[0]!.due_date) : 'No due date'}</Line>}
          {multi && <Line label="Last instalment">{formatDisplayDate(rows[rows.length - 1]!.due_date)}</Line>}
          {e.notes && <Line label="Notes">{e.notes}</Line>}
        </dl>

        <section aria-label="Payments">
          <h2 className="mb-2 text-sm font-medium text-muted">Payments</h2>
          {moves.length === 0 ? <p className="rounded-2xl bg-surface p-4 text-center text-muted">No payments yet.</p> : (
            <ul className="divide-y divide-line rounded-2xl bg-surface px-4">
              {moves.map((m) => (
                <li key={m.key} className="flex min-h-14 items-center justify-between gap-3">
                  <span className="min-w-0">
                    <Amount paise={m.amount} tone={receiving ? 'in' : 'out'} className="font-semibold" />
                    <span className="block truncate text-sm text-muted">{dayLabel(m.paid_on, today)}{m.extra ? ' · extra payment' : ''}{m.mode ? ` · ${m.mode}` : ''}{m.note ? ` · ${m.note}` : ''}</span>
                  </span>
                  {!m.extra && <button className="min-h-11 px-2 text-sm text-money-red" aria-label={`Delete payment of ${formatMoney(m.amount)}`} onClick={() => void removePayment(m)}>Delete</button>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {open && (
          <label className="flex min-h-12 items-center justify-between rounded-2xl bg-surface px-4">
            <span>Remind me</span>
            <input type="checkbox" role="switch" aria-label="Remind me" checked={e.remind} disabled={updateEntry.isPending}
                   onChange={(ev) => void updateEntry.mutateAsync({ id: e.id, patch: { remind: ev.target.checked } }).catch((err: Error) => setError(err.message))} className="h-6 w-6" />
          </label>
        )}

        {error && <p role="alert" className="text-sm text-money-red">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button className={secondaryBtn} onClick={() => setEditing(true)}>Edit</button>
          <button className={secondaryBtn} disabled={moves.length === 0 || hasExtra} onClick={() => setConfirm('unpaid')}>Mark as unpaid</button>
        </div>
        {hasExtra && <p className="text-xs text-muted">This plan was shortened by an extra payment, so it cannot be reset. Delete the entry to start over.</p>}
        <button className={`${secondaryBtn} text-money-red`} onClick={() => setConfirm('delete')}>Delete entry</button>

        {paying && <PaymentSheet entryId={e.id} direction={e.direction} remaining={left} suggested={multi ? (nextRow ? remaining(nextRow) : left) : undefined} today={today}
                                 defaultAccountId={moves[0]?.account_id} onClose={() => setPaying(false)} />}
        {rowSheet?.kind === 'pay' && sheetRow && (
          <PaymentSheet entryId={e.id} direction={e.direction} remaining={left} suggested={remaining(sheetRow)} targetSeq={sheetRow.seq} today={today}
                        defaultAccountId={moves[0]?.account_id} onClose={() => setRowSheet(null)} />
        )}
        {rowSheet?.kind === 'skip' && <SkipSheet entryId={e.id} rows={rows} seq={rowSheet.seq} today={today} onClose={() => setRowSheet(null)} />}
        {rowSheet?.kind === 'change' && <ChangeAmountSheet entryId={e.id} rows={rows} seq={rowSheet.seq} today={today} onClose={() => setRowSheet(null)} />}
        {extraOpen && <ExtraPaymentSheet entryId={e.id} rows={rows} today={today} defaultAccountId={moves[0]?.account_id} onClose={() => setExtraOpen(false)} />}
        {estimateOpen && <EstimateSheet rows={rows} today={today} onClose={() => setEstimateOpen(false)} />}
        {editing && <EditEntrySheet entry={e} onClose={() => setEditing(false)} />}
        {confirm === 'unpaid' && (
          <ConfirmSheet title="Mark as unpaid?" confirmLabel="Mark as unpaid" busy={unpaid.isPending} onClose={() => setConfirm(null)}
            message={`This removes all ${moves.length} payment${moves.length === 1 ? '' : 's'} and their transactions, and the full ${formatMoney(total)} becomes due again.`}
            onConfirm={() => void unpaid.mutateAsync(e.id).then(() => setConfirm(null)).catch((err: Error) => { setError(err.message); setConfirm(null) })} />
        )}
        {confirm === 'delete' && (
          <ConfirmSheet title="Delete this entry?" confirmLabel="Delete entry" busy={del.isPending} onClose={() => setConfirm(null)}
            message={e.kind === 'on_behalf'
              ? 'This removes what this friend owes, their payments and the transactions those created, so account balances go back to how they were before. The purchase stays and counts fully as your spend. This cannot be undone.'
              : 'This removes the entry, its payments and the transactions they created, so account balances go back to how they were before. This cannot be undone.'}
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
