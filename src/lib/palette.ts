/** Swatches offered for accounts and categories (also used for chart slices later). */
export const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'] as const

export const CATEGORY_ICONS = [
  '🍔', '🛒', '🚕', '⛽', '💡', '🏠', '🛍️', '💊', '🎬', '🎓', '🎁', '☕', '✈️', '📱', '👕', '🐶',
  '💼', '💰', '📈', '🏦', '🧾', '🔧', '🏋️', '🎮',
] as const

export const DEFAULT_CATEGORY_ICON: Record<string, string> = {
  Food: '🍔', Groceries: '🛒', Travel: '🚕', Fuel: '⛽', Bills: '💡', Rent: '🏠', Shopping: '🛍️', Health: '💊',
  Entertainment: '🎬', Education: '🎓', Gifts: '🎁', Other: '🧾', Salary: '💼', Business: '🏦', Interest: '📈', Gift: '🎁',
}

/** Icon to show for a category: its own, else the default for its name, else a generic one. */
export const categoryIcon = (c: { name: string; icon: string | null }): string => c.icon || DEFAULT_CATEGORY_ICON[c.name] || '🧾'
