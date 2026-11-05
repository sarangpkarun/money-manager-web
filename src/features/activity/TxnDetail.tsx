import type { ReactNode } from 'react'
import type { ActivityRow } from '@/lib/db'
import { formatMoney } from '@/lib/money'
import { Amount } from '@/ui/Amount'
import { secondaryBtn } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { isEditable, rowTitle, rowTone } from './TxnRow'

const KIND_LABEL: Record<string, string> = {
  expense: 'Spent', income: 'Received', transfer: 'Transfer', debt_out: 'Money lent / repaid', debt_in: 'Money received back',
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-start justify-between gap-4 py-2"><dt className="text-muted">{label}</dt><dd className="text-right">{children}</dd></div>
}

/** Details plus Edit/Delete buttons: the accessible equivalent of the swipe actions. */
export function TxnDetail({ row, onClose, onEdit, onDelete, onOpenEntry }: { row: ActivityRow; onClose: () => void; onEdit: () => void; onDelete: () => void; onOpenEntry?: (id: string) => void }) {
  const linked = !isEditable(row) && !!row.entry_id
  const tone = rowTone(row.kind)
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={rowTitle(row)} description={KIND_LABEL[row.kind] ?? row.kind}>
      <div className="mb-2 text-center">
        <Amount paise={row.amount_paise} tone={tone} sign={tone !== 'neutral'} className="text-4xl font-bold" />
        {row.for_other_paise > 0 && <p className="text-sm text-muted">{formatMoney(row.for_other_paise)} was for someone else</p>}
      </div>
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
          <p className="text-sm text-muted">This belongs to a loan. Change or delete it from the loan, so balances stay correct.</p>
          <button className={secondaryBtn} onClick={() => onOpenEntry?.(row.entry_id as string)}>Open loan</button>
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
