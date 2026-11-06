import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { applyLayout } from './layout'
import { EDITABLE_CARDS, defaultItems, isDefaultItems, itemsToLayout, layoutToItems, moveItem, toggleHidden } from './layoutEdit'

const ids = (items: { id: string }[]) => items.map((i) => i.id)
const DEFAULT = EDITABLE_CARDS.map((c) => c.id)

describe('layoutToItems', () => {
  it('no layout, or junk: the default order with nothing hidden', () => {
    for (const l of [null, undefined, 5, 'x', [], {}, { order: 7 }]) {
      const items = layoutToItems(l)
      expect(ids(items)).toEqual(DEFAULT)
      expect(items.every((i) => !i.hidden)).toBe(true)
    }
  })
  it('applies a saved order and hidden cards; unknown ids are ignored; cards not listed keep their default place after the saved ones', () => {
    const items = layoutToItems({ order: ['recent', 'nope', 'this_month'], hidden: ['cards', 'bogus'] })
    expect(ids(items).slice(0, 2)).toEqual(['recent', 'this_month'])
    expect(items.find((i) => i.id === 'cards')!.hidden).toBe(true)
    expect(items).toHaveLength(DEFAULT.length)
    expect(items.every((i) => i.label.length > 0)).toBe(true)
  })
  it('insights can be moved and hidden like the other cards', () => {
    expect(DEFAULT).toContain('insights')
    expect(layoutToItems({ hidden: ['insights'] }).find((i) => i.id === 'insights')?.hidden).toBe(true)
  })
})

describe('moveItem / toggleHidden', () => {
  const items = defaultItems()
  it('moves a card up and down and does nothing at the ends', () => {
    expect(ids(moveItem(items, 'due_soon', 'up')).slice(0, 4)).toEqual(['this_month', 'where_it_went', 'due_soon', 'net_position'])
    expect(ids(moveItem(items, 'due_soon', 'down')).slice(2, 5)).toEqual(['net_position', 'people', 'due_soon'])
    expect(moveItem(items, 'this_month', 'up')).toBe(items)
    expect(moveItem(items, 'recent', 'down')).toBe(items)
    expect(moveItem(items, 'cards' as never, 'up')).not.toBe(items)
    expect(moveItem(items, 'zzz' as never, 'up')).toBe(items)
  })
  it('hides and shows', () => {
    const hidden = toggleHidden(items, 'people')
    expect(hidden.find((i) => i.id === 'people')!.hidden).toBe(true)
    expect(toggleHidden(hidden, 'people').find((i) => i.id === 'people')!.hidden).toBe(false)
  })
})

describe('itemsToLayout', () => {
  it('the default arrangement is stored as null', () => {
    expect(itemsToLayout(defaultItems())).toBeNull()
    expect(isDefaultItems(defaultItems())).toBe(true)
  })
  it('anything else is { order, hidden }', () => {
    const items = toggleHidden(moveItem(defaultItems(), 'recent', 'up'), 'cards')
    expect(itemsToLayout(items)).toEqual({ order: ids(items), hidden: ['cards'] })
    expect(isDefaultItems(items)).toBe(false)
    expect(itemsToLayout(toggleHidden(defaultItems(), 'people'))).toMatchObject({ hidden: ['people'] })
  })
  it('property: what Home shows after saving equals what the editor showed (order of the visible cards, hidden ones absent)', () => {
    fc.assert(fc.property(
      fc.array(fc.tuple(fc.constantFrom(...DEFAULT), fc.constantFrom<'up' | 'down' | 'hide'>('up', 'down', 'hide')), { maxLength: 25 }),
      (ops) => {
        let items = defaultItems()
        for (const [id, op] of ops) items = op === 'hide' ? toggleHidden(items, id) : moveItem(items, id, op)
        const stored = itemsToLayout(items)
        const shownByEditor = items.filter((i) => !i.hidden).map((i) => i.id)
        expect(applyLayout(stored, DEFAULT)).toEqual(shownByEditor)
        expect(ids(layoutToItems(stored))).toEqual(ids(items)) // and reopening the editor gives the same list
      }))
  })
})
