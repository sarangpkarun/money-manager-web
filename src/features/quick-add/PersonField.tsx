import { useState } from 'react'
import { normaliseName, type PersonLike } from '@/features/money/people'
import { inputCls } from '@/ui/Field'

/**
 * A person box with suggestions. Typing clears the chosen person; picking one fills the name and the id. A name that matches nobody
 * is created when the form is saved (the list says so). Used by Lent / Borrowed and by "For someone else".
 */
export function PersonField({ label, placeholder, text, selectedId, suggestions, people, onChange, error, disabled = false }: {
  label: string
  placeholder: string
  text: string
  selectedId: string | null
  /** the best matches for what is typed (already filtered by the caller) */
  suggestions: PersonLike[]
  /** everyone, to tell "new person" from "existing" */
  people: PersonLike[]
  onChange: (text: string, id: string | null) => void
  error?: string
  disabled?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const isNew = !!text.trim() && !people.some((p) => normaliseName(p.name) === normaliseName(text))
  return (
    <div className="relative">
      <input aria-label={label} placeholder={placeholder} value={text} autoComplete="off" disabled={disabled}
             onChange={(e) => onChange(e.target.value, null)}
             onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)} className={inputCls} />
      {focused && !disabled && (suggestions.length > 0 || text.trim()) && (
        <ul role="listbox" aria-label={`${label} suggestions`} className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-line bg-surface shadow-lg">
          {suggestions.filter((p) => p.id !== selectedId).map((p) => (
            <li key={p.id}>
              <button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { onChange(p.name, p.id); setFocused(false) }}
                      className="flex min-h-11 w-full items-center px-3 text-left">{p.name}</button>
            </li>
          ))}
          {isNew && <li><div className="flex min-h-11 items-center px-3 text-sm text-muted">New person “{text.trim()}” will be added</div></li>}
        </ul>
      )}
      {error && <p role="alert" className="mt-1 text-sm text-money-red">{error}</p>}
    </div>
  )
}
