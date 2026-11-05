import { useState, type ReactNode } from 'react'
import type { ActivityRow } from '@/lib/db'
import { formatMoney } from '@/lib/money'
import { categoryIcon, PALETTE } from '@/lib/palette'
import { Amount } from '@/ui/Amount'
import { BarRow } from '@/ui/charts/BarRow'
import { Donut } from '@/ui/charts/Donut'
import { barFractions } from '@/ui/charts/geometry'
import { Sparkline } from '@/ui/charts/Sparkline'
import { utilisationBps, utilisationTone } from '@/features/accounts/utilisation'
import { TxnRow } from '@/features/activity/TxnRow'
import { dayLabel } from '@/features/activity/group'
import { topN, type BreakdownRow } from './breakdown'
import type { Dashboard } from './dashboardTypes'
import { vsLastMonth } from './delta'

export function Card({ title, action, children, label }: { title: string; action?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <section aria-label={label ?? title} className="mx-4 rounded-2xl bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const linkBtn = 'min-h-11 px-2 text-sm font-medium text-accent'

/** Where a tap on a card goes. `search` is the Activity query string. */
export type Drill = (search: Record<string, string>) => void

// ------------------------------------------------------------------ This month
export function ThisMonthCard({ d, today, onOpen }: { d: Dashboard; today: string; onOpen: () => void }) {
  const m = d.month
  const delta = vsLastMonth(m.spent, m.prev_spent)
  const deltaText =
    delta.kind === 'none' ? null
    : delta.kind === 'new' ? 'Nothing spent last month'
    : delta.kind === 'same' ? 'Same as last month'
    : `${delta.kind === 'up' ? '▲' : '▼'} ${delta.pct}% (${formatMoney(delta.diff)}) ${delta.kind === 'up' ? 'more' : 'less'} than last month`
  return (
    <Card title="This month" action={<button onClick={onOpen} className={linkBtn}>Details</button>}>
      <div className="tabular text-4xl font-bold" aria-label={`Spent ${formatMoney(m.spent)}`}>{formatMoney(m.spent)}</div>
      <div className="text-sm text-muted">spent{m.projected_spent !== null && <> · on pace for <span className="tabular text-fg">{formatMoney(m.projected_spent)}</span></>}</div>
      {deltaText && <div className={`mt-1 text-sm ${delta.kind === 'up' ? 'text-money-red' : delta.kind === 'down' ? 'text-money-green' : 'text-muted'}`}>{deltaText}</div>}
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div><div className="text-muted">Received</div><Amount paise={m.received} tone="in" className="text-lg font-semibold" /></div>
        <div><div className="text-muted">Saved</div><Amount paise={m.saved} tone={m.saved < 0 ? 'out' : 'in'} className="text-lg font-semibold" /></div>
      </div>
      <div className="mt-3">
        <Sparkline values={d.daily.map((x) => x.spent)} labels={d.daily.map((x) => dayLabel(x.date, today))} average={m.avg_daily_spent}
                   label={`Daily spending this month, average ${formatMoney(m.avg_daily_spent ?? 0)} a day`} />
      </div>
    </Card>
  )
}

// ------------------------------------------------------------------ Where it went
type By = 'category' | 'account' | 'place'
const BY_KEY = 'mm-home-by'
const BYS: { v: By; label: string }[] = [{ v: 'category', label: 'Category' }, { v: 'account', label: 'Account' }, { v: 'place', label: 'Place' }]

function loadBy(): By {
  try { const v = localStorage.getItem(BY_KEY); if (v === 'category' || v === 'account' || v === 'place') return v } catch { /* storage blocked */ }
  return 'category'
}

const colorFor = (r: BreakdownRow, i: number): string => (r.other ? '#64748b' : r.color || PALETTE[i % PALETTE.length]!)

export function WhereItWentCard({ d, drill }: { d: Dashboard; drill: Drill }) {
  const [by, setBy] = useState<By>(loadBy)
  const choose = (v: By) => {
    setBy(v)
    try { localStorage.setItem(BY_KEY, v) } catch { /* ignore */ }
  }
  const source = by === 'category' ? d.by_category : by === 'account' ? d.by_account : d.by_place
  const rows = topN(source)
  const colors = rows.map(colorFor)
  const fractions = barFractions(rows.map((r) => r.spent))

  const drillTo = (r: BreakdownRow) => {
    if (r.other || (by !== 'place' && !r.id)) return
    if (by === 'category') drill({ cat: r.id! })
    else if (by === 'account') drill({ acc: r.id! })
    else if (r.name !== 'No place') drill({ place: r.name })
  }
  const drillable = (r: BreakdownRow) => !r.other && (by === 'place' ? r.name !== 'No place' : !!r.id)

  return (
    <Card title="Where it went">
      <div role="group" aria-label="Group by" className="mb-3 flex gap-1 rounded-xl bg-surface-2 p-1">
        {BYS.map((o) => (
          <button key={o.v} aria-pressed={by === o.v} onClick={() => choose(o.v)}
                  className={`min-h-9 flex-1 rounded-lg text-sm ${by === o.v ? 'bg-accent text-white' : 'text-fg'}`}>{o.label}</button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-muted">No spending to break down.</p>
      ) : (
        <>
          <Donut values={rows.map((r) => r.spent)} colors={colors} label={`Spending by ${by}`}
                 centre={<><span className="text-xs text-muted">Total</span><span className="tabular text-base font-semibold">{formatMoney(d.month.spent)}</span></>} />
          <ul className="mt-3 space-y-1">
            {rows.map((r, i) => {
              const inner = (
                <span className="flex min-h-11 items-center gap-2 px-2">
                  <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: colors[i] }} />
                  {by === 'category' && !r.other && <span aria-hidden>{categoryIcon({ name: r.name, icon: r.icon ?? null })}</span>}
                  <span className="min-w-0 flex-1 truncate text-left">{r.name}</span>
                  <span className="tabular text-sm text-muted">{r.pct}%</span>
                  <span className="tabular w-20 text-right font-medium">{formatMoney(r.spent)}</span>
                </span>
              )
              return (
                <li key={`${r.id ?? r.name}-${i}`}>
                  <BarRow fraction={fractions[i] ?? 0} color={colors[i]!}>
                    {drillable(r)
                      ? <button className="block w-full" onClick={() => drillTo(r)} aria-label={`${r.name}, ${formatMoney(r.spent)}, ${r.pct}%. Show transactions`}>{inner}</button>
                      : inner}
                  </BarRow>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Card>
  )
}

// ------------------------------------------------------------------ Cards
const TONE_BG = { green: 'bg-money-green', amber: 'bg-money-amber', red: 'bg-money-red' } as const

export function CardsCard({ d, drill }: { d: Dashboard; drill: Drill }) {
  const cards = d.accounts.filter((a) => a.type === 'credit_card')
  if (cards.length === 0) return null
  return (
    <Card title="Credit cards">
      <ul className="space-y-3">
        {cards.map((c) => {
          const bps = utilisationBps(c.outstanding_paise, c.credit_limit_paise)
          const tone = bps === null ? 'green' : utilisationTone(bps)
          return (
            <li key={c.id}>
              <button className="block w-full text-left" onClick={() => drill({ acc: c.id })} aria-label={`${c.name}, ${formatMoney(c.outstanding_paise ?? 0)} outstanding. Show transactions`}>
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{c.name}</span>
                  <span className="tabular font-semibold">{formatMoney(c.outstanding_paise ?? 0)}</span>
                </div>
                {bps !== null && c.credit_limit_paise ? (
                  <>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Credit used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(Math.round(bps / 100), 100)}>
                      <div className={`h-full rounded-full ${TONE_BG[tone]}`} style={{ width: `${Math.min(bps / 100, 100)}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-muted">
                      <span>{(bps / 100).toFixed(0)}% of {formatMoney(c.credit_limit_paise)}</span>
                      {c.due_day ? <span>Due on the {c.due_day}{ord(c.due_day)}</span> : null}
                    </div>
                  </>
                ) : c.due_day ? <div className="mt-1 text-xs text-muted">Due on the {c.due_day}{ord(c.due_day)}</div> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

const ord = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')

// ------------------------------------------------------------------ Recent
export function RecentCard({ d, onSeeAll }: { d: Dashboard; onSeeAll: () => void }) {
  if (d.recent.length === 0) return null
  return (
    <Card title="Recent activity" action={<button onClick={onSeeAll} className={linkBtn}>See all</button>}>
      <div className="-mx-4 divide-y divide-line">
        {d.recent.map((r) => <TxnRow key={r.id} row={r as unknown as ActivityRow} onOpen={onSeeAll} />)}
      </div>
    </Card>
  )
}
