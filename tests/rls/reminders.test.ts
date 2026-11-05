import fc from 'fast-check'
import { createClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it } from 'vitest'
import { admin, ANON, deleteUser, makeUser, sql, URL, type TestUser } from './helpers'

interface Claimed { user_id: string; key: string; title: string; body: string; url: string; subscriptions: { endpoint: string; keys: unknown }[] }

const uid = () => crypto.randomUUID()
const users: TestUser[] = []

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: RPC results are checked field by field
const rpc = (u: TestUser, fn: string, args: Record<string, unknown>) => u.client.rpc(fn as never, args as never) as unknown as PromiseLike<{ data: any; error: { message: string } | null }>

/** The instant (ISO, UTC) that is `local` ("2026-11-15 09:00") on the wall clock of time zone `tz`. */
async function utc(local: string, tz: string): Promise<string> {
  return (await sql(`select to_char(($1::timestamp at time zone $2) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as t`, [local, tz])).rows[0].t
}

/** Raw claim as the service role (the only role allowed to call it): nothing is confirmed as sent. */
async function claimRaw(now: string): Promise<Claimed[]> {
  return must(admin().rpc('claim_due_reminders' as never, { p_now: now } as never) as unknown as PromiseLike<{ data: Claimed[]; error: { message: string } | null }>)
}
/** What the sender receives at `now`; like the real sender it confirms each item as sent, so it is final (an unconfirmed claim is retried after 10 minutes). */
async function claim(now: string): Promise<Claimed[]> {
  const rows = await claimRaw(now)
  for (const r of rows) await must(admin().rpc('mark_reminder_sent' as never, { p_user: r.user_id, p_key: r.key, p_at: now } as never) as never)
  return rows
}
const mine = (rows: Claimed[], u: TestUser) => rows.filter((r) => r.user_id === u.id)

interface Opts { tz?: string; alarm?: string; qf?: string | null; qu?: string | null; summary?: 'off' | 'daily' | 'weekly'; sumTime?: string; sumDow?: number | null; subscribed?: boolean }
async function setup(label: string, o: Opts = {}) {
  const u = await makeUser(label)
  users.push(u)
  await sql(`update profiles set timezone = $2, alarm_time = $3, quiet_from = $4, quiet_until = $5, summary_mode = $6, summary_time = $7, summary_weekday = $8 where id = $1`,
    [u.id, o.tz ?? 'Asia/Kolkata', o.alarm ?? '09:00', o.qf ?? null, o.qu ?? null, o.summary ?? 'off', o.sumTime ?? '08:00', o.sumDow ?? null])
  if (o.subscribed !== false) await sql(`insert into push_subscriptions (user_id, endpoint, keys) values ($1, $2, '{"p256dh":"p","auth":"a"}')`, [u.id, `https://push.example/${uid()}`])
  const account = (await must(u.client.from('accounts').select('id').limit(1).single()))!.id
  const person = (await must(u.client.from('people').insert({ name: 'Ravi' }).select('id').single()))!.id
  return { u, account: account as string, person: person as string }
}

async function plan(c: { u: TestUser; account: string; person: string }, dues: { date: string; amount?: number }[], o: { kind?: string; title?: string } = {}) {
  const rows = dues.map((d, i) => ({ seq: i + 1, due_date: d.date, due_paise: d.amount ?? 100_000, principal_paise: d.amount ?? 100_000, interest_paise: 0 }))
  const total = rows.reduce((s, r) => s + r.due_paise, 0)
  return (await must(rpc(c.u, 'create_entry_with_plan', {
    p_id: uid(), p_kind: o.kind ?? 'borrowed', p_person: c.person, p_party: null, p_title: o.title ?? 'Plan', p_principal: total, p_down: 0, p_account: c.account,
    p_category: null, p_start: '2026-01-01', p_interest: 'none', p_rate_bps: 0, p_no_cost: false, p_rows: rows,
  }))) as { id: string }
}

afterEach(async () => { await Promise.all(users.splice(0).map((u) => deleteUser(u.id))) })

