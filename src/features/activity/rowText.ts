import type { OtherPending } from '@/lib/db'
import { formatMoney } from '@/lib/money'

/** Amber line in an Activity row: "₹20,000 pending from Arun" or "₹30,000 pending from Arun +1 more". Null when nobody still owes. */
export function pendingBadge(others: OtherPending[] | null | undefined): string | null {
  const open = (others ?? []).filter((o) => o.pending_paise > 0)
  if (open.length === 0) return null
  const total = open.reduce((s, o) => s + o.pending_paise, 0)
  const first = open[0]!.person_name ?? 'someone'
  return `${formatMoney(total)} pending from ${first}${open.length > 1 ? ` +${open.length - 1} more` : ''}`
}

/** What the purchase cost you: the amount minus what you paid for others. */
export const yourShare = (r: { amount_paise: number; for_other_paise: number }): number => r.amount_paise - r.for_other_paise
