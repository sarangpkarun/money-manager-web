import { useMemo, useRef, useState } from 'react'
import { useAccounts } from '@/features/accounts/queries'
import { useAddTransaction, useDeleteTransaction, useRecentTransactions, useTitleSuggestions, useUpdateTransaction, type TitleSuggestion } from '@/features/activity/queries'
import { useCategories } from '@/features/categories/queries'
import { normaliseName, matchPeople } from '@/features/money/people'
import { useAddExpenseForOthers, useDeleteTransactionWithOthers, useUpdateExpenseForOthers } from '@/features/activity/othersQueries'
import { PlanFields } from '@/features/money/plan/PlanFields'
import { emptyPlanForm, formToSpec, previewFor, type PlanFormState } from '@/features/money/plan/planForm'
import { useCreateEntry, useCreatePlan, useDeleteEntry, useDisableReminders, usePeople, useSavePerson } from '@/features/money/queries'
import { planRpcFields, rowsPayload } from '@/lib/plan'
import { useToday } from '@/features/profile/useToday'
import type { ActivityRow } from '@/lib/db'
import { formatMoney, toRupeeInput } from '@/lib/money'
import { categoryIcon } from '@/lib/palette'
import { useUi } from '@/lib/uiStore'
import { Chip } from '@/ui/Chip'
import { Field, inputCls, primaryBtn } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToasts } from '@/ui/toastStore'
import { evaluateAmount } from './amount'
import { pickDefaultAccount, rankCategories } from './suggest'
import { lendPreview, validateLend, type LendInterest } from './lend'
import { OthersFields } from './OthersFields'
import { PersonField } from './PersonField'
import { editOthersPayload, newOtherRow, othersPayload, validateOthers, type OtherRow } from './others'
import { isLend, validateQuickAdd, type QuickAddForm, type QuickKind } from './validate'

const NONE: never[] = [] // stable empty list so memoised values do not change every render
const LAST_ACCOUNT = 'mm-last-account'
const readLast = () => { try { return localStorage.getItem(LAST_ACCOUNT) } catch { return null } }
const writeLast = (id: string) => { try { localStorage.setItem(LAST_ACCOUNT, id) } catch { /* storage unavailable */ } }

const KINDS: { value: QuickKind; label: string }[] = [
  { value: 'expense', label: 'Spent' }, { value: 'income', label: 'Received' }, { value: 'transfer', label: 'Transfer' },
  { value: 'lent', label: 'Lent' }, { value: 'borrowed', label: 'Borrowed' },
]
const INTERESTS: { value: LendInterest; label: string }[] = [{ value: 'none', label: 'No interest' }, { value: 'flat', label: 'Flat %' }, { value: 'simple', label: 'Simple %' }]
const OPS = ['+', '−', '×', '÷'] as const
const OP_CHAR: Record<string, string> = { '−': '-', '×': '*', '÷': '/', '+': '+' }

function formFromRow(r: ActivityRow): QuickAddForm {
  return {
    kind: r.kind as QuickKind, amount: toRupeeInput(r.amount_paise), title: r.title ?? '', categoryId: r.category_id,
    accountId: r.account_id, toAccountId: r.to_account_id, date: r.date, place: r.place ?? '', notes: r.notes ?? '', tags: (r.tags ?? []).join(' '),
  }
}