describe('due tomorrow / today / overdue', () => {
  it('sends each kind once, at the alarm time, with the right words and links', async () => {
    const c = await setup('rem-a')
    const e1 = await plan(c, [{ date: '2026-11-16', amount: 500_000 }], { title: 'Loan A' }) // tomorrow, I owe
    const e2 = await plan(c, [{ date: '2026-11-15', amount: 123_456_700 }], { kind: 'lent', title: 'Loan B' }) // today, owed to me
    const e3 = await plan(c, [{ date: '2026-11-14' }], { title: 'Loan C' }) // overdue (yesterday)
    expect(mine(await claim(await utc('2026-11-15 08:59', 'Asia/Kolkata')), c.u)).toEqual([])
    const rows = mine(await claim(await utc('2026-11-15 09:00', 'Asia/Kolkata')), c.u)
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(Object.keys(by).sort()).toEqual(['due:overdue:2026-11-14', 'due:today:2026-11-15', 'due:tomorrow:2026-11-16'])
    expect(by['due:tomorrow:2026-11-16']).toMatchObject({ title: 'Due tomorrow', body: 'Pay Ravi ₹5,000 · Loan A', url: `/money/entry/${e1.id}` })
    expect(by['due:today:2026-11-15']).toMatchObject({ title: 'Due today', body: 'Ravi owes ₹12,34,567 · Loan B', url: `/money/entry/${e2.id}` })
    expect(by['due:overdue:2026-11-14']).toMatchObject({ title: 'Overdue', body: 'Pay Ravi ₹1,000 · Loan C', url: `/money/entry/${e3.id}` })
    expect(rows[0]!.subscriptions).toHaveLength(1)
    // nothing more, now or later that day
    expect(mine(await claim(await utc('2026-11-15 09:05', 'Asia/Kolkata')), c.u)).toEqual([])
    expect(mine(await claim(await utc('2026-11-15 23:55', 'Asia/Kolkata')), c.u)).toEqual([])
  })

  it('several payments of one kind become one notification that opens that day in the calendar', async () => {
    const c = await setup('rem-b')
    await plan(c, [{ date: '2026-11-15', amount: 300_000 }], { title: 'One' })
    await plan(c, [{ date: '2026-11-15', amount: 200_000 }], { kind: 'lent', title: 'Two' })
    await plan(c, [{ date: '2026-11-15', amount: 100_000 }], { title: 'Three' })
    await plan(c, [{ date: '2026-11-15', amount: 50_000 }], { title: 'Four' })
    const [r] = mine(await claim(await utc('2026-11-15 10:00', 'Asia/Kolkata')), c.u)
    expect(r).toMatchObject({ key: 'due:today:2026-11-15', title: 'Due today', url: '/calendar?day=2026-11-15' })
    expect(r!.body).toBe('4 payments: Pay Ravi ₹3,000; Ravi owes ₹2,000; Pay Ravi ₹1,000 +1 more')
  })

  it('skips paid rows, settled entries, no-due-date loans and entries with reminders turned off', async () => {
    const c = await setup('rem-c')
    const paid = await plan(c, [{ date: '2026-11-15' }])
    await must(rpc(c.u, 'record_payment', { p_id: uid(), p_entry: paid.id, p_amount: 100_000, p_paid_on: '2026-11-10', p_account: c.account }))
    const off = await plan(c, [{ date: '2026-11-15' }])
    await must(rpc(c.u, 'update_entry', { p_id: off.id, p_patch: { remind: false } }))
    await must(rpc(c.u, 'create_entry', { p_id: uid(), p_kind: 'lent', p_person: c.person, p_title: 'Open loan', p_amount: 1000, p_account: c.account, p_start: '2026-11-01' }))
    expect(mine(await claim(await utc('2026-11-15 12:00', 'Asia/Kolkata')), c.u)).toEqual([])
  })

  it('works for EMIs (store name) and friends who owe on a purchase', async () => {
    const c = await setup('rem-d')
    await must(rpc(c.u, 'create_entry_with_plan', {
      p_id: uid(), p_kind: 'emi_purchase', p_person: null, p_party: 'Croma', p_title: 'Phone', p_principal: 600_000, p_down: 0, p_account: c.account, p_category: null,
      p_start: '2026-01-01', p_interest: 'none', p_rate_bps: 0, p_no_cost: false,
      p_rows: [{ seq: 1, due_date: '2026-11-16', due_paise: 600_000, principal_paise: 600_000, interest_paise: 0 }],
    }))
    const add = await must(rpc(c.u, 'quick_add_with_others', { p_id: uid(), p_amount: 300_000, p_date: '2026-11-10', p_account: c.account, p_title: 'Dinner', p_others: [{ person_id: c.person, amount_paise: 300_000, due_date: '2026-11-16' }] }))
    expect(add.entries).toHaveLength(1)
    const [r] = mine(await claim(await utc('2026-11-15 09:00', 'Asia/Kolkata')), c.u)
    expect(r!.title).toBe('Due tomorrow')
    expect(r!.body).toContain('2 payments')
    expect(r!.body).toContain('Pay Croma ₹6,000')
    expect(r!.body).toContain('Ravi owes ₹3,000')
  })
})

