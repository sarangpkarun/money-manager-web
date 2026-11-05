import { useState } from 'react'
import { useAccountBalances, useAccounts, useArchiveAccount, useReorderAccounts, useSaveAccount } from '@/features/accounts/queries'
import { utilisationBps, utilisationTone } from '@/features/accounts/utilisation'
import type { Account, AccountBalance } from '@/lib/db'
import { Amount } from '@/ui/Amount'
import { EmptyState } from '@/ui/EmptyState'
import { Field, inputCls, primaryBtn, secondaryBtn } from '@/ui/Field'
import { PageHeader } from '@/ui/PageHeader'
import { Sheet } from '@/ui/Sheet'
import { Skeleton } from '@/ui/Skeleton'
import { Swatches } from '@/ui/Swatches'
import { ACCOUNT_TYPES, accountToForm, emptyAccountForm, validateAccount, type AccountForm } from './forms'

const TONE_BAR = { green: 'bg-money-green', amber: 'bg-money-amber', red: 'bg-money-red' } as const
const typeLabel = (t: string) => ACCOUNT_TYPES.find((x) => x.value === t)?.label ?? t

function AccountRow({ a, bal, first, last, onEdit, onMove }: {
  a: Account; bal?: AccountBalance; first: boolean; last: boolean; onEdit: () => void; onMove: (d: 'up' | 'down') => void
}) {
  const card = a.type === 'credit_card'
  const bps = card ? utilisationBps(bal?.outstanding_paise, a.credit_limit_paise) : null
  return (
    <li className="flex items-stretch gap-2 rounded-2xl bg-surface p-3">
      <button onClick={onEdit} className="min-h-11 flex-1 text-left" aria-label={`Edit ${a.name}`}>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: a.color ?? '#64748b' }} aria-hidden />
          <span className="font-semibold">{a.name}</span>
          <span className="text-xs text-muted">{typeLabel(a.type)}</span>
        </div>
        {bal && (card
          ? <div className="mt-1 text-sm text-muted">Owed <Amount paise={bal.outstanding_paise ?? 0} tone="out" />{a.credit_limit_paise ? <> of <Amount paise={a.credit_limit_paise} /></> : null}{a.due_day ? ` · due ${a.due_day}th` : ''}</div>
          : <div className="mt-1 text-sm"><Amount paise={bal.balance_paise ?? 0} tone={(bal.balance_paise ?? 0) < 0 ? 'out' : 'neutral'} /></div>)}
        {bps !== null && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${(bps / 100).toFixed(0)}% of limit used`}>
            <div className={`h-full ${TONE_BAR[utilisationTone(bps)]}`} style={{ width: `${Math.min(bps / 100, 100)}%` }} />
          </div>
        )}
      </button>
      <div className="flex flex-col justify-center">
        <button disabled={first} onClick={() => onMove('up')} aria-label={`Move ${a.name} up`} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted disabled:opacity-30">▲</button>
        <button disabled={last} onClick={() => onMove('down')} aria-label={`Move ${a.name} down`} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted disabled:opacity-30">▼</button>
      </div>
    </li>
  )
}

function AccountSheet({ account, onClose }: { account: Account | 'new'; onClose: () => void }) {
  const editing = account === 'new' ? null : account
  const [form, setForm] = useState<AccountForm>(editing ? accountToForm(editing) : emptyAccountForm())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string>()
  const save = useSaveAccount()
  const archive = useArchiveAccount()
  const set = <K extends keyof AccountForm>(k: K, v: AccountForm[K]) => setForm((f) => ({ ...f, [k]: v }))
  const card = form.type === 'credit_card'

  const submit = async () => {
    const r = validateAccount(form)
    if (!r.ok) return setErrors(r.errors)
    setErrors({})
    try {
      await save.mutateAsync({ id: editing?.id, values: r.values })
      onClose()
    } catch (e) {
      setServerError((e as Error).message)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={editing ? `Edit ${editing.name}` : 'New account'}>
      <div className="space-y-4">
        <Field label="Name" error={errors.name}><input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" /></Field>
        <Field label="Type">
          <select className={inputCls} value={form.type} onChange={(e) => set('type', e.target.value as AccountForm['type'])}>
            {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label={card ? 'Already owed on this card (₹)' : 'Opening balance (₹)'} error={errors.opening}>
          <input className={inputCls} inputMode="decimal" value={form.opening} onChange={(e) => set('opening', e.target.value)} placeholder="0" />
        </Field>
        {card && (
          <>
            <Field label="Credit limit (₹)" error={errors.limit}><input className={inputCls} inputMode="decimal" value={form.limit} onChange={(e) => set('limit', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Statement day" error={errors.statementDay}><input className={inputCls} inputMode="numeric" value={form.statementDay} onChange={(e) => set('statementDay', e.target.value)} placeholder="e.g. 5" /></Field>
              <Field label="Due day" error={errors.dueDay}><input className={inputCls} inputMode="numeric" value={form.dueDay} onChange={(e) => set('dueDay', e.target.value)} placeholder="e.g. 25" /></Field>
            </div>
          </>
        )}
        <Swatches value={form.color} onChange={(c) => set('color', c)} />
        {serverError && <p role="alert" className="text-sm text-money-red">{serverError}</p>}
        <button className={primaryBtn} onClick={submit} disabled={save.isPending}>Save</button>
        {editing && (
          <button className={secondaryBtn} onClick={async () => { await archive.mutateAsync({ id: editing.id, archived: !editing.archived }); onClose() }}>
            {editing.archived ? 'Restore account' : 'Archive account'}
          </button>
        )}
      </div>
    </Sheet>
  )
}

export default function AccountsScreen() {
  const accounts = useAccounts()
  const balances = useAccountBalances()
  const reorder = useReorderAccounts()
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const all = accounts.data ?? []
  const active = all.filter((a) => !a.archived)
  const archived = all.filter((a) => a.archived)
  const bal = (id: string) => balances.data?.find((b) => b.account_id === id)

  return (
    <div>
      <PageHeader title="Accounts" back="/settings" backLabel="Settings"
        action={<button onClick={() => setEditing('new')} className="min-h-11 rounded-full bg-accent px-4 font-semibold text-white">Add</button>} />
      <div className="space-y-3 px-4 pb-8">
        {accounts.isPending ? <Skeleton className="h-24" />
          : active.length === 0 ? <EmptyState title="No accounts yet" hint="Add where your money lives: cash, bank, UPI or a card." />
          : <ul className="space-y-3">
              {active.map((a, i) => (
                <AccountRow key={a.id} a={a} bal={bal(a.id)} first={i === 0} last={i === active.length - 1}
                  onEdit={() => setEditing(a)} onMove={(dir) => reorder.mutate({ items: active, id: a.id, dir })} />
              ))}
            </ul>}
        {archived.length > 0 && (
          <div>
            <button onClick={() => setShowArchived((s) => !s)} className="min-h-11 text-sm text-muted">{showArchived ? 'Hide' : 'Show'} archived ({archived.length})</button>
            {showArchived && <ul className="mt-2 space-y-2">{archived.map((a) => (
              <li key={a.id}><button onClick={() => setEditing(a)} className="min-h-11 w-full rounded-2xl bg-surface p-3 text-left text-muted">{a.name}</button></li>
            ))}</ul>}
          </div>
        )}
      </div>
      {editing && <AccountSheet key={editing === 'new' ? 'new' : editing.id} account={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
