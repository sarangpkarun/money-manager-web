/** Cards the dashboard can show, in default order. Later phases fill the reserved ids; unknown ids in a saved layout are ignored. */
export const CARD_IDS = [
  'this_month', 'where_it_went', 'net_position', 'due_soon', 'people', 'emi_load', 'cards', 'insights', 'recent',
] as const
export type CardId = (typeof CARD_IDS)[number]

const isCardId = (v: unknown): v is CardId => typeof v === 'string' && (CARD_IDS as readonly string[]).includes(v)
const ids = (v: unknown): CardId[] => (Array.isArray(v) ? v.filter(isCardId) : [])

/** Applies `profiles.dashboard_layout` ({ order?: string[]; hidden?: string[] }) to the cards that exist right now. */
export function applyLayout(layout: unknown, available: readonly CardId[]): CardId[] {
  const obj = layout && typeof layout === 'object' ? (layout as { order?: unknown; hidden?: unknown }) : {}
  const hidden = new Set(ids(obj.hidden))
  const order = [...new Set([...ids(obj.order), ...CARD_IDS])]
  return order.filter((id) => available.includes(id) && !hidden.has(id))
}