describe('time zones and daylight saving', () => {
  it('each user is judged on their own wall clock', async () => {
    const kol = await setup('rem-kol', { tz: 'Asia/Kolkata' })
    const ny = await setup('rem-ny', { tz: 'America/New_York' })
    await plan(kol, [{ date: '2026-11-15' }]); await plan(ny, [{ date: '2026-11-15' }])
    const t1 = await utc('2026-11-15 09:00', 'Asia/Kolkata') // 03:30 UTC: still the night before in New York
    expect(mine(await claim(t1), kol.u)).toHaveLength(1)
    expect(mine(await claim(t1), ny.u)).toEqual([])
    const t2 = await utc('2026-11-15 09:00', 'America/New_York') // 14:00 UTC
    expect(mine(await claim(t2), ny.u)).toHaveLength(1)
  })

  it('follows the clock change: 09:00 is 14:00 UTC after the autumn change and 13:00 UTC after the spring change', async () => {
    const ny = await setup('rem-dst', { tz: 'America/New_York' })
    await plan(ny, [{ date: '2026-11-01' }]); await plan(ny, [{ date: '2026-03-08' }])
    expect(mine(await claim('2026-11-01T13:59:00Z'), ny.u)).toEqual([]) // 08:59 EST
    expect(mine(await claim('2026-11-01T14:00:00Z'), ny.u).map((r) => r.key)).toEqual(['due:today:2026-11-01'])
    expect(mine(await claim('2026-03-08T12:59:00Z'), ny.u)).toEqual([]) // 08:59 EDT
    expect(mine(await claim('2026-03-08T13:00:00Z'), ny.u).map((r) => r.key)).toEqual(['due:today:2026-03-08'])
  })

  it('a user with an unknown time zone is left alone instead of breaking everyone else', async () => {
    const bad = await setup('rem-bad')
    const good = await setup('rem-good')
    await sql(`update profiles set timezone = 'Nowhere/Land' where id = $1`, [bad.u.id])
    await plan(good, [{ date: '2026-11-15' }])
    expect(mine(await claim(await utc('2026-11-15 10:00', 'Asia/Kolkata')), good.u)).toHaveLength(1)
  })
})

