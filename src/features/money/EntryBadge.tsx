import type { EntryStatusLabel } from '@/lib/labels'
import { STATUS_TEXT, STATUS_TONE, TONE_CLS } from './status'

/** Pending / Partial / Overdue / Paid pill: same colours and words on every screen. */
export function EntryBadge({ status }: { status: EntryStatusLabel }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLS[STATUS_TONE[status]]}`}>{STATUS_TEXT[status]}</span>
}
