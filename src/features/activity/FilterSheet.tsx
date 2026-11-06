import { useState, type ReactNode } from 'react'
import type { Account, Category } from '@/lib/db'
import { categoryIcon } from '@/lib/palette'
import { Chip } from '@/ui/Chip'
import { Field, inputCls, primaryBtn, secondaryBtn } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { draftToFilters, filtersToDraft, type FilterDraft } from './filterDraft'
import type { ActivityFilters, DatePreset, UiKind } from './filters'

const PRESETS: { value: DatePreset | ''; label: string }[] = [
  { value: '', label: 'Month' }, { value: 'today', label: 'Today' }, { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' }, { value: 'last_month', label: 'Last month' }, { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
]
const KINDS: { value: UiKind; label: string }[] = [{ value: 'spend', label: 'Spent' }, { value: 'received', label: 'Received' }, { value: 'transfer', label: 'Transfer' }]

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="space-y-2"><legend className="text-sm font-medium text-muted">{title}</legend><div className="flex flex-wrap gap-2">{children}</div></fieldset>
}

interface Props {
  filters: ActivityFilters
  accounts: Account[]
  categories: Category[]
  /** Home: the month switcher owns the date, so the sheet leaves the date section out. */
  hideDate?: boolean
  onApply: (f: ActivityFilters) => void
  onClose: () => void
}

/** Reusable filter sheet. Edits a draft; nothing changes until Apply. Search text lives outside (it is kept as is). */
export function FilterSheet({ filters, accounts, categories, hideDate = false, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<FilterDraft>(() => filtersToDraft(filters))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof FilterDraft>(k: K, v: FilterDraft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const apply = () => {
    const r = draftToFilters(draft, filters.q)
    if (!r.ok) return setErrors(r.errors)
    onApply(r.filters)
    onClose()
  }
  const clear = () => {
    onApply(filters.q ? { q: filters.q } : {})
    onClose()
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Filters" size="full">
      <div className="space-y-5 pb-2">
        {!hideDate && (
          <Group title="Date">
            {PRESETS.map((p) => <Chip key={p.value || 'month'} selected={draft.preset === p.value} onClick={() => set('preset', p.value)}>{p.label}</Chip>)}
          </Group>
        )}
        {!hideDate && draft.preset === 'custom' && (
          <div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From"><input type="date" className={inputCls} value={draft.from} onChange={(e) => set('from', e.target.value)} /></Field>
              <Field label="To"><input type="date" className={inputCls} value={draft.to} onChange={(e) => set('to', e.target.value)} /></Field>
            </div>
            {errors.dates && <p role="alert" className="mt-1 text-sm text-money-red">{errors.dates}</p>}
          </div>
        )}

        <Group title="Type">
          {KINDS.map((k) => <Chip key={k.value} selected={draft.kinds.includes(k.value)} onClick={() => set('kinds', toggle(draft.kinds, k.value))}>{k.label}</Chip>)}
        </Group>

        <Group title="Account">
          {accounts.filter((a) => !a.archived).map((a) => (
            <Chip key={a.id} selected={draft.accounts.includes(a.id)} onClick={() => set('accounts', toggle(draft.accounts, a.id))}>{a.name}</Chip>
          ))}
        </Group>

        {(['expense', 'income'] as const).map((kind) => (
          <Group key={kind} title={kind === 'expense' ? 'Spending category' : 'Income category'}>
            {categories.filter((c) => c.kind === kind && !c.archived).map((c) => (
              <Chip key={c.id} selected={draft.categories.includes(c.id)} onClick={() => set('categories', toggle(draft.categories, c.id))}>
                <span aria-hidden>{categoryIcon(c)}</span>{c.name}
              </Chip>
            ))}
          </Group>
        ))}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Min amount (₹)" error={errors.min}><input className={inputCls} inputMode="decimal" value={draft.min} onChange={(e) => set('min', e.target.value)} /></Field>
          <Field label="Max amount (₹)" error={errors.max}><input className={inputCls} inputMode="decimal" value={draft.max} onChange={(e) => set('max', e.target.value)} /></Field>
        </div>
        <Group title="Friends">
          <Chip selected={draft.othersPending} onClick={() => set('othersPending', !draft.othersPending)}>Paid for others, not returned yet</Chip>
        </Group>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Place"><input className={inputCls} value={draft.place} onChange={(e) => set('place', e.target.value)} autoComplete="off" /></Field>
          <Field label="Tag"><input className={inputCls} value={draft.tag} onChange={(e) => set('tag', e.target.value)} autoComplete="off" /></Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button className={secondaryBtn} onClick={clear}>Clear all</button>
          <button className={primaryBtn} onClick={apply}>Apply</button>
        </div>
      </div>
    </Sheet>
  )
}
