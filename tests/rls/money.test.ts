import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ANON, deleteUser, makeUser, sql, type TestUser } from './helpers'
import { createClient } from '@supabase/supabase-js'

let a: TestUser, b: TestUser
let cash: string, bank: string, ravi: string, other: string

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}
const rpc = (u: TestUser, fn: string, args: Record<string, unknown>) => u.client.rpc(fn as never, args as never) as unknown as PromiseLike<{ data: any; error: { message: string } | null }>
const uid = () => crypto.randomUUID()

const lend = (o: Record<string, unknown> = {}) =>
  rpc(a, 'create_entry', { p_id: uid(), p_kind: 'lent', p_person: ravi, p_title: 'Loan to Ravi', p_amount: 1_000_000, p_account: bank, p_start: '2026-11-01', ...o })
const pay = (entry: string, amount: number, o: Record<string, unknown> = {}) =>
  rpc(a, 'record_payment', { p_id: uid(), p_entry: entry, p_amount: amount, p_paid_on: '2026-11-10', p_account: bank, ...o })
const balance = async (u: TestUser, id: string) =>
  (await must(u.client.from('account_balances').select('balance_paise').eq('account_id', id).single()))!.balance_paise as number
const sched = async (entry: string) => (await sql('select *, due_date::text as due_text from schedule_items where entry_id = $1', [entry])).rows[0]

beforeAll(async () => {
  a = await makeUser('money-a')
  b = await makeUser('money-b')
  cash = (await must(a.client.from('accounts').select('id').eq('name', 'Cash').single()))!.id
  bank = (await must(a.client.from('accounts').insert({ name: 'Bank', type: 'bank', opening_balance_paise: 5_000_000 }).select('id').single()))!.id
  ravi = (await must(a.client.from('people').insert({ name: 'Ravi', phone: '9999900000' }).select('id').single()))!.id
  other = (await must(a.client.from('people').insert({ name: 'Meera' }).select('id').single()))!.id
}, 30_000)

afterAll(async () => { await Promise.all([a, b].map((u) => u && deleteUser(u.id))) })

