import { useMemo, useState } from 'react'
import { useAccounts } from '@/features/accounts/queries'
import { dayLabel } from '@/features/activity/group'
import { evaluateAmount } from '@/features/quick-add/amount'
import { formatMoney, toRupeeInput } from '@/lib/money'
import { rowsFull } from '@/lib/plan'
import { prepayEstimate } from '@/lib/prepay'
import { addExtraPayment, changeAmount, skipPeriod } from '@/lib/respread'
import { diffRows, lastOpenDate, type RowChange } from '@/lib/rowsDiff'
import type { ScheduleRow } from '@/lib/schedule'
import { remaining } from '@/lib/allocate'
import { Chip } from '@/ui/Chip'
import { Field, inputCls, primaryBtn, secondaryBtn } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToasts } from '@/ui/toastStore'
import { useExtraPayment, usePlanEdit } from './queries'

/** Plain-language lines for what a plan edit would do, shown before the user confirms. */
export function describeChanges(changes: RowChange[], today: string): string[] {
  const out: string[] = []
  const moved = changes.filter((c): c is Extract<RowChange, { kind: 'moved' }> => c.kind === 'moved')
  if (moved.length) {
    const first = moved[0]!, last = moved[moved.length - 1]!
    out.push(moved.length === 1 ? `#${first.seq} moves from ${dayLabel(first.from, today)} to ${dayLabel(first.to, today)}` : `#${first.seq} to #${last.seq} each move one month later (#${first.seq}: ${dayLabel(first.from, today)} → ${dayLabel(first.to, today)})`)
  }
  for (const c of changes) {
    if (c.kind === 'amount') out.push(`#${c.seq}: ${formatMoney(c.from)} → ${formatMoney(c.to)}`)
    if (c.kind === 'completed') out.push(`#${c.seq} is fully paid`)
    if (c.kind === 'removed') out.push(`#${c.seq} (${formatMoney(c.due_paise)}, ${dayLabel(c.due_date, today)}) is removed`)
  }
  return out
}

interface Common { entryId: string; rows: ScheduleRow[]; today: string; onClose: () => void }

function Preview({ lines, error }: { lines: string[]; error?: string | null }) {
  return (
    <section aria-label="What will change" className="rounded-2xl bg-surface-2 p-3 text-sm">
      {error ? <p role="alert" className="text-money-red">{error}</p> : lines.length === 0 ? <p className="text-muted">Nothing changes.</p> : (
        <ul className="space-y-1">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
      )}
    </section>
  )
}

/** Skip month: the chosen and every later unpaid row move one month later. */
export function SkipSheet({ entryId, rows, seq, today, onClose }: Common & { seq: number }) {
  const edit = usePlanEdit('skip')
  const [error, setError] = useState<string | null>(null)
  const next = useMemo(() => skipPeriod(rows, seq), [rows, seq])
  const lines = describeChanges(diffRows(rows, next), today)
  const run = async () => {
    try {
      await edit.mutateAsync({ entryId, base: rowsFull(rows), rows: rowsFull(next) })
      useToasts.getState().show({ message: `Skipped a month from #${seq}` })
      onClose()
    } catch (e) { setError((e as Error).message) }
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Skip a month" description={`From instalment #${seq}`}>
      <div className="space-y-3">
        <Preview lines={lines} error={error} />
        <button className={primaryBtn} disabled={edit.isPending} onClick={() => void run()}>Skip month</button>
      </div>
    </Sheet>
  )
}

/** Change amount: the new amount for one row; the difference is spread over the later unpaid rows. */
export function ChangeAmountSheet({ entryId, rows, seq, today, onClose }: Common & { seq: number }) {
  const edit = usePlanEdit('change')
  const row = rows.find((r) => r.seq === seq)!
  const [text, setText] = useState(toRupeeInput(row.due_paise))
  const [error, setError] = useState<string | null>(null)
  const paise = evaluateAmount(text).paise
  const result = useMemo(() => {
    if (paise === null || paise <= 0) return { error: 'Enter an amount' as string | null, rows: null as ScheduleRow[] | null }
    try { return { error: null, rows: changeAmount(rows, seq, paise) } } catch (e) { return { error: (e as Error).message, rows: null } }
  }, [rows, seq, paise])
  const lines = result.rows ? describeChanges(diffRows(rows, result.rows), today) : []
  const run = async () => {
    if (!result.rows) return
    try {
      await edit.mutateAsync({ entryId, base: rowsFull(rows), rows: rowsFull(result.rows) })
      useToasts.getState().show({ message: `#${seq} is now ${formatMoney(paise as number)}` })
      onClose()
    } catch (e) { setError((e as Error).message) }
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Change amount" description={`Instalment #${seq} is ${formatMoney(row.due_paise)}`}>
      <div className="space-y-3">
        <Field label="New amount (₹)"><input className={inputCls} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} aria-label="New amount" /></Field>
        <Preview lines={lines} error={error ?? result.error} />
        <button className={primaryBtn} disabled={!result.rows || edit.isPending} onClick={() => void run()}>Change amount</button>
      </div>
    </Sheet>
  )
}

