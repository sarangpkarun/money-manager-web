import { useState } from 'react'
import { diffDays } from '@/lib/dates'
import { useUi } from '@/lib/uiStore'
import { Amount } from '@/ui/Amount'
import { Field, inputCls, primaryBtn, secondaryBtn } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { showUndo } from '@/ui/toastStore'
import { EntryBadge } from './EntryBadge'
import { dueText, entryStatusOf } from './status'
import { useMoneyOverview, usePeopleBalances, useSavePerson } from './queries'
import { normaliseName } from './people'

interface Form { name: string; phone: string; email: string }

/** Add (personId null) or edit a person; shows their open entries and lets you archive them. */
export function PersonSheet({ personId, today, onOpenEntry, onClose }: { personId: string | null; today: string; onOpenEntry: (id: string) => void; onClose: () => void }) {
  const balances = usePeopleBalances().data ?? []
  const person = personId ? balances.find((p) => p.person_id === personId) : undefined
  const overview = useMoneyOverview(today).data
  const save = useSavePerson()
  const openQuickAdd = useUi((s) => s.openQuickAdd)
  const [form, setForm] = useState<Form>({ name: person?.name ?? '', phone: person?.phone ?? '', email: person?.email ?? '' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const entries = (overview?.entries ?? []).filter((e) => e.person_id === personId)

  const submit = async () => {
    const name = form.name.trim()
    if (!name) return setError('Enter a name')
    if (name.length > 100) return setError('Keep the name under 100 characters')
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('That email does not look right')
    const clash = balances.find((p) => p.person_id !== personId && normaliseName(p.name) === normaliseName(name))
    if (clash && !window.confirm(`You already have "${clash.name}". Add another anyway?`)) return
    setError(null)
    try {
      await save.mutateAsync({ id: personId ?? undefined, values: { name, phone: form.phone.trim() || null, email: form.email.trim() || null } })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const archive = async () => {
    if (!personId) return
    const was = !!person?.archived
    await save.mutateAsync({ id: personId, values: { name: form.name.trim() || person!.name, archived: !was } })
    if (!was) showUndo(`${person?.name} archived`, () => void save.mutateAsync({ id: personId, values: { name: person!.name, archived: false } }))
    onClose()
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={personId ? (person?.name ?? 'Person') : 'Add person'}>
      <div className="space-y-4">
        {person && (person.owed_to_me_paise > 0 || person.i_owe_paise > 0) && (
          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-surface-2 p-3 text-center">
            <div><div className="text-xs text-muted">Owes you</div><Amount paise={person.owed_to_me_paise} tone="in" className="text-lg font-semibold" /></div>
            <div><div className="text-xs text-muted">You owe</div><Amount paise={person.i_owe_paise} tone="out" className="text-lg font-semibold" /></div>
          </div>
        )}

        <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" autoFocus={!personId} /></Field>
        <Field label="Phone (optional)"><input className={inputCls} inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="off" /></Field>
        <Field label="Email (optional)"><input className={inputCls} inputMode="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" /></Field>
        {error && <p role="alert" className="text-sm text-money-red">{error}</p>}
        <button className={primaryBtn} disabled={save.isPending} onClick={() => void submit()}>{personId ? 'Save' : 'Add person'}</button>

        {personId && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <button className={secondaryBtn} onClick={() => { onClose(); openQuickAdd({ kind: 'lent', personId }) }}>Lend</button>
              <button className={secondaryBtn} onClick={() => { onClose(); openQuickAdd({ kind: 'borrowed', personId }) }}>Borrow</button>
            </div>
            {entries.length > 0 && (
              <section aria-label="Open entries">
                <h3 className="mb-1 text-sm font-medium text-muted">Open entries</h3>
                <ul className="divide-y divide-line">
                  {entries.map((e) => (
                    <li key={e.id}>
                      <button className="flex min-h-14 w-full items-center justify-between gap-2 text-left" onClick={() => onOpenEntry(e.id)} aria-label={`${e.title}, open details`}>
                        <span className="min-w-0"><span className="block truncate">{e.title}</span>
                          <span className="flex items-center gap-2 text-sm text-muted"><EntryBadge status={entryStatusOf(e, today)} />{dueText(e.due_date, today, diffDays)}</span></span>
                        <Amount paise={e.outstanding_paise} tone={e.direction === 'receive' ? 'in' : 'out'} className="font-semibold" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <button className={`${secondaryBtn} ${person?.archived ? '' : 'text-money-red'}`} disabled={save.isPending} onClick={() => void archive()}>
              {person?.archived ? 'Restore person' : 'Archive person'}
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}

