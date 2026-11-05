import { useState } from 'react'
import { useArchiveCategory, useCategories, useReorderCategories, useSaveCategory } from '@/features/categories/queries'
import type { Category } from '@/lib/db'
import { CATEGORY_ICONS, categoryIcon } from '@/lib/palette'
import { EmptyState } from '@/ui/EmptyState'
import { Field, inputCls, primaryBtn, secondaryBtn } from '@/ui/Field'
import { PageHeader } from '@/ui/PageHeader'
import { Sheet } from '@/ui/Sheet'
import { Skeleton } from '@/ui/Skeleton'
import { Swatches } from '@/ui/Swatches'
import { categoryToForm, emptyCategoryForm, validateCategory, type CategoryForm } from './forms'

function CategorySheet({ category, kind, onClose }: { category: Category | 'new'; kind: 'expense' | 'income'; onClose: () => void }) {
  const editing = category === 'new' ? null : category
  const [form, setForm] = useState<CategoryForm>(editing ? categoryToForm(editing) : emptyCategoryForm(kind))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string>()
  const save = useSaveCategory()
  const archive = useArchiveCategory()
  const set = <K extends keyof CategoryForm>(k: K, v: CategoryForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    const r = validateCategory(form)
    if (!r.ok) return setErrors(r.errors)
    try {
      // kind never changes on edit: existing transactions keep their meaning
      await save.mutateAsync({ id: editing?.id, values: editing ? { ...r.values, kind: editing.kind } : r.values })
      onClose()
    } catch (e) {
      setServerError((e as Error).message)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={editing ? `Edit ${editing.name}` : `New ${kind} category`}>
      <div className="space-y-4">
        <Field label="Name" error={errors.name}><input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" /></Field>
        <div role="radiogroup" aria-label="Icon" className="flex flex-wrap gap-2">
          {CATEGORY_ICONS.map((i) => (
            <button key={i} type="button" role="radio" aria-checked={form.icon === i} aria-label={`Icon ${i}`} onClick={() => set('icon', i)}
                    className={`h-11 w-11 rounded-xl text-xl ${form.icon === i ? 'bg-accent' : 'bg-surface-2'}`}>{i}</button>
          ))}
        </div>
        <Swatches value={form.color} onChange={(c) => set('color', c)} />
        {serverError && <p role="alert" className="text-sm text-money-red">{serverError}</p>}
        <button className={primaryBtn} onClick={submit} disabled={save.isPending}>Save</button>
        {editing && (
          <button className={secondaryBtn} onClick={async () => { await archive.mutateAsync({ id: editing.id, archived: !editing.archived }); onClose() }}>
            {editing.archived ? 'Restore category' : 'Archive category'}
          </button>
        )}
      </div>
    </Sheet>
  )
}

function Section({ title, kind, items, onEdit, onAdd }: {
  title: string; kind: 'expense' | 'income'; items: Category[]; onEdit: (c: Category) => void; onAdd: (k: 'expense' | 'income') => void
}) {
  const reorder = useReorderCategories()
  const active = items.filter((c) => !c.archived)
  const archived = items.filter((c) => c.archived)
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button onClick={() => onAdd(kind)} className="min-h-11 px-2 text-accent">Add</button>
      </div>
      <ul className="space-y-2">
        {active.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 rounded-2xl bg-surface p-2">
            <button onClick={() => onEdit(c)} aria-label={`Edit ${c.name}`} className="flex min-h-11 flex-1 items-center gap-3 text-left">
              <span className="flex h-9 w-9 items-center justify-center rounded-full text-lg" style={{ background: `${c.color ?? '#64748b'}33` }}>{categoryIcon(c)}</span>
              <span>{c.name}</span>
            </button>
            <button disabled={i === 0} onClick={() => reorder.mutate({ items: active, id: c.id, dir: 'up' })} aria-label={`Move ${c.name} up`} className="h-11 w-11 text-muted disabled:opacity-30">▲</button>
            <button disabled={i === active.length - 1} onClick={() => reorder.mutate({ items: active, id: c.id, dir: 'down' })} aria-label={`Move ${c.name} down`} className="h-11 w-11 text-muted disabled:opacity-30">▼</button>
          </li>
        ))}
      </ul>
      {archived.length > 0 && <p className="text-sm text-muted">Archived: {archived.map((c, i) => (
        <button key={c.id} onClick={() => onEdit(c)} className="min-h-11 px-1 underline">{c.name}{i < archived.length - 1 ? ',' : ''}</button>))}</p>}
    </section>
  )
}

export default function CategoriesScreen() {
  const cats = useCategories()
  const [editing, setEditing] = useState<{ cat: Category | 'new'; kind: 'expense' | 'income' } | null>(null)
  const all = cats.data ?? []
  return (
    <div>
      <PageHeader title="Categories" back="/settings" backLabel="Settings" />
      <div className="space-y-6 px-4 pb-8">
        {cats.isPending ? <Skeleton className="h-40" />
          : all.length === 0 ? <EmptyState title="No categories" hint="Add a category to organise your spending." />
          : <>
              <Section title="Spending" kind="expense" items={all.filter((c) => c.kind === 'expense')} onEdit={(c) => setEditing({ cat: c, kind: 'expense' })} onAdd={(k) => setEditing({ cat: 'new', kind: k })} />
              <Section title="Income" kind="income" items={all.filter((c) => c.kind === 'income')} onEdit={(c) => setEditing({ cat: c, kind: 'income' })} onAdd={(k) => setEditing({ cat: 'new', kind: k })} />
            </>}
      </div>
      {editing && <CategorySheet key={editing.cat === 'new' ? `new-${editing.kind}` : editing.cat.id} category={editing.cat} kind={editing.kind} onClose={() => setEditing(null)} />}
    </div>
  )
}