describe('quiet hours (automatic reminders wait, manual ones ring on time)', () => {
  const dueToday = (c: Awaited<ReturnType<typeof setup>>) => plan(c, [{ date: '2026-11-15' }])

  it('a wrapping window: an alarm inside the early-morning part waits until quiet_until', async () => {
    const c = await setup('rem-q1', { alarm: '06:00', qf: '22:00', qu: '07:00' })
    await dueToday(c)
    expect(mine(await claim(await utc('2026-11-15 06:30', 'Asia/Kolkata')), c.u)).toEqual([])
    expect(mine(await claim(await utc('2026-11-15 07:00', 'Asia/Kolkata')), c.u)).toHaveLength(1)
  })

  it('a wrapping window: an alarm in the late-evening part is skipped, not sent the next day', async () => {
    const c = await setup('rem-q2', { alarm: '23:00', qf: '22:00', qu: '07:00' })
    await dueToday(c)
    expect(mine(await claim(await utc('2026-11-15 23:30', 'Asia/Kolkata')), c.u)).toEqual([])
    expect(mine(await claim(await utc('2026-11-16 07:00', 'Asia/Kolkata')), c.u)).toEqual([]) // new day: only that day's items count
  })

  it('a same-day window: an alarm inside it waits until it ends; outside it is unaffected', async () => {
    const waits = await setup('rem-q3', { alarm: '13:00', qf: '12:00', qu: '14:00' })
    const free = await setup('rem-q4', { alarm: '09:00', qf: '12:00', qu: '14:00' })
    await dueToday(waits); await dueToday(free)
    const noon = await claim(await utc('2026-11-15 13:30', 'Asia/Kolkata'))
    expect(mine(noon, waits.u)).toEqual([])
    expect(mine(noon, free.u)).toHaveLength(1)
    expect(mine(await claim(await utc('2026-11-15 14:00', 'Asia/Kolkata')), waits.u)).toHaveLength(1)
  })

  it('manual note reminders ring at their time even in quiet hours, up to 6 hours late, then are dropped', async () => {
    const c = await setup('rem-q5', { qf: '22:00', qu: '07:00' })
    const n = await must(c.u.client.from('notes').insert({ kind: 'task', title: 'Call the bank', date: '2026-11-15', remind_at: await utc('2026-11-15 02:00', 'Asia/Kolkata') } as never).select('id').single())
    expect(mine(await claim(await utc('2026-11-15 01:59', 'Asia/Kolkata')), c.u)).toEqual([])
    const [r] = mine(await claim(await utc('2026-11-15 02:00', 'Asia/Kolkata')), c.u) // 02:00 is inside the quiet window
    expect(r).toMatchObject({ title: 'Task', body: 'Call the bank', url: '/calendar?day=2026-11-15' })
    expect(r!.key).toMatch(new RegExp(`^note:${n!.id}:`))
    expect(mine(await claim(await utc('2026-11-15 02:30', 'Asia/Kolkata')), c.u)).toEqual([])
    const late = await setup('rem-q6')
    await late.u.client.from('notes').insert({ kind: 'note', title: 'Late', date: '2026-11-15', remind_at: await utc('2026-11-15 02:00', 'Asia/Kolkata') } as never)
    expect(mine(await claim(await utc('2026-11-15 08:01', 'Asia/Kolkata')), late.u)).toEqual([]) // 6 h 1 min after
    const ok = await setup('rem-q7')
    await ok.u.client.from('notes').insert({ kind: 'note', title: 'Within', date: '2026-11-15', remind_at: await utc('2026-11-15 02:00', 'Asia/Kolkata') } as never)
    expect(mine(await claim(await utc('2026-11-15 07:59', 'Asia/Kolkata')), ok.u)).toHaveLength(1)
  })

  it('a finished one-off task does not ring; a repeating one still does', async () => {
    const c = await setup('rem-q8')
    const at = await utc('2026-11-15 10:00', 'Asia/Kolkata')
    await c.u.client.from('notes').insert([
      { kind: 'task', title: 'Done', date: '2026-11-15', remind_at: at, done: true },
      { kind: 'task', title: 'Weekly', date: '2026-11-15', remind_at: at, repeat_rule: 'weekly' },
    ] as never)
    expect(mine(await claim(at), c.u).map((r) => r.body)).toEqual(['Weekly'])
  })
})