function QuickAddForm() {
  const { quickAddPrefill: prefill, setQuickAddOpen, openQuickAdd } = useUi()
  const editing = prefill?.edit ?? null
  const today = useToday()
  const accounts = useAccounts().data ?? NONE
  const categories = useCategories().data ?? NONE
  const recent = useRecentTransactions().data ?? NONE
  const add = useAddTransaction()
  const update = useUpdateTransaction()
  const del = useDeleteTransaction()
  const createEntry = useCreateEntry()
  const createPlan = useCreatePlan()
  const disableReminders = useDisableReminders()
  const setEmiOpen = useUi((s) => s.setEmiOpen)
  const deleteEntry = useDeleteEntry()
  const savePerson = useSavePerson()
  const addForOthers = useAddExpenseForOthers()
  const delWithOthers = useDeleteTransactionWithOthers()
  const updateForOthers = useUpdateExpenseForOthers()
  const allPeople = usePeople().data ?? NONE
  const people = useMemo(() => allPeople.filter((p) => !p.archived), [allPeople])
  const toast = useToasts.getState

  const [form, setForm] = useState<QuickAddForm>(() =>
    editing ? formFromRow(editing) : {
      kind: prefill?.kind ?? 'expense', amount: '', title: '', categoryId: null, accountId: prefill?.accountId ?? null, toAccountId: null,
      date: prefill?.date ?? today, place: '', notes: '', tags: '',
    })
  const [lend, setLend] = useState({ personText: '', personId: prefill?.personId ?? (null as string | null), due: '', interest: 'none' as LendInterest, rate: '' })
  const [plan, setPlan] = useState<PlanFormState | null>(null)
  // "For someone else": null = off. Edit mode starts with the friends this purchase already has.
  const [others, setOthers] = useState<OtherRow[] | null>(() =>
    editing?.others?.length ? editing.others.map((o) => newOtherRow(o.entry_id, o.person_name ?? '', o.person_id, String(o.amount_paise / 100), o.entry_id)) : null)
  const [otherErrors, setOtherErrors] = useState<Record<string, string>>({})
  // reminders for money lent, borrowed or paid for someone (entries.remind); on by default
  const [remind, setRemind] = useState(true)
  const paidByKey = useMemo(
    () => Object.fromEntries((editing?.others ?? []).filter((o) => o.amount_paise - o.pending_paise > 0).map((o) => [o.entry_id, o.amount_paise - o.pending_paise])),
    [editing],
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [titleFocused, setTitleFocused] = useState(false)
  const [more, setMore] = useState({ place: !!(editing?.place), notes: !!(editing?.notes), tags: !!(editing?.tags?.length) })
  const amountRef = useRef<HTMLInputElement>(null)

  const activeAccounts = accounts.filter((a) => !a.archived)
  const defaultAccount = pickDefaultAccount(accounts, readLast())
  const accountId = form.accountId ?? defaultAccount?.id ?? null
  const set = <K extends keyof QuickAddForm>(k: K, v: QuickAddForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  const lending = isLend(form.kind)
  const personText = lend.personText || people.find((p) => p.id === lend.personId)?.name || ''
  const personMatches = useMemo(() => matchPeople(people, personText), [people, personText])
  const lendForm = { ...form, kind: (form.kind === 'borrowed' ? 'borrowed' : 'lent') as 'lent' | 'borrowed', accountId, personText, personId: lend.personId, due: lend.due, interest: lend.interest, rate: lend.rate }
  const categoryChips = useMemo(
    () => (form.kind === 'transfer' || lending ? [] : rankCategories(categories.filter((c) => !c.archived || c.id === form.categoryId), recent, form.kind)),
    [categories, recent, form.kind, form.categoryId, lending],
  )
  const amount = evaluateAmount(form.amount)
  const suggestions = useTitleSuggestions(titleFocused && !editing ? form.title : '').data ?? []
  const shownSuggestions = suggestions.filter((s) => s.title.toLowerCase() !== form.title.trim().toLowerCase())
  const toAccount = accounts.find((a) => a.id === form.toAccountId)

  const applySuggestion = (s: TitleSuggestion) => {
    setForm((f) => ({
      ...f, title: s.title,
      categoryId: s.category_id && categories.some((c) => c.id === s.category_id && c.kind === f.kind) ? s.category_id : f.categoryId,
      accountId: s.account_id && activeAccounts.some((a) => a.id === s.account_id) ? s.account_id : f.accountId,
      place: f.place || s.place || '',
    }))
    if (s.place) setMore((m) => ({ ...m, place: true }))
    setTitleFocused(false)
  }

  const addOp = (op: string) => {
    set('amount', form.amount + OP_CHAR[op])
    amountRef.current?.focus()
  }

  const submitLend = async () => {
    const r = validateLend(plan ? { ...lendForm, due: '', interest: 'none', rate: '' } : lendForm)
    if (!r.ok) return setErrors(r.errors)
    const pv = plan ? previewFor(plan, r.input.amount_paise) : null
    if (plan && (!pv || !pv.ok)) return setErrors({ plan: pv && !pv.ok ? pv.error : 'Complete the plan' })
    setErrors({})
    const i = r.input
    try {
      // an existing person (picked, or typed exactly) is reused; a new name is created on the spot
      let personId = i.personId ?? people.find((p) => normaliseName(p.name) === normaliseName(i.personName))?.id ?? null
      if (!personId) personId = (await savePerson.mutateAsync({ values: { name: i.personName } })).id
      writeLast(i.account_id)
      const id = crypto.randomUUID()
      const fields = plan && pv && pv.ok ? planRpcFields(formToSpec(plan, i.amount_paise), pv.preview) : null
      const saved = fields && pv && pv.ok
        ? createPlan.mutateAsync({
            id, kind: i.kind, person_id: personId, party: null, title: i.title, principal_paise: i.amount_paise, down_paise: 0, account_id: i.account_id,
            category_id: null, start_date: i.start_date, interest: fields.interest, rate_bps: fields.rateBps, no_cost: false, rows: rowsPayload(pv.preview.rows),
          })
        : createEntry.mutateAsync({
            id, kind: i.kind, person_id: personId, title: i.title, amount_paise: i.amount_paise, account_id: i.account_id, start_date: i.start_date,
            due_date: i.due_date, interest: i.interest, rate_bps: i.rate_bps, notes: i.notes,
          })
      if (!remind) void saved.then(() => disableReminders.mutateAsync([id])).catch(() => undefined)
      setQuickAddOpen(false)
      toast().show({
        message: `${i.kind === 'lent' ? 'Lent' : 'Borrowed'} ${formatMoney(i.amount_paise)} ${i.kind === 'lent' ? 'to' : 'from'} ${i.personName}${pv && pv.ok ? ` in ${pv.preview.count} instalments` : ''}`,
        actions: [
          { label: 'Undo', run: () => void saved.then(() => deleteEntry.mutateAsync(id)).catch(() => undefined) },
          { label: 'Add another', run: () => openQuickAdd({ kind: i.kind, accountId: i.account_id, date: i.start_date }) },
        ],
      })
      saved.catch((e: Error) => toast().show({ message: `Couldn't save: ${e.message}`, duration: 8000 }))
    } catch (e) {
      setErrors({ person: (e as Error).message })
    }
  }

  /** A purchase with friends: the friends' rows are checked, new people created, then everything is saved in one step. */
  const submitOthers = async (input: Extract<ReturnType<typeof validateQuickAdd>, { ok: true }>['input']) => {
    const rows = (others ?? []).map((r, _i, all) => (all.length === 1 && !r.amount.trim() ? { ...r, amount: form.amount } : r))
    const v = validateOthers(input.amount_paise, rows, people, form.date)
    if (!v.ok) return setOtherErrors(v.errors)
    setOtherErrors({})
    try {
      const ids: Record<string, string> = {}
      for (const item of v.items) if (!item.personId) ids[item.key] = (await savePerson.mutateAsync({ values: { name: item.personName } })).id
      const names = v.items.map((i) => i.personName).join(', ')
      const label = `${formatMoney(input.amount_paise)} · for ${names}`
      if (editing) {
        setQuickAddOpen(false)
        updateForOthers.mutate({
          id: editing.id,
          patch: { title: input.title, place: input.place, notes: input.notes, tags: input.tags, category_id: input.category_id, date: input.date, account_id: input.account_id, amount_paise: input.amount_paise },
          others: editOthersPayload(v.items, ids),
        }, {
          onSuccess: () => toast().show({ message: `Updated ${label}` }),
          onError: (e) => toast().show({ message: `Couldn't update: ${(e as Error).message}`, duration: 8000 }),
        })
        return
      }
      writeLast(input.account_id)
      const id = crypto.randomUUID()
      const saved = addForOthers.mutateAsync({ id, amount_paise: input.amount_paise, date: input.date, account_id: input.account_id, category_id: input.category_id, title: input.title,
        place: input.place, notes: input.notes, tags: input.tags, others: othersPayload(v.items, ids) })
      if (!remind) void saved.then((r) => disableReminders.mutateAsync(r.entries)).catch(() => undefined)
      setQuickAddOpen(false)
      toast().show({
        message: `Added ${label}`,
        actions: [
          { label: 'Undo', run: () => void saved.then(() => delWithOthers.mutateAsync(id)).catch(() => undefined) },
          { label: 'Add another', run: () => openQuickAdd({ kind: 'expense', accountId: input.account_id, date: input.date }) },
        ],
      })
      saved.catch((e: Error) => toast().show({ message: `Couldn't save: ${e.message}`, duration: 8000 }))
    } catch (e) {
      setOtherErrors({ form: (e as Error).message })
    }
  }

  const submit = async () => {
    if (lending) return submitLend()
    const r = validateQuickAdd({ ...form, accountId })
    if (!r.ok) return setErrors(r.errors)
    setErrors({})
    if (others !== null && r.input.kind === 'expense') return submitOthers(r.input)
    const catName = categories.find((c) => c.id === r.input.category_id)?.name
    const label = `${formatMoney(r.input.amount_paise)}${catName ? ` · ${catName}` : ''}`

    if (editing) {
      setQuickAddOpen(false)
      update.mutate({ id: editing.id, patch: { ...r.input } }, {
        onSuccess: () => toast().show({ message: `Updated ${label}` }),
        onError: (e) => toast().show({ message: `Couldn't update: ${(e as Error).message}` }),
      })
      return
    }

    writeLast(r.input.account_id)
    const id = crypto.randomUUID()
    const saved = add.mutateAsync({ ...r.input, id })
    setQuickAddOpen(false)
    toast().show({
      message: `Added ${label}`,
      actions: [
        { label: 'Undo', run: () => void saved.then(() => del.mutateAsync(id)).catch(() => undefined) },
        { label: 'Add another', run: () => openQuickAdd({ kind: r.input.kind, accountId: r.input.account_id, date: r.input.date }) },
      ],
    })
    saved.catch((e: Error) => toast().show({ message: `Couldn't save: ${e.message}`, duration: 8000 }))
  }

  return (
    <div className="space-y-4" data-testid="quick-add">
      {editing ? <h2 className="text-lg font-semibold">Edit transaction</h2> : (
        <div role="radiogroup" aria-label="Type" className="grid grid-cols-5 gap-1 rounded-xl bg-surface-2 p-1">
          {KINDS.map((k) => (
            <button key={k.value} role="radio" aria-checked={form.kind === k.value} type="button"
                    onClick={() => setForm((f) => ({ ...f, kind: k.value, categoryId: null }))}
                    className={`min-h-11 rounded-lg px-0.5 text-[13px] font-medium transition-colors ${form.kind === k.value ? 'bg-surface shadow-sm' : 'text-muted'}`}>
              {k.label}
            </button>
          ))}
        </div>
      )}

      {!editing && (
        <div className="flex justify-center">
          <Chip onClick={() => { setQuickAddOpen(false); setEmiOpen(true) }}>🛍 EMI / instalments</Chip>
        </div>
      )}

      <div>
        <div className="flex items-center justify-center gap-1">
          <span className="text-4xl text-muted" aria-hidden>₹</span>
          <input ref={amountRef} autoFocus aria-label="Amount" inputMode="decimal" autoComplete="off" placeholder="0" value={form.amount}
                 onChange={(e) => set('amount', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()}
                 className="tabular w-48 bg-transparent text-center text-5xl font-bold outline-none placeholder:text-muted/50" />
        </div>
        <div className="mt-1 flex items-center justify-center gap-2">
          {OPS.map((op) => (
            <button key={op} type="button" aria-label={`Insert ${op}`} onClick={() => addOp(op)} className="h-11 w-11 rounded-full bg-surface-2 text-lg">{op}</button>
          ))}
          <span className="min-w-20 text-sm text-muted" aria-live="polite">{amount.preview}</span>
        </div>
        {errors.amount && <p role="alert" className="mt-1 text-center text-sm text-money-red">{errors.amount}</p>}
        {lending && lendPreview(lendForm) && <p className="mt-1 text-center text-sm text-muted" aria-live="polite">{lendPreview(lendForm)}</p>}
      </div>

      {lending && (
        <PersonField label="Person" placeholder={form.kind === 'lent' ? 'Lent to…' : 'Borrowed from…'} text={personText} selectedId={lend.personId}
                     people={people} suggestions={personMatches} error={errors.person}
                     onChange={(text, id) => setLend((l) => ({ ...l, personText: text, personId: id }))} />
      )}

      <div className="relative">
        <input aria-label="Title" placeholder={form.kind === 'transfer' ? 'Note (optional)' : lending ? 'Title (optional)' : 'Title, e.g. Lunch'} value={form.title} autoComplete="off"
               onChange={(e) => set('title', e.target.value)} onFocus={() => setTitleFocused(true)} onBlur={() => setTimeout(() => setTitleFocused(false), 150)}
               className={inputCls} />
        {titleFocused && !lending && shownSuggestions.length > 0 && (
          <ul role="listbox" aria-label="Suggestions" className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
            {shownSuggestions.map((s) => (
              <li key={s.title}>
                <button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => applySuggestion(s)}
                        className="flex min-h-11 w-full items-center justify-between px-3 text-left">
                  <span>{s.title}</span><span className="text-xs text-muted">{s.uses}×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {form.kind !== 'transfer' && !lending && (
        <div data-vaul-no-drag className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Category">
          {categoryChips.map((c) => (
            <Chip key={c.id} selected={form.categoryId === c.id} onClick={() => set('categoryId', form.categoryId === c.id ? null : c.id)}>
              <span aria-hidden>{categoryIcon(c)}</span>{c.name}
            </Chip>
          ))}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs text-muted">{form.kind === 'transfer' ? 'From' : form.kind === 'income' || form.kind === 'borrowed' ? 'Into' : form.kind === 'lent' ? 'Paid from' : 'Paid with'}</p>
        <div data-vaul-no-drag className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Account">
          {activeAccounts.map((a) => (
            <Chip key={a.id} selected={accountId === a.id} onClick={() => set('accountId', a.id)}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color ?? '#64748b' }} aria-hidden />{a.name}
            </Chip>
          ))}
        </div>
        {errors.account && <p role="alert" className="text-sm text-money-red">{errors.account}</p>}
      </div>

      {form.kind === 'transfer' && (
        <div>
          <p className="mb-1 text-xs text-muted">{toAccount?.type === 'credit_card' ? 'To · paying card bill' : 'To'}</p>
          <div data-vaul-no-drag className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Destination account">
            {activeAccounts.filter((a) => a.id !== accountId).map((a) => (
              <Chip key={a.id} selected={form.toAccountId === a.id} onClick={() => set('toAccountId', a.id)}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color ?? '#64748b' }} aria-hidden />{a.name}
                {a.type === 'credit_card' ? ' (pay bill)' : ''}
              </Chip>
            ))}
          </div>
          {errors.toAccount && <p role="alert" className="text-sm text-money-red">{errors.toAccount}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <label className="relative inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm">
          📅 {form.date === today ? 'Today' : form.date}
          <input type="date" aria-label="Date" value={form.date} onChange={(e) => e.target.value && set('date', e.target.value)}
                 className="absolute inset-0 h-full w-full opacity-0" />
        </label>
        {lending && !plan && (
          <label className="relative inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm">
            ⏰ {lend.due ? `Due ${lend.due}` : 'No due date'}
            <input type="date" aria-label="Due date" value={lend.due} onChange={(e) => setLend((l) => ({ ...l, due: e.target.value }))} className="absolute inset-0 h-full w-full opacity-0" />
          </label>
        )}
        {lending && !plan && lend.due && <Chip onClick={() => setLend((l) => ({ ...l, due: '' }))}>Clear due date</Chip>}
        {form.kind === 'expense' && !editing?.others?.length && (
          <Chip selected={others !== null} onClick={() => setOthers(others === null ? [newOtherRow('o0')] : null)}>For someone else</Chip>
        )}
        {!lending && !more.place && <Chip onClick={() => setMore((m) => ({ ...m, place: true }))}>+ Place</Chip>}
        {!more.notes && <Chip onClick={() => setMore((m) => ({ ...m, notes: true }))}>+ Note</Chip>}
        {!lending && !more.tags && <Chip onClick={() => setMore((m) => ({ ...m, tags: true }))}>+ Tags</Chip>}
      </div>
      {errors.due && <p role="alert" className="text-sm text-money-red">{errors.due}</p>}

      {!editing && (lending || others !== null) && (
        <div><Chip selected={remind} onClick={() => setRemind(!remind)}>{remind ? '🔔 Reminders on' : '🔕 Reminders off'}</Chip></div>
      )}

      {form.kind === 'expense' && others !== null && (
        <OthersFields rows={others} onChange={setOthers} bill={amount.paise} people={people} today={today} errors={otherErrors} blocked={Object.keys(paidByKey).length ? paidByKey : undefined} />
      )}

 {lending && (
        <Chip selected={!!plan} onClick={() => setPlan(plan ? null : emptyPlanForm(today))}>Repay in instalments</Chip>
      )}
      {lending && plan && (
        <PlanFields form={plan} onChange={setPlan} principal={amount.paise ?? 0} today={today}
                    modes={['equal', 'installment', 'weekly', 'custom', 'emi']} />
      )}
      {errors.plan && <p role="alert" className="text-sm text-money-red">{errors.plan}</p>}

      {lending && !plan && (
        <div className="space-y-2">
          <div role="group" aria-label="Interest" className="flex flex-wrap gap-2">
            {INTERESTS.map((o) => <Chip key={o.value} selected={lend.interest === o.value} onClick={() => setLend((l) => ({ ...l, interest: o.value }))}>{o.label}</Chip>)}
          </div>
          {lend.interest !== 'none' && (
            <Field label={lend.interest === 'flat' ? 'Flat interest (% of the amount, once)' : 'Interest (% a year, up to the due date)'} error={errors.rate}>
              <input className={inputCls} inputMode="decimal" value={lend.rate} onChange={(e) => setLend((l) => ({ ...l, rate: e.target.value }))} autoComplete="off" />
            </Field>
          )}
        </div>
      )}

      {!lending && more.place && <Field label="Place"><input className={inputCls} value={form.place} onChange={(e) => set('place', e.target.value)} autoComplete="off" /></Field>}
      {more.notes && <Field label="Note"><input className={inputCls} value={form.notes} onChange={(e) => set('notes', e.target.value)} autoComplete="off" /></Field>}
      {!lending && more.tags && <Field label="Tags" hint="Separate with spaces or commas"><input className={inputCls} value={form.tags} onChange={(e) => set('tags', e.target.value)} autoComplete="off" /></Field>}

      <button type="button" className={primaryBtn} onClick={() => void submit()}>{editing ? 'Save changes' : 'Save'}</button>
    </div>
  )
}

/** The + sheet. Lazy-loaded (vaul/radix stay out of the initial bundle) and warmed when the app is idle. */
export default function QuickAddSheet() {
  const { quickAddOpen, setQuickAddOpen } = useUi()
  return (
    <Sheet open={quickAddOpen} onOpenChange={setQuickAddOpen} title="Quick add" hideTitle onOpenAutoFocus={(e) => e.preventDefault()}>
      {quickAddOpen && <QuickAddForm />}
    </Sheet>
  )
}
