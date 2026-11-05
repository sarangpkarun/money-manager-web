import { useState } from 'react'
import { primaryBtn } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { showUndo } from '@/ui/toastStore'
import { useMergePeople } from './queries'
import type { PersonLike } from './people'

/** For each duplicate group: pick the person to keep; the others are merged into them (entries move over). */
export function MergeSheet({ groups, onClose }: { groups: PersonLike[][]; onClose: () => void }) {
  const merge = useMergePeople()
  const [keep, setKeep] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)

  const run = async (i: number) => {
    const group = groups[i]!
    const k = keep[i] ?? group[0]!.id
    setError(null)
    try {
      for (const p of group) if (p.id !== k) await merge.mutateAsync({ keep: k, drop: p.id })
      showUndo('People merged', () => undefined, 'OK')
      if (groups.length === 1) onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Possible duplicates" description="Pick who to keep. Their entries move to that person.">
      <div className="space-y-5">
        {groups.length === 0 && <p className="py-6 text-center text-muted">No duplicates left.</p>}
        {groups.map((g, i) => (
          <fieldset key={g.map((p) => p.id).join('-')} className="space-y-2 rounded-2xl bg-surface-2 p-3">
            <legend className="px-1 text-sm text-muted">Keep</legend>
            {g.map((p) => (
              <label key={p.id} className="flex min-h-11 items-center gap-3">
                <input type="radio" name={`keep-${i}`} checked={(keep[i] ?? g[0]!.id) === p.id} onChange={() => setKeep((s) => ({ ...s, [i]: p.id }))} />
                <span>{p.name}{p.phone ? <span className="text-muted"> · {p.phone}</span> : null}</span>
              </label>
            ))}
            <button className={primaryBtn} disabled={merge.isPending} onClick={() => void run(i)}>Merge</button>
          </fieldset>
        ))}
        {error && <p role="alert" className="text-sm text-money-red">{error}</p>}
      </div>
    </Sheet>
  )
}
