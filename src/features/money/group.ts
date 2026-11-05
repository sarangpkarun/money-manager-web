import type { DateStr } from '@/lib/dates'
import { hasDueDate } from '@/lib/dates'
import type { Direction, OverviewEntry } from './types'

export interface PersonGroup {
  key: string
  personId: string | null
  name: string
  outstanding: number
  overdue: number
  /** earliest real due date among the person's entries (null if none has one) */
  nextDue: DateStr | null
  entries: OverviewEntry[]
}

export type GroupSort = 'overdue' | 'amount' | 'name'

/** Groups open entries of one direction by person, with totals. Entries without a person fall into "No person". */
export function groupByPerson(entries: OverviewEntry[], direction: Direction, today: DateStr, sort: GroupSort = 'overdue'): PersonGroup[] {
  const map = new Map<string, PersonGroup>()
  for (const e of entries) {
    if (e.direction !== direction) continue
    const key = e.person_id ?? 'none'
    let g = map.get(key)
    if (!g) {
      g = { key, personId: e.person_id, name: e.person_name ?? 'No person', outstanding: 0, overdue: 0, nextDue: null, entries: [] }
      map.set(key, g)
    }
    g.entries.push(e)
    g.outstanding += e.outstanding_paise
    if (hasDueDate(e.due_date)) {
      if (e.due_date < today) g.overdue += e.outstanding_paise
      if (g.nextDue === null || e.due_date < g.nextDue) g.nextDue = e.due_date
    }
  }
  const cmp: Record<GroupSort, (a: PersonGroup, b: PersonGroup) => number> = {
    overdue: (a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding || a.name.localeCompare(b.name),
    amount: (a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
  }
  return [...map.values()].sort(cmp[sort])
}
