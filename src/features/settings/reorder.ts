/** Moves one item up or down and returns the `sort` updates needed (only items whose value changes), normalised to 0..n-1. */
export function reorderUpdates<T extends { id: string; sort: number | null }>(items: T[], id: string, dir: 'up' | 'down'): { id: string; sort: number }[] {
  const ordered = [...items].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
  const i = ordered.findIndex((x) => x.id === id)
  const j = dir === 'up' ? i - 1 : i + 1
  if (i === -1 || j < 0 || j >= ordered.length) return []
  const [moved] = ordered.splice(i, 1)
  ordered.splice(j, 0, moved as T)
  return ordered.flatMap((x, idx) => (x.sort === idx ? [] : [{ id: x.id, sort: idx }]))
}
