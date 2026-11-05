export interface CategoryLike { id: string; kind: string; sort: number | null }
export interface RecentTxn { kind: string; category_id: string | null; account_id: string | null; date: string }

/**
 * Orders categories for the chip row: the most-used in the recent transactions of the same kind first
 * (ties: most recent use), then the rest in their saved order.
 */
export function rankCategories<C extends CategoryLike>(categories: C[], recent: RecentTxn[], kind: string): C[] {
  const stat = new Map<string, { n: number; last: string }>()
  for (const t of recent) {
    if (t.kind !== kind || !t.category_id) continue
    const s = stat.get(t.category_id) ?? { n: 0, last: '' }
    s.n++
    if (t.date > s.last) s.last = t.date
    stat.set(t.category_id, s)
  }
  return categories
    .filter((c) => c.kind === kind)
    .sort((a, b) => {
      const sa = stat.get(a.id)
      const sb = stat.get(b.id)
      if (sa && sb) return sb.n - sa.n || (sb.last > sa.last ? 1 : sb.last < sa.last ? -1 : 0) || (a.sort ?? 0) - (b.sort ?? 0)
      if (sa) return -1
      if (sb) return 1
      return (a.sort ?? 0) - (b.sort ?? 0)
    })
}

/** Last-used account if it still exists and is active, else the first active account. */
export function pickDefaultAccount<A extends { id: string; archived: boolean | null }>(accounts: A[], lastUsedId: string | null): A | undefined {
  const active = accounts.filter((a) => !a.archived)
  return active.find((a) => a.id === lastUsedId) ?? active[0]
}
