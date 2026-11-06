import { PlanFields } from '@/features/money/plan/PlanFields'
import { emptyPlanForm } from '@/features/money/plan/planForm'
import type { PersonLike } from '@/features/money/people'
import { formatMoney } from '@/lib/money'
import { Chip } from '@/ui/Chip'
import { inputCls } from '@/ui/Field'
import { evaluateAmount } from './amount'
import { equalShares, myShare, newOtherRow, suggestFor, type OtherRow } from './others'
import { PersonField } from './PersonField'

let seq = 0
const nextKey = () => `o${++seq}`

/** "For someone else": who the purchase was paid for, how much each owes, optional due date or instalments, and what it cost you. */
export function OthersFields({ rows, onChange, bill, people, today, errors, blocked }: {
  rows: OtherRow[]
  onChange: (rows: OtherRow[]) => void
  /** the bill in paise, null while empty or invalid */
  bill: number | null
  people: PersonLike[]
  today: string
  errors: Record<string, string>
  /** friends who have already paid cannot be removed or changed (edit mode): key -> rupees paid */
  blocked?: Record<string, number>
}) {
  const set = (key: string, patch: Partial<OtherRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const owed = rows.reduce((s, r) => s + (evaluateAmount(r.amount).paise ?? (rows.length === 1 && !r.amount.trim() && bill ? bill : 0)), 0)
  const mine = myShare(bill, owed)

  const addPerson = () => {
    const next = [...rows, newOtherRow(nextKey())]
    // a second (third…) friend splits the bill equally; amounts stay editable
    if (bill) {
      const shares = equalShares(bill, next.length)
      onChange(next.map((r, i) => ({ ...r, amount: String((shares[i] ?? 0) / 100) })))
    } else onChange(next)
  }
  const splitEqually = () => {
    if (!bill) return
    const shares = equalShares(bill, rows.length)
    onChange(rows.map((r, i) => ({ ...r, amount: String((shares[i] ?? 0) / 100) })))
  }

  return (
    <section aria-label="For someone else" className="space-y-3 rounded-2xl bg-surface-2 p-3">
      <ul className="space-y-3">
        {rows.map((r, i) => {
          const n = i + 1
          const locked = blocked?.[r.key] !== undefined
          const rowAmount = evaluateAmount(r.amount).paise
          return (
            <li key={r.key} className="space-y-2">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <PersonField label={`Friend ${n}`} placeholder="Who is it for?" text={r.personText} selectedId={r.personId} people={people} disabled={locked}
                               suggestions={suggestFor(people, rows, r)} onChange={(text, id) => set(r.key, { personText: text, personId: id })} />
                </div>
                <input aria-label={`Amount for friend ${n}`} inputMode="decimal" autoComplete="off" value={r.amount} onChange={(e) => set(r.key, { amount: e.target.value })}
                       placeholder={rows.length === 1 && bill ? String(bill / 100) : 'Amount'} className={`${inputCls} w-28! shrink-0 text-right`} />
                {rows.length > 1 || !locked ? (
                  <button type="button" aria-label={`Remove friend ${n}`} disabled={locked} onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
                          className="h-12 w-11 shrink-0 rounded-xl bg-surface text-muted disabled:opacity-40">✕</button>
                ) : null}
              </div>
              {locked && <p className="text-xs text-muted">Already paid {formatMoney(blocked![r.key] as number)}: this friend cannot be removed or go below that.</p>}
              {!locked && !r.entryId && (
                <div className="flex flex-wrap items-center gap-2">
                  {!r.plan && (
                    <label className="relative inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm">
                      ⏰ {r.due ? `Due ${r.due}` : 'No due date'}
                      <input type="date" aria-label={`Due date for friend ${n}`} value={r.due} onChange={(e) => set(r.key, { due: e.target.value })} className="absolute inset-0 h-full w-full opacity-0" />
                    </label>
                  )}
                  {!r.plan && r.due && <Chip onClick={() => set(r.key, { due: '' })}>Clear</Chip>}
                  <Chip selected={!!r.plan} onClick={() => set(r.key, { plan: r.plan ? null : emptyPlanForm(today), due: '' })}>In instalments</Chip>
                </div>
              )}
              {!locked && r.plan && (
                <PlanFields form={r.plan} onChange={(plan) => set(r.key, { plan })} principal={rowAmount ?? (rows.length === 1 && bill ? bill : 0)} today={today} modes={['equal', 'installment', 'weekly', 'custom']} />
              )}
              {errors[r.key] && <p role="alert" className="text-sm text-money-red">{errors[r.key]}</p>}
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Chip onClick={addPerson}>+ Add person</Chip>
        {rows.length > 1 && bill !== null && !blocked && <Chip onClick={splitEqually}>Split equally</Chip>}
      </div>
      {errors.form && <p role="alert" className="text-sm text-money-red">{errors.form}</p>}
      {mine !== null && bill !== null && (
        <p className="text-sm text-muted" aria-live="polite">Your share {formatMoney(mine)} · they owe {formatMoney(owed)}</p>
      )}
    </section>
  )
}
