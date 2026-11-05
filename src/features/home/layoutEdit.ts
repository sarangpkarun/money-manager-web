import { applyLayout, CARD_IDS, type CardId } from './layout'

/** The cards Home can show today, in default order, with the names the editor uses. ('insights' arrives with Phase 8.) */
export const EDITABLE_CARDS: { id: CardId; label: string }[] = [
  { id: 'this_month', label: 'This month' },
  { id: 'where_it_went', label: 'Where it went' },
  { id: 'net_position', label: 'Net position' },
  { id: 'due_soon', label: 'Due soon' },
  { id: 'people', label: 'Money with people' },
  { id: 'emi_load', label: 'EMI & loan load' },
  { id: 'cards', label: 'Credit cards' },
  { id: 'recent', label: 'Recent activity' },
]
const EDITABLE: readonly CardId[] = EDITABLE_CARDS.map((c) => c.id)
const LABEL = new Map(EDITABLE_CARDS.map((c) => [c.id, c.label]))

export interface LayoutItem { id: CardId; label: string; hidden: boolean }

/** Saved layout ({ order, hidden } or anything else) as the editor's list: every editable card once, in the order Home shows them. */
export function layoutToItems(layout: unknown): LayoutItem[] {
  const shown = applyLayout(layout, EDITABLE)
  const hiddenIds = new Set(EDITABLE.filter((id) => !shown.includes(id)))
  // Home shows `shown` in order; hidden cards keep their saved position (or the default one) after them for the editor's list
  const saved = layout && typeof layout === 'object' ? (layout as { order?: unknown }).order : undefined
  const savedOrder = Array.isArray(saved) ? saved.filter((x): x is CardId => typeof x === 'string' && (CARD_IDS as readonly string[]).includes(x) && EDITABLE.includes(x as CardId)) : []
  const order = [...new Set([...savedOrder, ...EDITABLE])]
  return order.map((id) => ({ id, label: LABEL.get(id) as string, hidden: hiddenIds.has(id) }))
}

export function moveItem(items: LayoutItem[], id: CardId, dir: 'up' | 'down'): LayoutItem[] {
  const i = items.findIndex((x) => x.id === id)
  const j = dir === 'up' ? i - 1 : i + 1
  if (i === -1 || j < 0 || j >= items.length) return items
  const next = [...items]
  const [moved] = next.splice(i, 1)
  next.splice(j, 0, moved as LayoutItem)
  return next
}

export const toggleHidden = (items: LayoutItem[], id: CardId): LayoutItem[] => items.map((x) => (x.id === id ? { ...x, hidden: !x.hidden } : x))

export const defaultItems = (): LayoutItem[] => layoutToItems(null)

export function isDefaultItems(items: LayoutItem[]): boolean {
  const d = defaultItems()
  return items.length === d.length && items.every((x, i) => x.id === d[i]!.id && !x.hidden)
}

/** What to store in `profiles.dashboard_layout`: null for the default arrangement, otherwise { order, hidden }. */
export function itemsToLayout(items: LayoutItem[]): { order: CardId[]; hidden: CardId[] } | null {
  return isDefaultItems(items) ? null : { order: items.map((x) => x.id), hidden: items.filter((x) => x.hidden).map((x) => x.id) }
}
