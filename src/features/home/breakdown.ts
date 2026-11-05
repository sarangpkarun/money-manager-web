import type { BreakdownItem } from './dashboardTypes'

export interface BreakdownRow extends BreakdownItem {
  /** whole percent; rows sum to exactly 100 when there is any spend */
  pct: number
  /** the rolled-up "Other" row (not drillable) */
  other?: boolean
}

/** Largest-remainder rounding so the shown percentages add up to 100. */
export function percents(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0)
  if (total <= 0) return values.map(() => 0)
  const raw = values.map((v) => (v * 100) / total)
  const out = raw.map(Math.floor)
  let left = 100 - out.reduce((s, v) => s + v, 0)
  raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
    .forEach(({ i }) => { if (left > 0) { out[i] = (out[i] ?? 0) + 1; left-- } })
  return out
}

/** Biggest `n` items by spend, the rest rolled into one "Other" row. Zero-spend items are dropped. */
export function topN(items: BreakdownItem[], n = 8): BreakdownRow[] {
  const sorted = items.filter((i) => i.spent > 0).sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name))
  const head = sorted.length > n ? sorted.slice(0, n - 1) : sorted
  const rest = sorted.slice(head.length)
  const rows: (BreakdownItem & { other?: boolean })[] = [...head]
  if (rest.length) rows.push({ id: null, name: 'Other', spent: rest.reduce((s, r) => s + r.spent, 0), count: rest.reduce((s, r) => s + r.count, 0), other: true })
  const pct = percents(rows.map((r) => r.spent))
  return rows.map((r, i) => ({ ...r, pct: pct[i] ?? 0 }))
}
