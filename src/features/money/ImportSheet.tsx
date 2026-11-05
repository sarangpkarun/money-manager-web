import { useMemo, useState } from 'react'
import { inputCls, primaryBtn, secondaryBtn } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToasts } from '@/ui/toastStore'
import { parsePeopleText, type PersonLike } from './people'
import { useImportPeople } from './queries'

/** Paste names (one per line, optional phone after a comma) or load a CSV; duplicates are skipped. */
export function ImportSheet({ existing, onClose }: { existing: PersonLike[]; onClose: () => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const imp = useImportPeople()
  const rows = useMemo(() => parsePeopleText(text, existing), [text, existing])
  const fresh = rows.filter((r) => !r.duplicate)

  const loadFile = async (f: File | undefined) => {
    if (!f) return
    if (f.size > 1_000_000) return setError('That file is too large')
    setText(await f.text())
  }
  const run = async () => {
    setError(null)
    try {
      const n = await imp.mutateAsync(fresh.slice(0, 500))
      useToasts.getState().show({ message: `Added ${n} ${n === 1 ? 'person' : 'people'}` })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Import people" description="One person per line: name, then an optional phone number.">
      <div className="space-y-3">
        <textarea aria-label="People to import" className={`${inputCls} h-32 py-2`} placeholder={'Asha, 98765 43210\nRavi Kumar'} value={text} onChange={(e) => setText(e.target.value)} />
        <label className={`${secondaryBtn} flex cursor-pointer items-center justify-center`}>
          Choose a CSV file
          <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => void loadFile(e.target.files?.[0])} />
        </label>
        {rows.length > 0 && (
          <ul aria-label="Preview" className="max-h-48 divide-y divide-line overflow-y-auto rounded-xl bg-surface-2 px-3">
            {rows.slice(0, 100).map((r, i) => (
              <li key={i} className="flex min-h-10 items-center justify-between gap-2 text-sm">
                <span className="truncate">{r.name}{r.phone ? <span className="text-muted"> · {r.phone}</span> : null}</span>
                {r.duplicate && <span className="shrink-0 text-muted">already there</span>}
              </li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="text-sm text-money-red">{error}</p>}
        <button className={primaryBtn} disabled={fresh.length === 0 || imp.isPending} onClick={() => void run()}>
          {fresh.length === 0 ? 'Nothing new to add' : `Add ${fresh.length} ${fresh.length === 1 ? 'person' : 'people'}`}
        </button>
      </div>
    </Sheet>
  )
}
