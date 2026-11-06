import { useState } from 'react'
import { hasDueDate } from '@/lib/dates'
import { Field, inputCls, primaryBtn } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { type EntryDetail, usePeople, useUpdateEntry } from './queries'

/** Title, person, due date and notes. Amounts and interest are fixed once the entry exists. */
export function EditEntrySheet({ entry, onClose }: { entry: EntryDetail; onClose: () => void }) {
  const people = (usePeople().data ?? []).filter((p) => !p.archived || p.id === entry.person_id)
  const update = useUpdateEntry()
  const due = entry.due_date && hasDueDate(entry.due_date) ? entry.due_date : ''
  const [title, setTitle] = useState(entry.title)
  const [person, setPerson] = useState(entry.person_id ?? '')
  const [dueDate, setDueDate] = useState(due)
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const dueLocked = entry.interest === 'simple'

  const submit = async () => {
    if (!title.trim()) return setError('Enter a title')
    if (dueDate && dueDate < entry.start_date) return setError('The due date is before the start date')
    const patch: Record<string, unknown> = { title: title.trim(), notes: notes.trim() || null }
    if (person && person !== entry.person_id) patch.person_id = person
    if (!dueLocked && dueDate !== due) patch.due_date = dueDate || null
    setError(null)
    try {
      await update.mutateAsync({ id: entry.id, patch })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Edit entry" size="full">
      <div className="space-y-4">
        <Field label="Title"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Person">
          <select className={inputCls} value={person} onChange={(e) => setPerson(e.target.value)}>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Due date" hint={dueLocked ? 'Fixed because interest was calculated up to this date.' : 'Leave empty for no due date.'}>
          <input type="date" className={inputCls} value={dueDate} disabled={dueLocked} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Notes"><textarea className={`${inputCls} h-24 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm text-money-red">{error}</p>}
        <button className={primaryBtn} disabled={update.isPending} onClick={() => void submit()}>Save</button>
      </div>
    </Sheet>
  )
}