describe('summaries', () => {
  it('are off by default', async () => {
    const c = await setup('rem-s0')
    await plan(c, [{ date: '2026-11-15' }])
    expect(mine(await claim(await utc('2026-11-15 12:00', 'Asia/Kolkata')), c.u).map((r) => r.key)).toEqual(['due:today:2026-11-15']) // only the due reminder
  })

  it('daily: yesterday’s spending (your share), what is due today and what is overdue', async () => {
    const c = await setup('rem-s1', { summary: 'daily', sumTime: '08:00', alarm: '23:00' })
    await sql(`insert into transactions (user_id, kind, amount_paise, for_other_paise, date, account_id) values ($1, 'expense', 50000, 20000, '2026-11-14', $2), ($1, 'expense', 10000, 0, '2026-11-13', $2)`, [c.u.id, c.account])
    await plan(c, [{ date: '2026-11-15', amount: 250_000 }]); await plan(c, [{ date: '2026-11-10', amount: 70_000 }])
    expect(mine(await claim(await utc('2026-11-15 07:59', 'Asia/Kolkata')), c.u)).toEqual([])
    const [r] = mine(await claim(await utc('2026-11-15 08:00', 'Asia/Kolkata')), c.u)
    expect(r).toMatchObject({ key: 'sum:day:2026-11-15', title: 'Your day', url: '/' })
    expect(r!.body).toBe('Yesterday you spent ₹300. 1 due today (₹2,500). 1 overdue (₹700).')
    expect(mine(await claim(await utc('2026-11-15 20:00', 'Asia/Kolkata')), c.u)).toEqual([])
  })

  it('daily with nothing due says so', async () => {
    const c = await setup('rem-s2', { summary: 'daily' })
    const [r] = mine(await claim(await utc('2026-11-15 08:00', 'Asia/Kolkata')), c.u)
    expect(r!.body).toBe('Yesterday you spent ₹0. Nothing due today.')
  })

  it('weekly: only on the chosen weekday; last 7 days and the next 7 days', async () => {
    const c = await setup('rem-s3', { summary: 'weekly', sumDow: 1, alarm: '23:00' }) // Mondays; 16 Nov 2026 is a Monday
    await sql(`insert into transactions (user_id, kind, amount_paise, for_other_paise, date, account_id) values ($1, 'expense', 120000, 0, '2026-11-12', $2), ($1, 'income', 500000, 0, '2026-11-10', $2), ($1, 'expense', 99999, 0, '2026-11-01', $2)`, [c.u.id, c.account])
    await plan(c, [{ date: '2026-11-20', amount: 400_000 }])
    expect(mine(await claim(await utc('2026-11-15 09:00', 'Asia/Kolkata')), c.u)).toEqual([]) // a Sunday
    const [r] = mine(await claim(await utc('2026-11-16 08:00', 'Asia/Kolkata')), c.u)
    expect(r).toMatchObject({ key: 'sum:week:2026-11-16', title: 'Your week' })
    expect(r!.body).toBe('Last 7 days: spent ₹1,200, received ₹5,000. 1 due this week (₹4,000).')
  })

  it('wait for quiet hours like other automatic reminders', async () => {
    const c = await setup('rem-s4', { summary: 'daily', sumTime: '06:00', qf: '22:00', qu: '07:30' })
    expect(mine(await claim(await utc('2026-11-15 07:00', 'Asia/Kolkata')), c.u)).toEqual([])
    expect(mine(await claim(await utc('2026-11-15 07:30', 'Asia/Kolkata')), c.u)).toHaveLength(1)
  })
})

