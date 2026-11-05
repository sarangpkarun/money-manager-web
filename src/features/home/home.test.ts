import { describe, expect, it } from 'vitest'
import { percents, topN } from './breakdown'
import { parseDashboard } from './dashboardTypes'
import { vsLastMonth } from './delta'
import { applyLayout, CARD_IDS } from './layout'
import { barFractions, donutArcs, nearestIndex, sparkline } from '@/ui/charts/geometry'

const item = (name: string, spent: number) => ({ id: name, name, spent, count: 1 })

describe('percents', () => {
  it('sums to exactly 100 (largest remainder)', () => {
    expect(percents([1, 1, 1])).toEqual([34, 33, 33])
    expect(percents([1, 1, 1]).reduce((a, b) => a + b)).toBe(100)
    expect(percents([5000, 3000, 2000])).toEqual([50, 30, 20])
  })
  it('is all zero without spend', () => expect(percents([0, 0])).toEqual([0, 0]))
})

describe('topN', () => {
  it('sorts, drops zeros and keeps up to n rows', () => {
    const rows = topN([item('b', 20), item('a', 50), item('z', 0)])
    expect(rows.map((r) => r.name)).toEqual(['a', 'b'])
    expect(rows.map((r) => r.pct)).toEqual([71, 29])
  })
  it('rolls the tail into one Other row that preserves the total', () => {
    const items = Array.from({ length: 12 }, (_, i) => item(`c${i}`, 100 - i))
    const rows = topN(items, 8)
    expect(rows).toHaveLength(8)
    expect(rows[7]).toMatchObject({ name: 'Other', other: true, id: null, count: 5 })
    expect(rows.reduce((s, r) => s + r.spent, 0)).toBe(items.reduce((s, r) => s + r.spent, 0))
    expect(rows.reduce((s, r) => s + r.pct, 0)).toBe(100)
  })
  it('does not roll up exactly n items', () => expect(topN(Array.from({ length: 8 }, (_, i) => item(`c${i}`, i + 1)), 8)).toHaveLength(8))
  it('is empty for no spend', () => expect(topN([])).toEqual([]))
})

describe('vsLastMonth', () => {
  it('covers every case', () => {
    expect(vsLastMonth(0, 0)).toEqual({ kind: 'none' })
    expect(vsLastMonth(500, 0)).toEqual({ kind: 'new', diff: 500 })
    expect(vsLastMonth(500, 500)).toEqual({ kind: 'same' })
    expect(vsLastMonth(150, 100)).toEqual({ kind: 'up', diff: 50, pct: 50 })
    expect(vsLastMonth(0, 100)).toEqual({ kind: 'down', diff: 100, pct: 100 })
  })
})

describe('applyLayout', () => {
  const all = CARD_IDS
  it('defaults to the default order for null / junk', () => {
    for (const l of [null, undefined, 5, 'x', [], {}]) expect(applyLayout(l, all)).toEqual([...all])
  })
  it('honours order and hidden; ignores unknown ids; appends the rest in default order', () => {
    const r = applyLayout({ order: ['recent', 'nope', 'this_month'], hidden: ['cards', 'bogus'] }, all)
    expect(r.slice(0, 2)).toEqual(['recent', 'this_month'])
    expect(r).not.toContain('cards')
    expect(r).toHaveLength(all.length - 1)
  })
  it('only returns cards that exist', () => expect(applyLayout(null, ['recent', 'this_month'])).toEqual(['this_month', 'recent']))
})

describe('chart geometry', () => {
  it('donut arcs cover the circle in order', () => {
    const arcs = donutArcs([1, 1], 100, 2)
    expect(arcs).toHaveLength(2)
    expect(arcs[0]).toEqual({ dash: 48, gap: 52, offset: -0 })
    expect(arcs[1]?.offset).toBe(-50)
    expect(donutArcs([0, 0], 100)).toEqual([])
    expect(donutArcs([5], 100)[0]?.dash).toBe(100) // a single slice has no gap
  })
  it('sparkline maps max to the top and handles empty/flat/single series', () => {
    const s = sparkline([0, 10, 5], 100, 50, 0, 5)
    expect(s.points[1]).toEqual({ x: 50, y: 0 })
    expect(s.avgY).toBe(25)
    expect(s.line.startsWith('M0.0 50.0')).toBe(true)
    expect(sparkline([], 100, 50).line).toBe('')
    expect(sparkline([0, 0, 0], 100, 50, 0).points.every((p) => p.y === 50)).toBe(true)
    expect(sparkline([7], 100, 50, 0).points[0]?.x).toBe(50)
  })
  it('nearestIndex and barFractions', () => {
    const pts = sparkline([1, 2, 3, 4], 90, 10, 0).points
    expect(nearestIndex(pts, 61)).toBe(2)
    expect(nearestIndex([], 5)).toBe(0)
    expect(barFractions([50, 25, 0])).toEqual([1, 0.5, 0])
    expect(barFractions([0, 0])).toEqual([0, 0])
  })
})

describe('parseDashboard', () => {
  const ok = { month: { spent: 1, received: 0, saved: -1, prev_spent: 0, days_in_month: 30, days_elapsed: 5, count: 1 }, daily: [], by_category: [], by_account: [], by_place: [], recent: [], accounts: [] }
  it('accepts a well-formed response', () => expect(parseDashboard(ok)).toBe(ok))
  it('rejects drifted or missing shapes', () => {
    for (const bad of [null, {}, { ...ok, month: { ...ok.month, spent: '1' } }, { ...ok, daily: null }, { ...ok, accounts: undefined }]) {
      expect(() => parseDashboard(bad)).toThrow('Unexpected dashboard response')
    }
  })
})
