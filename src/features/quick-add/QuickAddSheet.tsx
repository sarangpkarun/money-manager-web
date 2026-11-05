import { useMemo, useRef, useState } from 'react'
import { useAccounts } from '@/features/accounts/queries'
import { useAddTransaction, useDeleteTransaction, useRecentTransactions, useTitleSuggestions, useUpdateTransaction, type TitleSuggestion } from '@/features/activity/queries'
import { useCategories } from '@/features/categories/queries'
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
import { validateQuickAdd, type QuickAddForm, type QuickKind } from './validate'

const NONE: never[] = [] // stable empty list so memoised values do not change every render
const LAST_ACCOUNT = 'mm-last-account'
const readLast = () => { try { return localStorage.getItem(LAST_ACCOUNT) } catch { return null } }
const writeLast = (id: string) => { try { localStorage.setItem(LAST_ACCOUNT, id) } catch { /* storage unavailable */ } }

const KINDS: { value: QuickKind; label: string }[] = [
  { value: 'expense', label: 'Spent' }, { value: 'income', label: 'Received' }, { value: 'transfer', label: 'Transfer' },
]
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
  const toast = useToasts.getState

  const [form, setForm] = useState<QuickAddForm>(() =>
    editing ? formFromRow(editing) : {
      kind: prefill?.kind ?? 'expense', amount: '', title: '', categoryId: null, accountId: prefill?.accountId ?? null, toAccountId: null,
      date: prefill?.date ?? today, place: '', notes: '', tags: '',
    })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [titleFocused, setTitleFocused] = useState(false)
  const [more, setMore] = useState({ place: !!(editing?.place), notes: !!(editing?.notes), tags: !!(editing?.tags?.length) })
  const amountRef = useRef<HTMLInputElement>(null)

  const activeAccounts = accounts.filter((a) => !a.archived)
  const defaultAccount = pickDefaultAccount(accounts, readLast())
  const accountId = form.accountId ?? defaultAccount?.id ?? null
  const set = <K extends keyof QuickAddForm>(k: K, v: QuickAddForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  const categoryChips = useMemo(
    () => (form.kind === 'transfer' ? [] : rankCategories(categories.filter((c) => !c.archived || c.id === form.categoryId), recent, form.kind)),
    [categories, recent, form.kind, form.categoryId],
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

  const submit = async () => {
    const r = validateQuickAdd({ ...form, accountId })
    if (!r.ok) return setErrors(r.errors)
    setErrors({})
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
        <div role="radiogroup" aria-label="Type" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
          {KINDS.map((k) => (
            <button key={k.value} role="radio" aria-checked={form.kind === k.value} type="button"
                    onClick={() => setForm((f) => ({ ...f, kind: k.value, categoryId: null }))}
                    className={`min-h-11 rounded-lg text-sm font-medium transition-colors ${form.kind === k.value ? 'bg-surface shadow-sm' : 'text-muted'}`}>
              {k.label}
            </button>
          ))}
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
      </div>

      <div className="relative">
        <input aria-label="Title" placeholder={form.kind === 'transfer' ? 'Note (optional)' : 'Title, e.g. Lunch'} value={form.title} autoComplete="off"
               onChange={(e) => set('title', e.target.value)} onFocus={() => setTitleFocused(true)} onBlur={() => setTimeout(() => setTitleFocused(false), 150)}
               className={inputCls} />
        {titleFocused && shownSuggestions.length > 0 && (
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

      {form.kind !== 'transfer' && (
        <div data-vaul-no-drag className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Category">
          {categoryChips.map((c) => (
            <Chip key={c.id} selected={form.categoryId === c.id} onClick={() => set('categoryId', form.categoryId === c.id ? null : c.id)}>
              <span aria-hidden>{categoryIcon(c)}</span>{c.name}
            </Chip>
          ))}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs text-muted">{form.kind === 'transfer' ? 'From' : form.kind === 'income' ? 'Into' : 'Paid with'}</p>
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
        {!more.place && <Chip onClick={() => setMore((m) => ({ ...m, place: true }))}>+ Place</Chip>}
        {!more.notes && <Chip onClick={() => setMore((m) => ({ ...m, notes: true }))}>+ Note</Chip>}
        {!more.tags && <Chip onClick={() => setMore((m) => ({ ...m, tags: true }))}>+ Tags</Chip>}
      </div>

      {more.place && <Field label="Place"><input className={inputCls} value={form.place} onChange={(e) => set('place', e.target.value)} autoComplete="off" /></Field>}
      {more.notes && <Field label="Note"><input className={inputCls} value={form.notes} onChange={(e) => set('notes', e.target.value)} autoComplete="off" /></Field>}
      {more.tags && <Field label="Tags" hint="Separate with spaces or commas"><input className={inputCls} value={form.tags} onChange={(e) => set('tags', e.target.value)} autoComplete="off" /></Field>}

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