describe('exactly once', () => {
  it('parallel runs at the same moment hand each reminder out once in total', async () => {
    const c = await setup('rem-p')
    await plan(c, [{ date: '2026-11-15' }]); await plan(c, [{ date: '2026-11-16' }]); await plan(c, [{ date: '2026-11-14' }])
    const now = await utc('2026-11-15 09:00', 'Asia/Kolkata')
    const runs = await Promise.all(Array.from({ length: 6 }, () => claim(now)))
    expect(runs.flatMap((r) => mine(r, c.u)).map((r) => r.key).sort()).toEqual(['due:overdue:2026-11-14', 'due:today:2026-11-15', 'due:tomorrow:2026-11-16'])
  })

  it('property: over random run times, no reminder is ever handed out twice', async () => {
    const c = await setup('rem-prop', { summary: 'daily', qf: '23:00', qu: '07:00' })
    await plan(c, [{ date: '2026-11-15' }, { date: '2026-11-16' }]); await plan(c, [{ date: '2026-11-14' }], { kind: 'lent' })
    await c.u.client.from('notes').insert({ kind: 'note', title: 'N', date: '2026-11-15', remind_at: await utc('2026-11-15 11:11', 'Asia/Kolkata') } as never)
    const seen = new Map<string, number>()
    await fc.assert(fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 24 * 12 }), { minLength: 5, maxLength: 20 }), async (steps) => {
      for (const s of [...steps].sort((a, b) => a - b)) {
        const iso = await utc(`2026-11-15 ${String(Math.floor(s / 12)).padStart(2, '0')}:${String((s % 12) * 5).padStart(2, '0')}`.replace(' 24:00', ' 23:59'), 'Asia/Kolkata')
        for (const r of mine(await claim(iso), c.u)) seen.set(r.key, (seen.get(r.key) ?? 0) + 1)
      }
      expect([...seen.values()].every((n) => n === 1)).toBe(true)
    }), { numRuns: 6 })
    expect(seen.size).toBeGreaterThan(0)
  }, 120_000)

  it('an unsent claim is handed out again after the 10-minute lease; a sent one never; a released one at once', async () => {
    const c = await setup('rem-lease')
    await plan(c, [{ date: '2026-11-15' }])
    const t0 = new Date(await utc('2026-11-15 09:00', 'Asia/Kolkata')).getTime()
    const at = (min: number) => new Date(t0 + min * 60_000).toISOString()
    const key = 'due:today:2026-11-15'
    expect(mine(await claimRaw(at(0)), c.u).map((r) => r.key)).toEqual([key])
    expect(mine(await claimRaw(at(5)), c.u)).toEqual([]) // within the lease
    expect(mine(await claimRaw(at(11)), c.u).map((r) => r.key)).toEqual([key]) // sender never confirmed: try again
    await must(admin().rpc('release_reminder' as never, { p_user: c.u.id, p_key: key } as never) as never)
    expect(mine(await claimRaw(at(12)), c.u).map((r) => r.key)).toEqual([key]) // released: retried now
    await must(admin().rpc('mark_reminder_sent' as never, { p_user: c.u.id, p_key: key, p_at: at(12) } as never) as never)
    expect(mine(await claimRaw(at(60)), c.u)).toEqual([]) // sent: never again
    await must(admin().rpc('release_reminder' as never, { p_user: c.u.id, p_key: key } as never) as never) // too late to release a sent one
    expect(mine(await claimRaw(at(61)), c.u)).toEqual([])
  })

  it('a user with no device is not claimed (so they still get it once they subscribe)', async () => {
    const c = await setup('rem-nodev', { subscribed: false })
    await plan(c, [{ date: '2026-11-15' }])
    const now = await utc('2026-11-15 10:00', 'Asia/Kolkata')
    expect(mine(await claim(now), c.u)).toEqual([])
    await sql(`insert into push_subscriptions (user_id, endpoint, keys) values ($1, 'https://push.example/late', '{"p256dh":"p","auth":"a"}')`, [c.u.id])
    expect(mine(await claim(now), c.u)).toHaveLength(1)
  })

  it('every device of the owner is returned, and nobody else’s', async () => {
    const a = await setup('rem-own-a'); const b = await setup('rem-own-b')
    await sql(`insert into push_subscriptions (user_id, endpoint, keys) values ($1, 'https://push.example/second-device', '{"p256dh":"p","auth":"a"}')`, [a.u.id])
    await plan(a, [{ date: '2026-11-15' }]); await plan(b, [{ date: '2026-11-15' }])
    const rows = await claim(await utc('2026-11-15 10:00', 'Asia/Kolkata'))
    expect(mine(rows, a.u)[0]!.subscriptions).toHaveLength(2)
    expect(mine(rows, b.u)[0]!.subscriptions).toHaveLength(1)
    const endpoints = (r: Claimed) => r.subscriptions.map((s) => s.endpoint)
    expect(endpoints(mine(rows, b.u)[0]!).every((e) => !endpoints(mine(rows, a.u)[0]!).includes(e))).toBe(true)
  })
})

describe('devices (push subscriptions)', () => {
  const keys = { p256dh: 'BKey', auth: 'secret' }
  it('claim_push_subscription saves a device and moves it to whoever signs in on it next', async () => {
    const a = await setup('rem-dev-a', { subscribed: false }); const b = await setup('rem-dev-b', { subscribed: false })
    const endpoint = `https://push.example/${uid()}`
    await must(rpc(a.u, 'claim_push_subscription', { p_endpoint: endpoint, p_keys: keys, p_user_agent: 'iPhone' }))
    expect((await sql(`select user_id from push_subscriptions where endpoint = $1`, [endpoint])).rows.map((r) => r.user_id)).toEqual([a.u.id])
    await must(rpc(b.u, 'claim_push_subscription', { p_endpoint: endpoint, p_keys: keys }))
    expect((await sql(`select user_id from push_subscriptions where endpoint = $1`, [endpoint])).rows.map((r) => r.user_id)).toEqual([b.u.id])
    await must(rpc(b.u, 'claim_push_subscription', { p_endpoint: endpoint, p_keys: keys })) // again: still one row
    expect((await sql(`select count(*)::int n from push_subscriptions where endpoint = $1`, [endpoint])).rows[0].n).toBe(1)
    // users can remove their own device (logout), not other people's
    expect((await a.u.client.from('push_subscriptions').delete().eq('endpoint', endpoint).select()).data).toEqual([])
    expect((await b.u.client.from('push_subscriptions').delete().eq('endpoint', endpoint).select()).data).toHaveLength(1)
  })
  it('rejects malformed subscriptions and anonymous callers', async () => {
    const a = await setup('rem-dev-c', { subscribed: false })
    for (const [e, k] of [['', keys], ['https://push.example/x', {}], ['https://push.example/x', { p256dh: 'p' }]] as [string, unknown][])
      expect((await rpc(a.u, 'claim_push_subscription', { p_endpoint: e, p_keys: k })).error, String(e)).not.toBeNull()
    const anon = createClient(URL, ANON, { auth: { persistSession: false } })
    expect((await anon.rpc('claim_push_subscription' as never, { p_endpoint: 'https://push.example/xxxxxx', p_keys: keys } as never)).error).not.toBeNull()
  })
})