describe('lend 10,000 → part pay 4,000 → settle 6,000', () => {
  let entry: string
  it('lending moves money out of the account and is not spending', async () => {
    const e = await must(lend())
    entry = e.id
    expect(e).toMatchObject({ kind: 'lent', direction: 'receive', status: 'open', total_payable_paise: 1_000_000, principal_paise: 1_000_000 })
    expect(e.source_txn_id).toBeTruthy()
    expect(await balance(a, bank)).toBe(5_000_000 - 1_000_000)
    const s = await sched(entry)
    expect(s).toMatchObject({ due_paise: '1000000', paid_paise: '0' })
    expect(s.due_text).toBe('9999-12-31')
    const sum = await must(a.client.rpc('activity_summary', { p_filters: {} } as never)) as unknown as { spent: number; received: number }
    expect(sum.spent).toBe(0)
    expect(sum.received).toBe(0)
  })

  it('part payment keeps the entry open and credits the account', async () => {
    const e = await must(pay(entry, 400_000))
    expect(e.status).toBe('open')
    expect(await balance(a, bank)).toBe(4_400_000)
    expect(await sched(entry)).toMatchObject({ paid_paise: '400000' })
    const ov = await must(rpc(a, 'money_overview', { p_today: '2026-11-15' }))
    expect(ov.entries).toHaveLength(1)
    expect(ov.entries[0]).toMatchObject({ outstanding_paise: 600_000, paid_paise: 400_000, person_name: 'Ravi' })
    expect(ov.stats).toMatchObject({ owed_to_me: 600_000, i_owe: 0, overdue_owed_to_me: 0 })
  })

  it('overpayment is rejected and changes nothing', async () => {
    const { error } = await pay(entry, 600_001)
    expect(error?.message).toMatch(/exceeds/)
    expect(await balance(a, bank)).toBe(4_400_000)
    expect(await sched(entry)).toMatchObject({ paid_paise: '400000' })
  })

  it('settling the rest closes the entry and lands it in history', async () => {
    const e = await must(pay(entry, 600_000, { p_paid_on: '2026-11-20' }))
    expect(e).toMatchObject({ status: 'settled', settled_on: '2026-11-20' })
    expect(await balance(a, bank)).toBe(5_000_000)
    expect((await must(rpc(a, 'money_overview', { p_today: '2026-11-21' }))).entries).toHaveLength(0)
    const h = await must(rpc(a, 'money_history', { p_limit: 10 }))
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ id: entry, paid_paise: 1_000_000, settled_on: '2026-11-20', person_name: 'Ravi' })
    const { error } = await pay(entry, 100)
    expect(error?.message).toMatch(/not open/)
  })

  it('deleting a payment reverses its transaction and reopens the entry', async () => {
    const last = (await sql(`select id from payments where entry_id = $1 order by created_at desc limit 1`, [entry])).rows[0].id as string
    const e = await must(rpc(a, 'delete_payment', { p_id: last }))
    expect(e).toMatchObject({ status: 'open', settled_on: null })
    expect(await balance(a, bank)).toBe(4_400_000)
    expect(await sched(entry)).toMatchObject({ paid_paise: '400000', paid_on: null })
    expect((await sql(`select count(*)::int n from transactions where entry_id = $1`, [entry])).rows[0].n).toBe(2) // lend + first payment
  })

  it('mark unpaid removes every payment and its transaction', async () => {
    const e = await must(rpc(a, 'mark_unpaid', { p_entry: entry }))
    expect(e.status).toBe('open')
    expect(await balance(a, bank)).toBe(4_000_000)
    expect((await sql(`select count(*)::int n from payments where entry_id = $1`, [entry])).rows[0].n).toBe(0)
    expect(await sched(entry)).toMatchObject({ paid_paise: '0' })
  })

  it('deleting the entry removes it, its transactions and payments', async () => {
    await must(pay(entry, 100_000))
    await must(rpc(a, 'delete_entry', { p_id: entry }))
    expect(await balance(a, bank)).toBe(5_000_000)
    expect((await sql(`select count(*)::int n from transactions where entry_id = $1`, [entry])).rows[0].n).toBe(0)
    expect((await sql(`select count(*)::int n from entries where id = $1`, [entry])).rows[0].n).toBe(0)
  })
})

describe('borrowed mirror', () => {
  it('borrowing credits the account; repaying debits it; overdue shows in the stats', async () => {
    const e = await must(rpc(a, 'create_entry', { p_id: uid(), p_kind: 'borrowed', p_person: other, p_title: 'From Meera', p_amount: 200_000, p_account: cash, p_start: '2026-10-01', p_due: '2026-10-15' }))
    expect(e).toMatchObject({ kind: 'borrowed', direction: 'pay' })
    expect(await balance(a, cash)).toBe(200_000)
    const stats = (await must(rpc(a, 'money_overview', { p_today: '2026-11-20' }))).stats
    expect(stats).toMatchObject({ i_owe: 200_000, overdue_i_owe: 200_000 })
    expect(stats.ageing_i_owe).toMatchObject({ d31_60: 200_000, current: 0 }) // 36 days late
    await must(pay(e.id, 50_000, { p_account: cash }))
    expect(await balance(a, cash)).toBe(150_000)
    await must(rpc(a, 'delete_entry', { p_id: e.id }))
  })
})

describe('interest', () => {
  it('flat adds a one-time percentage', async () => {
    const e = await must(lend({ p_amount: 1_000_000, p_interest: 'flat', p_rate_bps: 1000 }))
    expect(e.total_payable_paise).toBe(1_100_000)
    expect(await sched(e.id)).toMatchObject({ due_paise: '1100000', interest_paise: '100000', principal_paise: '1000000' })
    await must(rpc(a, 'delete_entry', { p_id: e.id }))
  })
  it('simple is principal × rate × days / 365 up to the due date', async () => {
    const e = await must(lend({ p_amount: 1_000_000, p_interest: 'simple', p_rate_bps: 1200, p_start: '2026-01-01', p_due: '2026-07-01' }))
    expect(e.total_payable_paise).toBe(1_000_000 + Math.round((1_000_000 * 1200 * 181) / (10_000 * 365)))
    const { error } = await rpc(a, 'update_entry', { p_id: e.id, p_patch: { due_date: '2026-08-01' } })
    expect(error?.message).toMatch(/cannot change/)
    await must(rpc(a, 'delete_entry', { p_id: e.id }))
  })
})

