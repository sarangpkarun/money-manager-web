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
import { ageingBars } from '@/features/money/ageing'
import { dueText } from '@/features/money/status'
import { diffDays } from '@/lib/dates'
import { debtFreeText, loadBars } from './emiLoad'
import { cardDueText, nextCardDue } from '@/lib/cardCycle'
import type { DueSoonItem } from './dashboardTypes'

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
                  className={`min-h-9 flex-1 rounded-lg text-sm ${by === o.v ? 'bg-accent text-on-accent' : 'text-fg'}`}>{o.label}</button>
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
                      ? <button className="block w-full" onClick={() => drillTo(r)}>{inner}<span className="sr-only">, show transactions</span></button>
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

export function CardsCard({ d, drill, today }: { d: Dashboard; drill: Drill; today: string }) {
  const cards = d.accounts.filter((a) => a.type === 'credit_card')
  if (cards.length === 0) return null
  const friends = d.friends
  const forFriends = (accountId: string) => friends?.by_account.find((x) => x.account_id === accountId)?.pending_paise ?? 0
  return (
    <Card title="Credit cards">
      {friends && friends.pending_paise > 0 && (
        <p className="mb-3 rounded-xl bg-money-amber/10 px-3 py-2 text-sm text-money-amber">{formatMoney(friends.pending_paise)} to get back from friends</p>
      )}
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
                      {nextCardDue(c.due_day, today) && <span>{cardDueText(nextCardDue(c.due_day, today)!)}</span>}
                    </div>
                  </>
                ) : nextCardDue(c.due_day, today) ? <div className="mt-1 text-xs text-muted">{cardDueText(nextCardDue(c.due_day, today)!)}</div> : null}
                {forFriends(c.id) > 0 && <div className="mt-1 text-xs text-money-amber">{formatMoney(forFriends(c.id))} of this is for friends</div>}
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

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

// ------------------------------------------------------------------ Net position
export function NetPositionCard({ d, onOpen }: { d: Dashboard; onOpen: () => void }) {
  const n = d.net_position
  if (!n) return null
  const net = n.assets + n.owed_to_me - n.i_owe - n.card_outstanding
  const rows: [string, number, 'in' | 'out' | 'neutral'][] = [
    ['In your accounts', n.assets, 'neutral'], ['Owed to you', n.owed_to_me, 'in'], ['You owe people', n.i_owe, 'out'], ['Card bills', n.card_outstanding, 'out'],
  ]
  return (
    <Card title="Net position" action={<button onClick={onOpen} className={linkBtn}>Money</button>}>
      <Amount paise={net} tone={net < 0 ? 'out' : 'neutral'} className="text-3xl font-bold" />
      <dl className="mt-3 space-y-1 text-sm">
        {rows.filter(([, v]) => v !== 0).map(([label, v, tone]) => (
          <div key={label} className="flex justify-between"><dt className="text-muted">{label}</dt><dd><Amount paise={v} tone={tone} sign={tone !== 'neutral'} /></dd></div>
        ))}
      </dl>
    </Card>
  )
}