/** Extra payment: taken off the plan from the last row backwards (a shorter plan). */
export function ExtraPaymentSheet({ entryId, rows, today, defaultAccountId, onClose }: Common & { defaultAccountId?: string | null }) {
  const accounts = (useAccounts().data ?? []).filter((a) => !a.archived)
  const extra = useExtraPayment()
  const left = rows.reduce((s, r) => s + Math.max(remaining(r), 0), 0)
  const [text, setText] = useState('')
  const [accountId, setAccountId] = useState<string | null>(defaultAccountId ?? null)
  const [date, setDate] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const account = accountId ?? accounts[0]?.id ?? null
  const paise = evaluateAmount(text).paise
  const result = useMemo(() => {
    if (paise === null || paise <= 0) return null
    if (paise > left) return { error: `That is more than the ${formatMoney(left)} left` }
    return { error: null, res: addExtraPayment(rows, paise, date) }
  }, [rows, paise, left, date])
  const lines = result && result.res ? [
    ...describeChanges(diffRows(rows, result.res.rows), today),
    ...(lastOpenDate(result.res.rows) ? [`The plan now ends on ${dayLabel(lastOpenDate(result.res.rows) as string, today)}`] : ['Everything is paid']),
  ] : []
  const run = async () => {
    if (!result?.res || !account || paise === null) return
    try {
      await extra.mutateAsync({ id: crypto.randomUUID(), entry_id: entryId, amount_paise: paise, paid_on: date, account_id: account, base: rowsFull(rows), rows: rowsFull(result.res.rows) })
      useToasts.getState().show({ message: `Extra payment of ${formatMoney(paise)} recorded` })
      onClose()
    } catch (e) { setError((e as Error).message) }
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Extra payment" description="Shortens the plan: it is taken off the last instalments. This cannot be undone.">
      <div className="space-y-3">
        <Field label="Amount (₹)" error={result && result.error ? result.error : undefined}>
          <input className={inputCls} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} aria-label="Extra amount" autoComplete="off" />
        </Field>
        <fieldset className="space-y-2"><legend className="text-sm text-muted">Account</legend>
          <div className="flex flex-wrap gap-2">{accounts.map((a) => <Chip key={a.id} selected={account === a.id} onClick={() => setAccountId(a.id)}>{a.name}</Chip>)}</div>
        </fieldset>
        <Field label="Date"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {result?.res && <Preview lines={lines} error={error} />}
        {error && !result?.res && <p role="alert" className="text-sm text-money-red">{error}</p>}
        <button className={primaryBtn} disabled={!result?.res || extra.isPending} onClick={() => void run()}>Record extra payment</button>
      </div>
    </Sheet>
  )
}

/** Foreclose / prepay estimates (read-only). */
export function EstimateSheet({ rows, today, onClose }: Omit<Common, 'entryId'>) {
  const [fee, setFee] = useState('')
  const [part, setPart] = useState('')
  const feeBps = fee.trim() && /^\d{1,2}(\.\d{1,2})?$/.test(fee.trim()) ? Math.round(Number(fee) * 100) : 0
  const foreclose = useMemo(() => prepayEstimate(rows, today, { mode: 'foreclose', feeBps }), [rows, today, feeBps])
  const partAmount = evaluateAmount(part).paise
  const partEst = useMemo(() => {
    if (partAmount === null || partAmount <= 0) return null
    try { return prepayEstimate(rows, today, { mode: 'part', amount: partAmount }) } catch { return null }
  }, [rows, today, partAmount])
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Prepay estimates" description="Estimates only. Your lender's figure can differ slightly.">
      <div className="space-y-4">
        <section aria-label="Foreclose" className="space-y-1 rounded-2xl bg-surface-2 p-3 text-sm">
          <h3 className="font-medium">Close the plan today</h3>
          <div className="flex justify-between"><span className="text-muted">Principal left</span><span className="tabular">{formatMoney(foreclose.principalLeft)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Interest already due</span><span className="tabular">{formatMoney(foreclose.interestDue)}</span></div>
          {foreclose.fee > 0 && <div className="flex justify-between"><span className="text-muted">Foreclosure fee</span><span className="tabular">{formatMoney(foreclose.fee)}</span></div>}
          <div className="flex justify-between font-semibold"><span>Total to close</span><span className="tabular">{formatMoney(foreclose.total)}</span></div>
          <div className="flex justify-between text-money-green"><span>Interest saved</span><span className="tabular">{formatMoney(foreclose.interestSaved)}</span></div>
          <Field label="Foreclosure fee (% of principal, optional)"><input className={inputCls} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} autoComplete="off" /></Field>
        </section>
        <section aria-label="Part prepayment" className="space-y-2 rounded-2xl bg-surface-2 p-3 text-sm">
          <h3 className="font-medium">Pay some extra</h3>
          <Field label="Amount (₹)"><input className={inputCls} inputMode="decimal" value={part} onChange={(e) => setPart(e.target.value)} aria-label="Prepay amount" autoComplete="off" /></Field>
          {partEst && (
            <p>{partEst.rowsBefore} → {partEst.rowsAfter} instalments left{partEst.newLastDue ? `, ending ${dayLabel(partEst.newLastDue, today)}` : ''}. Interest saved: {formatMoney(partEst.interestSaved)}.</p>
          )}
        </section>
        <button className={secondaryBtn} onClick={onClose}>Close</button>
      </div>
    </Sheet>
  )
}