describe('validation and idempotency', () => {
  it('rejects bad input', async () => {
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ p_amount: 0 }, /positive/], [{ p_amount: -5 }, /positive/], [{ p_kind: 'emi_purchase' }, /only lent and borrowed/],
      [{ p_due: '2026-10-01' }, /before the start/], [{ p_title: '  ' }, /title/], [{ p_interest: 'flat', p_rate_bps: 0 }, /rate/],
      [{ p_interest: 'simple', p_rate_bps: 100 }, /due date/], [{ p_person: uid() }, /person not found/], [{ p_account: uid() }, /account not found/],
    ]
    for (const [o, re] of cases) expect((await lend(o)).error?.message, JSON.stringify(o)).toMatch(re)
  })
  it('refuses a person or account that belongs to someone else', async () => {
    const theirPerson = (await must(b.client.from('people').insert({ name: 'X' }).select('id').single()))!.id
    expect((await lend({ p_person: theirPerson })).error?.message).toMatch(/person not found/)
    const theirs = (await must(b.client.from('accounts').select('id').limit(1).single()))!.id
    expect((await lend({ p_account: theirs })).error?.message).toMatch(/account not found/)
  })
  it('create_entry and record_payment are idempotent on their ids', async () => {
    const id = uid()
    const first = await must(lend({ p_id: id }))
    const again = await must(lend({ p_id: id }))
    expect(again.id).toBe(first.id)
    expect((await sql(`select count(*)::int n from transactions where entry_id = $1`, [id])).rows[0].n).toBe(1)
    const pid = uid()
    await must(pay(id, 1_000, { p_id: pid }))
    await must(pay(id, 1_000, { p_id: pid }))
    expect(await sched(id)).toMatchObject({ paid_paise: '1000' })
    await must(rpc(a, 'delete_entry', { p_id: id }))
  })
  it('update_entry edits title, notes, person and due date', async () => {
    const e = await must(lend())
    const u = await must(rpc(a, 'update_entry', { p_id: e.id, p_patch: { title: ' New ', notes: 'n', person_id: other, due_date: '2026-12-01' } }))
    expect(u).toMatchObject({ title: 'New', notes: 'n', person_id: other, due_date: '2026-12-01' })
    expect((await sched(e.id)).due_text).toBe('2026-12-01')
    const cleared = await must(rpc(a, 'update_entry', { p_id: e.id, p_patch: { due_date: null } }))
    expect(cleared.due_date).toBeNull()
    expect((await sched(e.id)).due_text).toBe('9999-12-31')
    expect((await rpc(a, 'update_entry', { p_id: e.id, p_patch: { title: '' } })).error).not.toBeNull()
    await must(rpc(a, 'delete_entry', { p_id: e.id }))
  })
})

