export type Delta =
  | { kind: 'none' }
  | { kind: 'new'; diff: number }
  | { kind: 'same' }
  | { kind: 'up' | 'down'; diff: number; pct: number }

/** This month's spend against last month's. `diff` is always positive (the direction is in `kind`). */
export function vsLastMonth(spent: number, prev: number): Delta {
  if (spent === 0 && prev === 0) return { kind: 'none' }
  if (prev === 0) return { kind: 'new', diff: spent }
  if (spent === prev) return { kind: 'same' }
  const diff = Math.abs(spent - prev)
  return { kind: spent > prev ? 'up' : 'down', diff, pct: Math.round((diff * 100) / prev) }
}
