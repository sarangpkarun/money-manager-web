import { useState } from 'react'
import { isValidDate } from '@/lib/dates'
import { formatRepeat, parseRepeat, type RepeatUnit } from '@/lib/repeat'
import { Chip } from '@/ui/Chip'
import { Field, inputCls, primaryBtn, secondaryBtn } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { showUndo, useToasts } from '@/ui/toastStore'
import { useDeleteNote, useRestoreNote, useSaveNote } from './queries'
import type { CalendarNote } from './types'

type Choice = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
const CHOICES: { v: Choice; label: string }[] = [
  { v: 'none', label: 'No repeat' }, { v: 'daily', label: 'Daily' }, { v: 'weekly', label: 'Weekly' }, { v: 'monthly', label: 'Monthly' }, { v: 'yearly', label: 'Yearly' }, { v: 'custom', label: 'Custom' },
]
const UNITS: { v: RepeatUnit; label: string }[] = [{ v: 'day', label: 'days' }, { v: 'week', label: 'weeks' }, { v: 'month', label: 'months' }, { v: 'year', label: 'years' }]

/** The repeat rule text for the form, or an error message. */
export function repeatFromForm(choice: Choice, n: string, unit: RepeatUnit): { rule: string | null; error?: string } {
  if (choice === 'none') return { rule: null }
  if (choice !== 'custom') return { rule: choice }
  const count = /^\d{1,3}$/.test(n.trim()) ? Number(n) : 0
  if (count < 1) return { rule: null, error: 'Enter a number from 1 to 999' }
  return { rule: formatRepeat({ n: count, unit }) }
}

function choiceFor(rule: string | null): { choice: Choice; n: string; unit: RepeatUnit } {
  const r = parseRepeat(rule)
  if (!r) return { choice: 'none', n: '2', unit: 'week' }
  if (r.n === 1) return { choice: ({ day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' } as const)[r.unit], n: '2', unit: r.unit }
  return { choice: 'custom', n: String(r.n), unit: r.unit }
}

/** Add or edit a note / task. `note` null = new on `date`. */
export function NoteSheet({ note, date, onClose }: { note: CalendarNote | null; date: string; onClose: () => void }) {
  const save = useSaveNote()
  const del = useDeleteNote()
  const restore = useRestoreNote()
  const init = choiceFor(note?.repeat_rule ?? null)
  const [kind, setKind] = useState<'note' | 'task'>(note?.kind ?? 'task')
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [when, setWhen] = useState(note?.date ?? date)
  const [choice, setChoice] = useState<Choice>(init.choice)
  const [n, setN] = useState(init.n)
  const [unit, setUnit] = useState<RepeatUnit>(init.unit)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = async () => {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'Enter a title'
    else if (title.trim().length > 200) e.title = 'Keep it under 200 characters'
    if (!when || !isValidDate(when)) e.date = 'Choose a date'
    const rep = repeatFromForm(choice, n, unit)
    if (rep.error) e.repeat = rep.error
    if (Object.keys(e).length) return setErrors(e)
    setErrors({})
    try {
      await save.mutateAsync({ id: note?.id, values: { kind, title: title.trim(), body: body.trim() || null, date: when, repeat_rule: rep.rule } })
      useToasts.getState().show({ message: note ? 'Saved' : kind === 'task' ? 'Task added' : 'Note added' })
      onClose()
    } catch (err) {
      setErrors({ form: (err as Error).message })
    }
  }

  const remove = async () => {
    if (!note) return
    try {
      const gone = await del.mutateAsync(note.id)
      showUndo(`"${gone.title}" deleted`, () => void restore.mutate(gone))
      onClose()
    } catch (err) {
      setErrors({ form: (err as Error).message })
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={note ? 'Edit' : 'Add note or task'}>
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Type" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          {(['task', 'note'] as const).map((k) => (
            <button key={k} role="radio" aria-checked={kind === k} type="button" onClick={() => setKind(k)}
                    className={`min-h-11 rounded-lg text-sm font-medium ${kind === k ? 'bg-surface shadow-sm' : 'text-muted'}`}>{k === 'task' ? 'Task' : 'Note'}</button>
          ))}
        </div>
        <Field label="Title" error={errors.title}><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" autoFocus={!note} /></Field>
        <Field label="Details (optional)"><textarea className={`${inputCls} h-20 py-2`} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <Field label="Date" error={errors.date}><input type="date" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <fieldset className="space-y-2">
          <legend className="text-sm text-muted">Repeat</legend>
          <div className="flex flex-wrap gap-2">
            {CHOICES.map((c) => <Chip key={c.v} selected={choice === c.v} onClick={() => setChoice(c.v)}>{c.label}</Chip>)}
          </div>
          {choice === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Every" error={errors.repeat}><input className={inputCls} inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} aria-label="Repeat every" /></Field>
              <Field label="Unit">
                <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value as RepeatUnit)} aria-label="Repeat unit">
                  {UNITS.map((u) => <option key={u.v} value={u.v}>{u.label}</option>)}
                </select>
              </Field>
            </div>
          )}
        </fieldset>
        {errors.form && <p role="alert" className="text-sm text-money-red">{errors.form}</p>}
        <button className={primaryBtn} disabled={save.isPending} onClick={() => void submit()}>Save</button>
        {note && <button className={`${secondaryBtn} text-money-red`} onClick={() => void remove()}>Delete</button>}
      </div>
    </Sheet>
  )
}