describe('atomicity', () => {
  it('a failure in the middle of record_payment leaves nothing behind', async () => {
    const e = await must(lend({ p_amount: 300_000 }))
    await sql(`create function fail_payment_txn() returns trigger language plpgsql as $$
      begin if new.title = 'Loan to Ravi' and new.kind = 'debt_in' then raise exception 'forced failure'; end if; return new; end $$`)
    await sql(`create trigger t_fail before insert on transactions for each row execute function fail_payment_txn()`)
    try {
      const { error } = await pay(e.id, 100_000)
      expect(error?.message).toMatch(/forced failure/)
    } finally {
      await sql('drop trigger t_fail on transactions')
      await sql('drop function fail_payment_txn()')
    }
    expect((await sql(`select count(*)::int n from payments where entry_id = $1`, [e.id])).rows[0].n).toBe(0)
    expect(await sched(e.id)).toMatchObject({ paid_paise: '0' })
    expect((await sql(`select status from entries where id = $1`, [e.id])).rows[0].status).toBe('open')
    await must(rpc(a, 'delete_entry', { p_id: e.id }))
  })

  it('a failure in the middle of create_entry leaves nothing behind', async () => {
    const id = uid()
    await sql(`create function fail_lend_sched() returns trigger language plpgsql as $$
      begin raise exception 'forced failure'; end $$`)
    await sql(`create trigger t_fail before insert on schedule_items for each row execute function fail_lend_sched()`)
    try {
      expect((await lend({ p_id: id })).error?.message).toMatch(/forced failure/)
    } finally {
      await sql('drop trigger t_fail on schedule_items')
      await sql('drop function fail_lend_sched()')
    }
    expect((await sql(`select count(*)::int n from entries where id = $1`, [id])).rows[0].n).toBe(0)
    expect((await sql(`select count(*)::int n from transactions where entry_id = $1`, [id])).rows[0].n).toBe(0)
  })

  it('two simultaneous payments cannot overpay (row lock)', async () => {
    const e = await must(lend({ p_amount: 100_000 }))
    const results = await Promise.all([pay(e.id, 70_000), pay(e.id, 70_000)])
    expect(results.filter((r) => r.error).length).toBe(1)
    expect(await sched(e.id)).toMatchObject({ paid_paise: '70000' })
    await must(rpc(a, 'delete_entry', { p_id: e.id }))
  })
})

describe('people', () => {
  it('merge_people moves entries, fills blanks and removes the duplicate', async () => {
    const keep = (await must(a.client.from('people').insert({ name: 'Sam' }).select('id').single()))!.id
    const drop = (await must(a.client.from('people').insert({ name: 'sam ', phone: '12345', notes: 'dup' }).select('id').single()))!.id
    const e = await must(lend({ p_person: drop }))
    const m = await must(rpc(a, 'merge_people', { p_keep: keep, p_drop: drop }))
    expect(m).toMatchObject({ id: keep, phone: '12345', notes: 'dup' })
    expect((await sql(`select person_id from entries where id = $1`, [e.id])).rows[0].person_id).toBe(keep)
    expect((await sql(`select count(*)::int n from people where id = $1`, [drop])).rows[0].n).toBe(0)
    expect((await rpc(a, 'merge_people', { p_keep: keep, p_drop: keep })).error).not.toBeNull()
    expect((await rpc(a, 'merge_people', { p_keep: keep, p_drop: uid() })).error).not.toBeNull()
    await must(rpc(a, 'delete_entry', { p_id: e.id }))
  })

  it('people_balances shows net per person', async () => {
    const e1 = await must(lend({ p_amount: 500_000 }))
    const e2 = await must(rpc(a, 'create_entry', { p_id: uid(), p_kind: 'borrowed', p_person: ravi, p_title: 'Back', p_amount: 120_000, p_account: cash, p_start: '2026-11-02' }))
    const row = (await must(a.client.from('people_balances').select('*').eq('person_id', ravi).single()))!
    expect(row).toMatchObject({ owed_to_me_paise: 500_000, i_owe_paise: 120_000, open_count: 2 })
    await must(rpc(a, 'delete_entry', { p_id: e1.id }))
    await must(rpc(a, 'delete_entry', { p_id: e2.id }))
    const all = (await must(a.client.from('people_balances').select('name,open_count')))!
    expect(all.length).toBeGreaterThanOrEqual(2) // people without entries still listed
  })
})

describe('dashboard', () => {
  it('carries people and net_position that match money_overview', async () => {
    const e = await must(lend({ p_amount: 250_000, p_start: '2026-10-01', p_due: '2026-10-20' }))
    const d = await must(rpc(a, 'dashboard_summary', { p_month: '2026-11', p_today: '2026-11-15', p_filters: {} }))
    const ov = await must(rpc(a, 'money_overview', { p_today: '2026-11-15' }))
    expect(d.people).toEqual(ov.stats)
    expect(d.people.overdue_owed_to_me).toBe(250_000)
    expect(d.people.ageing_owed_to_me.d1_30).toBe(250_000)
    expect(d.net_position.owed_to_me).toBe(ov.stats.owed_to_me)
    expect(d.net_position.assets).toBe((await balance(a, bank)) + (await balance(a, cash)))
    expect(d.month).toBeDefined() // existing keys intact
    await must(rpc(a, 'delete_entry', { p_id: e.id }))
  })
})

