import { useMemo, useState } from 'react'
import { PLAN_MODES, planSummary } from '@/lib/plan'
import { formatMoney } from '@/lib/money'
import { Chip } from '@/ui/Chip'
import { Field, inputCls } from '@/ui/Field'
import { needsCount, needsRate, previewFor, usesInterestChips, type PlanFormState } from './planForm'

const INTEREST = [{ v: 'none', label: 'No interest' }, { v: 'flat', label: 'Flat %' }, { v: 'simple', label: 'Simple %' }] as const

/** Plan fields + live preview. `principal` is what the rows split (loan, or price minus down payment). */
export function PlanFields({ form, onChange, principal, modes, today }: {
  form: PlanFormState
  onChange: (f: PlanFormState) => void
  principal: number
  /** which modes to offer (purchases get the EMI modes, loans get the plain ones plus EMI) */
  modes?: PlanFormState['mode'][]
  today: string
}) {
  const set = <K extends keyof PlanFormState>(k: K, v: PlanFormState[K]) => onChange({ ...form, [k]: v })
  const [showAll, setShowAll] = useState(false)
  const preview = useMemo(() => previewFor(form, principal), [form, principal])
  const offered = PLAN_MODES.filter((m) => !modes || modes.includes(m.value))
  const chips = form.mode === 'custom' || usesInterestChips(form.mode)
  const interestOptions = form.mode === 'custom' ? INTEREST.filter((o) => o.v !== 'simple') : INTEREST

  return (
    <div className="space-y-3" role="group" aria-label="Repayment plan">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Plan type">
        {offered.map((m) => <Chip key={m.value} selected={form.mode === m.value} onClick={() => set('mode', m.value)}>{m.label}</Chip>)}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {needsCount(form.mode) && (
          <Field label={form.mode === 'weekly' ? 'Number of weeks' : form.mode === 'equal' ? 'Number of months' : 'Months'}>
            <input className={inputCls} inputMode="numeric" value={form.count} onChange={(e) => set('count', e.target.value)} autoComplete="off" />
          </Field>
        )}
        {form.mode === 'installment' && (
          <Field label="Each instalment (₹)">
            <input className={inputCls} inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} autoComplete="off" />
          </Field>
        )}
        {form.mode !== 'custom' && (
          <Field label={form.mode === 'weekly' ? 'First week' : 'First instalment'}>
            <input type="date" className={inputCls} value={form.firstDate} min={today} onChange={(e) => set('firstDate', e.target.value)} />
          </Field>
        )}
      </div>

      {form.mode === 'custom' && (
        <div className="space-y-2">
          <p className="text-sm text-muted">Pick each due date. The amount is split equally.</p>
          {form.dates.map((d, i) => (
            <div key={i} className="flex gap-2">
              <input type="date" aria-label={`Date ${i + 1}`} className={inputCls} value={d} onChange={(e) => set('dates', form.dates.map((x, j) => (j === i ? e.target.value : x)))} />
              <button type="button" aria-label={`Remove date ${i + 1}`} className="h-12 w-12 shrink-0 rounded-xl bg-surface-2" onClick={() => set('dates', form.dates.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <Chip onClick={() => set('dates', [...form.dates, ''])}>+ Add date</Chip>
        </div>
      )}

      {chips && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Plan interest">
          {interestOptions.map((o) => <Chip key={o.v} selected={form.interest === o.v} onClick={() => set('interest', o.v)}>{o.label}</Chip>)}
        </div>
      )}
      {needsRate(form) && (
        <Field label={form.mode === 'emi' ? 'Interest (% a year, reducing balance)' : form.interest === 'flat' ? 'Flat interest (% of the amount, once)' : 'Interest (% a year)'}>
          <input className={inputCls} inputMode="decimal" value={form.rate} onChange={(e) => set('rate', e.target.value)} autoComplete="off" />
        </Field>
      )}

      {preview && (
        <section aria-label="Plan preview" className="rounded-2xl bg-surface-2 p-3 text-sm">
          {preview.ok ? (
            <>
              <p className="font-medium" aria-live="polite">{planSummary(preview.preview, form.mode === 'weekly' ? 'weekly' : 'monthly')}</p>
              <p className="text-muted">Total to pay {formatMoney(preview.preview.totalPayable)}</p>
              <ol className="mt-2 space-y-0.5">
                {(showAll ? preview.preview.rows : preview.preview.rows.slice(0, 3)).map((r) => (
                  <li key={r.seq} className="flex justify-between"><span className="text-muted">#{r.seq} · {r.due_date}</span><span className="tabular">{formatMoney(r.due_paise)}</span></li>
                ))}
              </ol>
              {preview.preview.rows.length > 3 && (
                <button type="button" className="mt-1 min-h-9 text-accent" onClick={() => setShowAll((s) => !s)}>
                  {showAll ? 'Show fewer' : `Show all ${preview.preview.rows.length}`}
                </button>
              )}
            </>
          ) : <p className="text-muted" role="status">{preview.error}</p>}
        </section>
      )}
    </div>
  )
}
