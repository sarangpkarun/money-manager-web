import { useState } from 'react'
import { useAccounts } from '@/features/accounts/queries'
import { evaluateAmount } from '@/features/quick-add/amount'
import type { PayMode } from '@/lib/db'
import { formatMoney, toRupeeInput } from '@/lib/money'
import { Chip } from '@/ui/Chip'
import { Field, inputCls, primaryBtn } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToasts } from '@/ui/toastStore'
import { useRecordPayment } from './queries'
import type { Direction } from './types'

const MODES: { v: PayMode; label: string }[] = [{ v: 'cash', label: 'Cash' }, { v: 'upi', label: 'UPI' }, { v: 'bank', label: 'Bank' }, { v: 'card', label: 'Card' }, { v: 'other', label: 'Other' }]

/** Record a payment against an entry. Overpayment is refused here and again by the database. */
export function PaymentSheet({ entryId, direction, remaining, today, defaultAccountId, onClose }: {
  entryId: string; direction: Direction; remaining: number; today: string; defaultAccountId?: string | null; onClose: () => void
}) {
  const accounts = (useAccounts().data ?? []).filter((a) => !a.archived)
  const record = useRecordPayment()
  const [amount, setAmount] = useState(toRupeeInput(remaining))
  const [accountId, setAccountId] = useState<string | null>(defaultAccountId ?? null)
  const [date, setDate] = useState(today)
  const [mode, setMode] = useState<PayMode | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const account = accountId ?? accounts[0]?.id ?? null
  const receiving = direction === 'receive'
  const parsed = evaluateAmount(amount)

  const submit = async () => {
    if (parsed.paise === null || parsed.paise <= 0) return setError('Enter an amount')
    if (parsed.paise > remaining) return setError(`That is more than the ${formatMoney(remaining)} left`)
    if (!account) return setError('Choose an account')
    if (!date) return setError('Choose a date')
    setError(null)
    try {
      await record.mutateAsync({ id: crypto.randomUUID(), entry_id: entryId, amount_paise: parsed.paise, paid_on: date, account_id: account, mode, note: note.trim() || null })
      useToasts.getState().show({ message: parsed.paise === remaining ? 'Settled in full' : `${receiving ? 'Received' : 'Paid'} ${formatMoney(parsed.paise)}` })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={receiving ? 'Receive money' : 'Pay back'} description={`${formatMoney(remaining)} left`}>
      <div className="space-y-4">
        <Field label="Amount (₹)" error={error ?? undefined} hint={parsed.preview ?? undefined}>
          <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
        </Field>
        <div className="flex gap-2">
          <Chip onClick={() => setAmount(toRupeeInput(remaining))}>Full amount</Chip>
          {remaining >= 200 && <Chip onClick={() => setAmount(toRupeeInput(Math.floor(remaining / 2)))}>Half</Chip>}
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm text-muted">{receiving ? 'Received into' : 'Paid from'}</legend>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => <Chip key={a.id} selected={account === a.id} onClick={() => setAccountId(a.id)}>{a.name}</Chip>)}
          </div>
        </fieldset>
        <Field label="Date"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <fieldset className="space-y-2">
          <legend className="text-sm text-muted">How (optional)</legend>
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => <Chip key={m.v} selected={mode === m.v} onClick={() => setMode(mode === m.v ? null : m.v)}>{m.label}</Chip>)}
          </div>
        </fieldset>
        <Field label="Note (optional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" /></Field>
        <button className={primaryBtn} disabled={record.isPending} onClick={() => void submit()}>{receiving ? 'Receive' : 'Pay'}</button>
      </div>
    </Sheet>
  )
}