describe('isolation', () => {
  it('another user sees none of it and cannot act on it', async () => {
    const e = await must(lend())
    const ov = await must(rpc(b, 'money_overview', { p_today: '2026-11-15' }))
    expect(ov.entries).toEqual([])
    expect(ov.stats.owed_to_me).toBe(0)
    expect(await must(rpc(b, 'money_history', {}))).toEqual([])
    expect((await must(b.client.from('people_balances').select('*')))!.every((r) => r.name !== 'Ravi')).toBe(true)
    for (const [fn, args] of [
      ['record_payment', { p_id: uid(), p_entry: e.id, p_amount: 1, p_paid_on: '2026-11-10', p_account: bank }],
      ['mark_unpaid', { p_entry: e.id }], ['delete_entry', { p_id: e.id }], ['update_entry', { p_id: e.id, p_patch: { title: 'x' } }],
    ] as [string, Record<string, unknown>][]) expect((await rpc(b, fn, args)).error, fn).not.toBeNull()
    expect((await sql(`select count(*)::int n from entries where id = $1`, [e.id])).rows[0].n).toBe(1)
    await must(rpc(a, 'delete_entry', { p_id: e.id }))
  })
  it('anonymous callers are denied', async () => {
    const anon = createClient(process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321', ANON, { auth: { persistSession: false } })
    for (const [fn, args] of [['money_overview', { p_today: '2026-11-15' }], ['money_history', {}], ['create_entry', { p_id: uid() }]] as [string, Record<string, unknown>][])
      expect((await anon.rpc(fn as never, args as never)).error, fn).not.toBeNull()
  })
})

describe('performance with 2,000 entries', () => {
  let perf: TestUser
  beforeAll(async () => {
    perf = await makeUser('money-perf')
    await sql(`insert into people (user_id, name) select $1, 'P' || g from generate_series(1, 50) g`, [perf.id])
    await sql(
      `with e as (
         insert into entries (user_id, kind, direction, person_id, title, principal_paise, start_date, due_date, total_payable_paise, status, settled_on)
         select $1, case when g % 2 = 0 then 'lent' else 'borrowed' end::entry_kind, case when g % 2 = 0 then 'receive' else 'pay' end::entry_dir,
                (select id from people where user_id = $1 order by name offset (g % 50) limit 1), 'E' || g, 100000 + g, date '2026-01-01' + (g % 200),
                case when g % 3 = 0 then null else date '2026-02-01' + (g % 300) end, 100000 + g,
                case when g % 4 = 0 then 'settled' else 'open' end::entry_status, case when g % 4 = 0 then date '2026-09-01' else null end
         from generate_series(1, 2000) g returning id, total_payable_paise, due_date, status)
       insert into schedule_items (user_id, entry_id, seq, due_date, due_paise, principal_paise, paid_paise)
       select $1, id, 1, coalesce(due_date, date '9999-12-31'), total_payable_paise, total_payable_paise, case when status = 'settled' then total_payable_paise else 0 end from e`, [perf.id])
    await sql('analyze entries')
  }, 60_000)
  afterAll(async () => { await deleteUser(perf.id) })

  it('overview, history and dashboard answer in < 150 ms', async () => {
    const time = async (fn: () => PromiseLike<unknown>) => { const t = performance.now(); await fn(); return performance.now() - t }
    await rpc(perf, 'money_overview', { p_today: '2026-11-15' })
    const ov = await time(() => rpc(perf, 'money_overview', { p_today: '2026-11-15' }))
    const hist = await time(() => rpc(perf, 'money_history', { p_limit: 50 }))
    const dash = await time(() => rpc(perf, 'dashboard_summary', { p_month: '2026-11', p_today: '2026-11-15', p_filters: {} }))
    console.log(`money_overview ${ov.toFixed(0)} ms, history ${hist.toFixed(0)} ms, dashboard ${dash.toFixed(0)} ms (2,000 entries)`)
    expect(Math.max(ov, hist, dash)).toBeLessThan(150)
  })
})
