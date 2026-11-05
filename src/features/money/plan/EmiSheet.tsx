import { useState } from 'react'
import { useAccounts } from '@/features/accounts/queries'
import { useCategories } from '@/features/categories/queries'
import { useToday } from '@/features/profile/useToday'
import { evaluateAmount } from '@/features/quick-add/amount'
import { categoryIcon } from '@/lib/palette'
import { formatMoney } from '@/lib/money'
import { planRpcFields, rowsPayload } from '@/lib/plan'
import { Chip } from '@/ui/Chip'
import { Field, inputCls, primaryBtn } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToasts } from '@/ui/toastStore'
import { useCreatePlan, useDeleteEntry } from '../queries'
import { PlanFields } from './PlanFields'
import { emptyPlanForm, formToSpec, previewFor, type PlanFormState } from './planForm'

const PURCHASE_MODES: PlanFormState['mode'][] = ['nocost', 'emi', 'equal', 'installment', 'weekly', 'custom']

/** EMI / instalment purchase: store, product, price, down payment, plan, category and account. */
export default function EmiSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const today = useToday()
  const accounts = (useAccounts().data ?? []).filter((a) => !a.archived)
  const categories = (useCategories().data ?? []).filter((c) => c.kind === 'expense' && !c.archived)
  const create = useCreatePlan()
  const del = useDeleteEntry()
  const [kind, setKind] = useState<'emi_purchase' | 'instalment'>('emi_purchase')
  const [store, setStore] = useState('')
  const [product, setProduct] = useState('')
  const [price, setPrice] = useState('')
  const [down, setDown] = useState('')
  const [form, setForm] = useState<PlanFormState>(() => emptyPlanForm(today, 'nocost'))
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const priceP = evaluateAmount(price).paise
  const downP = down.trim() ? evaluateAmount(down).paise : 0
  const financed = priceP !== null && downP !== null && downP < priceP ? priceP - downP : 0
  const account = accountId ?? accounts[0]?.id ?? null

  const submit = async () => {
    const e: Record<string, string> = {}
    if (!product.trim()) e.product = 'What did you buy?'
    if (!store.trim()) e.store = 'Where from?'
    if (priceP === null || priceP <= 0) e.price = 'Enter the price'
    else if (downP === null) e.down = 'Enter a valid down payment'
    else if (downP >= priceP) e.down = 'The down payment must be less than the price'
    if (!account) e.account = 'Pick an account'
    const pv = previewFor(form, financed)
    if (!e.price && !e.down && (!pv || !pv.ok)) e.plan = pv && !pv.ok ? pv.error : 'Complete the plan'
    if (Object.keys(e).length || !pv || !pv.ok || !account) return setErrors(e)
    setErrors({})
    const fields = planRpcFields(formToSpec(form, financed), pv.preview)
    const id = crypto.randomUUID()
    try {
      await create.mutateAsync({
        id, kind, person_id: null, party: store.trim(), title: product.trim(), principal_paise: financed, down_paise: downP ?? 0, account_id: account,
        category_id: categoryId, start_date: today, interest: fields.interest, rate_bps: fields.rateBps, no_cost: fields.noCost, rows: rowsPayload(pv.preview.rows),
      })
      useToasts.getState().show({
        message: `${product.trim()}: ${pv.preview.count} × ${formatMoney(pv.preview.monthly)}`,
        actions: [{ label: 'Undo', run: () => void del.mutateAsync(id).catch(() => undefined) }],
      })
      onClose()
    } catch (err) {
      setErrors({ plan: (err as Error).message })
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="EMI / instalments" description="Buy now, pay in parts">
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Kind" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          {([['emi_purchase', 'EMI purchase'], ['instalment', 'Instalments']] as const).map(([v, label]) => (
            <button key={v} role="radio" aria-checked={kind === v} type="button" onClick={() => setKind(v)}
                    className={`min-h-11 rounded-lg text-sm font-medium ${kind === v ? 'bg-surface shadow-sm' : 'text-muted'}`}>{label}</button>
          ))}
        </div>
        <Field label="What did you buy?" error={errors.product}><input className={inputCls} value={product} onChange={(e) => setProduct(e.target.value)} autoComplete="off" /></Field>
        <Field label="Store or lender" error={errors.store}><input className={inputCls} value={store} onChange={(e) => setStore(e.target.value)} autoComplete="off" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (₹)" error={errors.price}><input className={inputCls} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} autoComplete="off" /></Field>
          <Field label="Down payment (₹)" error={errors.down}><input className={inputCls} inputMode="decimal" value={down} onChange={(e) => setDown(e.target.value)} autoComplete="off" /></Field>
        </div>
        {financed > 0 && <p className="text-sm text-muted">Financed: {formatMoney(financed)}</p>}

        <PlanFields form={form} onChange={setForm} principal={financed} modes={PURCHASE_MODES} today={today} />
        {errors.plan && <p role="alert" className="text-sm text-money-red">{errors.plan}</p>}

        <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
          {categories.map((c) => <Chip key={c.id} selected={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}><span aria-hidden>{categoryIcon(c)}</span>{c.name}</Chip>)}
        </div>
        <div>
          <p className="mb-1 text-xs text-muted">{(downP ?? 0) > 0 ? 'Down payment paid from' : 'Instalments paid from (default)'}</p>
          <div role="group" aria-label="Account" className="flex flex-wrap gap-2">
            {accounts.map((a) => <Chip key={a.id} selected={account === a.id} onClick={() => setAccountId(a.id)}>{a.name}</Chip>)}
          </div>
          {errors.account && <p role="alert" className="text-sm text-money-red">{errors.account}</p>}
        </div>
        <button className={primaryBtn} disabled={create.isPending} onClick={() => void submit()}>Save</button>
      </div>
    </Sheet>
  )
}
