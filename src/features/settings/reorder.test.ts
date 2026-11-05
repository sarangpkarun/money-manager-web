import { describe, expect, it } from 'vitest'
import { reorderUpdates } from './reorder'

const items = [{ id: 'a', sort: 0 }, { id: 'b', sort: 1 }, { id: 'c', sort: 2 }]

describe('reorderUpdates', () => {
  it('swaps with the neighbour and returns only changed rows', () => {
    expect(reorderUpdates(items, 'b', 'up')).toEqual([{ id: 'b', sort: 0 }, { id: 'a', sort: 1 }])
    expect(reorderUpdates(items, 'b', 'down')).toEqual([{ id: 'c', sort: 1 }, { id: 'b', sort: 2 }])
  })
  it('does nothing at the ends or for unknown ids', () => {
    expect(reorderUpdates(items, 'a', 'up')).toEqual([])
    expect(reorderUpdates(items, 'c', 'down')).toEqual([])
    expect(reorderUpdates(items, 'zzz', 'up')).toEqual([])
  })
  it('normalises duplicate or missing sort values', () => {
    const messy = [{ id: 'a', sort: 5 }, { id: 'b', sort: 5 }, { id: 'c', sort: null }]
    const updates = reorderUpdates(messy, 'a', 'down')
    const final = new Map(messy.map((m) => [m.id, m.sort as number | null]))
    updates.forEach((u) => final.set(u.id, u.sort))
    expect([...new Set(final.values())].length).toBe(3)
  })
})