describe('who may call what', () => {
  it('signed-in users cannot claim reminders, read the log or the cron secret', async () => {
    const c = await setup('rem-perm')
    await plan(c, [{ date: '2026-11-15' }])
    await claim(await utc('2026-11-15 10:00', 'Asia/Kolkata')) // creates a log row
    for (const [fn, args] of [['claim_due_reminders', {}], ['get_cron_secret', {}], ['mark_reminder_sent', { p_user: c.u.id, p_key: 'x' }], ['release_reminder', { p_user: c.u.id, p_key: 'x' }]] as [string, Record<string, unknown>][])
      expect((await rpc(c.u, fn, args)).error, fn).not.toBeNull()
    expect((await c.u.client.from('reminder_log' as never).select('*')).error).not.toBeNull()
    const anon = createClient(URL, ANON, { auth: { persistSession: false } })
    expect((await anon.rpc('claim_due_reminders' as never, {} as never)).error).not.toBeNull()
    const secret = await must(admin().rpc('get_cron_secret' as never) as unknown as PromiseLike<{ data: string; error: { message: string } | null }>)
    expect(secret).toMatch(/^[0-9a-f-]{72}$/) // generated in the database
  })
})

describe('text helpers', () => {
  it('fmt_inr groups the Indian way', async () => {
    const f = async (p: number) => (await sql(`select private.fmt_inr($1::bigint) as t`, [p])).rows[0].t
    expect(await f(0)).toBe('₹0')
    expect(await f(99)).toBe('₹0.99')
    expect(await f(100)).toBe('₹1')
    expect(await f(123_400)).toBe('₹1,234')
    expect(await f(12_345_678_00)).toBe('₹1,23,45,678')
    expect(await f(1_000_050)).toBe('₹10,000.50')
    expect(await f(-250_000)).toBe('-₹2,500')
  })
})

describe('deleting an account', () => {
  it('removes every row the user owns, in every table', async () => {
    const c = await setup('rem-del')
    const e = await plan(c, [{ date: '2026-11-15' }])
    await must(rpc(c.u, 'record_payment', { p_id: uid(), p_entry: e.id, p_amount: 10_000, p_paid_on: '2026-11-10', p_account: c.account }))
    await rpc(c.u, 'quick_add_with_others', { p_id: uid(), p_amount: 100_000, p_date: '2026-11-10', p_account: c.account, p_others: [{ person_id: c.person, amount_paise: 50_000 }] })
    await c.u.client.from('notes').insert({ kind: 'note', title: 'x', date: '2026-11-15', remind_at: await utc('2026-11-15 10:00', 'Asia/Kolkata') } as never)
    await claim(await utc('2026-11-15 10:00', 'Asia/Kolkata'))
    const tables = (await sql(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'user_id' group by table_name`)).rows.map((r) => r.table_name as string)
    expect(tables).toEqual(expect.arrayContaining(['accounts', 'transactions', 'entries', 'schedule_items', 'payments', 'notes', 'people', 'push_subscriptions', 'reminder_log']))
    const total = async () => { let n = 0; for (const t of tables) n += (await sql(`select count(*)::int n from public."${t}" where user_id = $1`, [c.u.id])).rows[0].n; return n + (await sql(`select count(*)::int n from profiles where id = $1`, [c.u.id])).rows[0].n }
    expect(await total()).toBeGreaterThan(8)
    await deleteUser(c.u.id)
    users.splice(users.indexOf(c.u), 1)
    expect(await total()).toBe(0)
  })
})
