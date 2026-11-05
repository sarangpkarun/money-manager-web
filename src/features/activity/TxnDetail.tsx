import type { ReactNode } from 'react'
import type { ActivityRow } from '@/lib/db'
import { formatMoney } from '@/lib/money'
import { Amount } from '@/ui/Amount'
import { secondaryBtn } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { isEditable, isLinked, rowTitle, rowTone } from './TxnRow'
import { yourShare } from './rowText'

const KIND_LABEL: Record<string, string> = {
  expense: 'Spent', income: 'Received', transfer: 'Transfer', debt_out: 'Money lent / repaid', debt_in: 'Money received back',
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-start justify-between gap-4 py-2"><dt className="text-muted">{label}</dt><dd className="text-right">{children}</dd></div>
}

/** Details plus Edit/Delete buttons: the accessible equivalent of the swipe actions. */
export function TxnDetail({ row, onClose, onEdit, onDelete, onOpenEntry }: { row: ActivityRow; onClose: () => void; onEdit: () => void; onDelete: () => void; onOpenEntry?: (id: string) => void }) {
  const linked = isLinked(row)
  const tone = rowTone(row.kind)
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={rowTitle(row)} description={KIND_LABEL[row.kind] ?? row.kind}>
      <div className="mb-2 text-center">
        <Amount paise={row.amount_paise} tone={tone} sign={tone !== 'neutral'} className="text-4xl font-bold" />
        {row.for_other_paise > 0 && (
          <p className="text-sm text-muted">{formatMoney(row.for_other_paise)} was for someone else · your share <span className="tabular text-fg">{formatMoney(yourShare(row))}</span></p>
        )}
      </div>
      {(row.others?.length ?? 0) > 0 && (
        <section aria-label="Paid for others" className="mb-3 rounded-2xl bg-surface-2 px-3 py-1">
          <h3 className="pt-2 text-sm font-medium text-muted">Paid for others</h3>
          <ul className="divide-y divide-line">
            {row.others!.map((o) => (
              <li key={o.entry_id} className="flex min-h-12 items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{o.person_name ?? 'Someone'}</span>
                  <span className={`block text-sm ${o.pending_paise > 0 ? 'text-money-amber' : 'text-money-green'}`}>
                    {o.pending_paise > 0 ? `${formatMoney(o.pending_paise)} pending of ${formatMoney(o.amount_paise)}` : `Paid back ${formatMoney(o.amount_paise)}`}
                  </span>
                </span>
                <button className="min-h-11 px-2 text-sm font-medium text-accent" aria-label={`Open entry for ${o.person_name ?? 'someone'}`} onClick={() => onOpenEntry?.(o.entry_id)}>Open entry</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <dl className="divide-y divide-line">
        <Line label="Date">{row.date}</Line>
        {row.kind === 'transfer'
          ? <><Line label="From">{row.account_name}</Line><Line label="To">{row.to_account_name}</Line></>
          : <><Line label="Account">{row.account_name}</Line>{row.category_name && <Line label="Category">{row.category_name}</Line>}</>}
        {row.place && <Line label="Place">{row.place}</Line>}
        {row.notes && <Line label="Note">{row.notes}</Line>}
        {row.tags && row.tags.length > 0 && <Line label="Tags">{row.tags.map((t) => `#${t}`).join(' ')}</Line>}
      </dl>
      {linked ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-muted">This belongs to a loan or EMI. Change or delete it from there, so balances and schedules stay correct.</p>
          <button className={secondaryBtn} onClick={() => onOpenEntry?.(row.entry_id as string)}>Open entry</button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {isEditable(row) && <button className={secondaryBtn} onClick={onEdit}>Edit</button>}
          <button className={`${secondaryBtn} text-money-red ${isEditable(row) ? '' : 'col-span-2'}`} onClick={onDelete}>Delete</button>
        </div>
      )}
    </Sheet>
  )
}