// ------------------------------------------------------------------ Money with people
export function PeopleCard({ d, onOpen }: { d: Dashboard; onOpen: () => void }) {
  const p = d.people
  if (!p || p.open_count === 0) return null
  const sides = [
    { key: 'owed', title: 'They owe me', total: p.owed_to_me, overdue: p.overdue_owed_to_me, ageing: p.ageing_owed_to_me, tone: 'in' as const },
    { key: 'owe', title: 'I owe', total: p.i_owe, overdue: p.overdue_i_owe, ageing: p.ageing_i_owe, tone: 'out' as const },
  ].filter((x) => x.total > 0)
  return (
    <Card title="Money with people" action={<button onClick={onOpen} className={linkBtn}>Open</button>}>
      <div className="space-y-4">
        {sides.map((x) => {
          const bars = ageingBars(x.ageing)
          return (
            <div key={x.key} role="group" aria-label={x.title}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted">{x.title}</span>
                <Amount paise={x.total} tone={x.tone} className="text-xl font-semibold" />
              </div>
              {x.overdue > 0 && <div className="text-sm text-money-red">{formatMoney(x.overdue)} overdue</div>}
              <ul className="mt-2 space-y-1">
                {bars.filter((b) => b.paise > 0).map((b) => (
                  <li key={b.key}>
                    <BarRow fraction={b.fraction} color={b.late ? 'var(--red)' : 'var(--accent)'}>
                      <span className="flex min-h-8 items-center justify-between px-2 text-sm"><span>{b.label}</span><span className="tabular">{formatMoney(b.paise)}</span></span>
                    </BarRow>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ------------------------------------------------------------------ Due soon
export function DueSoonCard({ d, today, onPay, onOpen }: { d: Dashboard; today: string; onPay: (i: DueSoonItem) => void; onOpen: (entryId: string) => void }) {
  const ds = d.due_soon
  if (!ds || ds.items.length === 0) return null
  const more = ds.total_count - ds.items.length
  return (
    <Card title="Due soon">
      <ul className="divide-y divide-line">
        {ds.items.map((i) => {
          const late = i.due_date < today
          const receiving = i.direction === 'receive'
          return (
            <li key={`${i.entry_id}-${i.seq}`} className="flex min-h-14 items-center justify-between gap-2 py-1">
              <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(i.entry_id)} aria-label={`${i.title}, ${i.name ?? 'no name'}, open details`}>
                <span className="block truncate font-medium">{i.title}</span>
                <span className={`block truncate text-sm ${late ? 'text-money-red' : 'text-muted'}`}>{i.name ? `${i.name} · ` : ''}{dueText(i.due_date, today, diffDays)}</span>
              </button>
              <Amount paise={i.remaining_paise} tone={receiving ? 'in' : 'out'} className="shrink-0 font-semibold" />
              <button onClick={() => onPay(i)} aria-label={`${receiving ? 'Receive' : 'Pay'} ${i.title}`}
                      className="min-h-11 shrink-0 rounded-full bg-accent px-4 text-sm font-medium text-on-accent">{receiving ? 'Receive' : 'Pay'}</button>
            </li>
          )
        })}
      </ul>
      {more > 0 && <p className="mt-1 text-sm text-muted">+{more} more due soon</p>}
    </Card>
  )
}

// ------------------------------------------------------------------ EMI & loan load
export function EmiLoadCard({ d, today, onOpen }: { d: Dashboard; today: string; onOpen: () => void }) {
  const load = d.emi_load
  if (!load || load.outstanding_paise === 0) return null
  const bars = loadBars(load)
  const free = debtFreeText(load.debt_free_date, today)
  return (
    <Card title="EMI & loan load" action={<button onClick={onOpen} className={linkBtn}>Open</button>}>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted">Still to pay</span>
        <Amount paise={load.outstanding_paise} tone="out" className="text-2xl font-bold" />
      </div>
      {load.overdue_paise > 0 && <div className="text-sm text-money-red">{formatMoney(load.overdue_paise)} overdue from earlier months</div>}
      <ul className="mt-3 flex h-24 items-end gap-1" aria-label="Due each month for the next 12 months">
        {bars.map((b) => (
          <li key={b.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1" aria-label={`${b.label}: ${formatMoney(b.paise)}`}>
            <span className={`w-full rounded-t ${b.first ? 'bg-accent' : 'bg-accent/50'}`} style={{ height: `${Math.max(b.fraction * 100, b.paise > 0 ? 4 : 0)}%` }} />
            <span className="text-[10px] text-muted" aria-hidden>{b.label.slice(0, 1)}</span>
          </li>
        ))}
      </ul>
      {free && <p className="mt-2 text-sm text-muted">{free}</p>}
    </Card>
  )
}
