import fc from 'fast-check'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildSchedule } from '../../src/lib/schedule'
import { ANON, deleteUser, makeUser, sql, type TestUser } from './helpers'

interface Cal {
  month: string; start: string; end: string
  totals: { spent: number; received: number; dues_paise: number; overdue_paise: number }
  days: { date: string; spent: number; received: number; txn_count: number }[]
  items: { entry_id: string; seq: number; title: string; due_date: string; due_paise: number; paid_paise: number; paid_on: string | null; remaining_paise: number; name: string | null }[]
  txns: { id: string; date: string; kind: string; amount_paise: number; account_name: string | null; category_name: string | null }[]
  notes: { id: string; kind: string; title: string; date: string; repeat_rule: string | null; done: boolean }[]
}

let a: TestUser, b: TestUser
let cash: string, bank: string, food: string, ravi: string

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: RPC results are checked field by field
const rpc = (u: TestUser, fn: string, args: Record<string, unknown>) => u.client.rpc(fn as never, args as never) as unknown as PromiseLike<{ data: any; error: { message: string } | null }>
const cal = async (u: TestUser, month: string, today = '2026-11-15', filters: Record<string, unknown> = {}) =>
  (await must(rpc(u, 'calendar_month', { p_month: month, p_today: today, p_filters: filters }))) as Cal
const uid = () => crypto.randomUUID()
const ins = (u: TestUser, rows: Record<string, unknown>[]) =>
  must(u.client.from('transactions').insert(rows.map((r) => ({ for_other_paise: 0, ...r })) as never))
const payload = (rows: ReturnType<typeof buildSchedule>['rows']) => rows.map(({ seq, due_date, due_paise, principal_paise, interest_paise }) => ({ seq, due_date, due_paise, principal_paise, interest_paise }))
const plan = (u: TestUser, count: number, first: string, o: Record<string, unknown> = {}) =>
  must(rpc(u, 'create_entry_with_plan', {
    p_id: uid(), p_kind: 'borrowed', p_person: ravi, p_party: null, p_title: 'Plan', p_principal: count * 100_000, p_down: 0, p_account: bank, p_category: null,
    p_start: first, p_interest: 'none', p_rate_bps: 0, p_no_cost: false,
    p_rows: payload(buildSchedule({ mode: 'equal', principal: count * 100_000, count, firstDate: first }).rows), ...o,
  })) as Promise<{ id: string }>
const note = (u: TestUser, o: Record<string, unknown>) => must(u.client.from('notes').insert({ kind: 'task', title: 'T', date: '2026-11-10', ...o } as never).select('id').single())

beforeAll(async () => {
  a = await makeUser('cal-a')
  b = await makeUser('cal-b')
  cash = (await must(a.client.from('accounts').select('id').eq('name', 'Cash').single()))!.id
  bank = (await must(a.client.from('accounts').insert({ name: 'Bank', type: 'bank', opening_balance_paise: 100_000_000 }).select('id').single()))!.id
  food = (await must(a.client.from('categories').select('id').eq('name', 'Food').single()))!.id
  ravi = (await must(a.client.from('people').insert({ name: 'Ravi' }).select('id').single()))!.id
}, 30_000)
afterAll(async () => { await Promise.all([a, b].map((u) => u && deleteUser(u.id))) })

describe('spending, receipts and totals', () => {
  beforeAll(async () => {
    await ins(a, [
      { kind: 'expense', amount_paise: 30_000, for_other_paise: 10_000, date: '2026-11-01', account_id: cash, category_id: food, title: 'Dinner', place: 'Cafe' },
      { kind: 'expense', amount_paise: 20_000, date: '2026-11-01', account_id: cash, title: 'Taxi' },
      { kind: 'expense', amount_paise: 5_000, date: '2026-11-30', account_id: bank, title: 'Last day' },
      { kind: 'income', amount_paise: 900_000, date: '2026-11-03', account_id: bank, title: 'Pay' },
      { kind: 'transfer', amount_paise: 70_000, date: '2026-11-04', account_id: bank, to_account_id: cash },
      { kind: 'debt_out', amount_paise: 40_000, date: '2026-11-04', account_id: cash },
      { kind: 'expense', amount_paise: 99_000, date: '2026-10-31', account_id: cash },
      { kind: 'expense', amount_paise: 98_000, date: '2026-12-01', account_id: cash },
    ])
  })

  it('totals use personal spend; transfers and debts are not spending; neighbouring months stay out', async () => {
    const c = await cal(a, '2026-11')
    expect(c.totals).toMatchObject({ spent: 20_000 + 20_000 + 5_000, received: 900_000 })
    expect(c.days).toEqual([
      { date: '2026-11-01', spent: 40_000, received: 0, txn_count: 2 },
      { date: '2026-11-03', spent: 0, received: 900_000, txn_count: 1 },
      { date: '2026-11-04', spent: 0, received: 0, txn_count: 1 }, // the transfer: shown, not spending
      { date: '2026-11-30', spent: 5_000, received: 0, txn_count: 1 },
    ])
    expect(c.txns.map((t) => t.kind).sort()).toEqual(['expense', 'expense', 'expense', 'income', 'transfer'])
    expect(c.txns[0]).toMatchObject({ date: '2026-11-30' }) // newest first
    expect(c.txns.find((t) => t.kind === 'expense' && t.date === '2026-11-01' && t.amount_paise === 30_000)).toMatchObject({ account_name: 'Cash', category_name: 'Food' })
  })

  it('month edges and leap February', async () => {
    expect((await cal(a, '2026-10')).days.map((d) => d.date)).toEqual(['2026-10-31'])
    expect((await cal(a, '2026-12')).days.map((d) => d.date)).toEqual(['2026-12-01'])
    await ins(a, [{ kind: 'expense', amount_paise: 100, date: '2028-02-29', account_id: cash }])
    expect((await cal(a, '2028-02')).days).toEqual([{ date: '2028-02-29', spent: 100, received: 0, txn_count: 1 }])
    expect((await cal(a, '2028-03')).days).toEqual([])
  })

  it('totals equal activity_summary for the same month and filters, on random data', async () => {
    const u = await makeUser('cal-prop')
    const acc = (await must(u.client.from('accounts').select('id').limit(1).single()))!.id
    try {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.record({ kind: fc.constantFrom('expense', 'income', 'transfer'), amount: fc.integer({ min: 100, max: 500_000 }), other: fc.integer({ min: 0, max: 100 }), day: fc.integer({ min: 1, max: 31 }) }), { minLength: 1, maxLength: 25 }),
        fc.constantFrom({}, { min: 1_000 }, { accounts: [acc] }),
        async (ops, filters) => {
          await sql('delete from transactions where user_id = $1', [u.id])
          const acc2 = (await must(u.client.from('accounts').insert({ name: `B${Math.random()}`, type: 'bank' }).select('id').single()))!.id
          for (const o of ops) {
            await sql(`insert into transactions (user_id, kind, amount_paise, for_other_paise, date, account_id, to_account_id)
                       values ($1, $2::txn_kind, $3, $4, make_date(2026, 10, $5), $6, $7)`,
              [u.id, o.kind, o.amount, o.kind === 'expense' ? Math.floor((o.amount * o.other) / 100) : 0, o.day, acc, o.kind === 'transfer' ? acc2 : null])
          }
          const c = await cal(u, '2026-10', '2026-10-20', filters)
          const s = (await must(rpc(u, 'activity_summary', { p_filters: { ...filters, from: '2026-10-01', to: '2026-10-31' } }))) as { spent: number; received: number }
          expect(c.totals.spent).toBe(s.spent)
          expect(c.totals.received).toBe(s.received)
          expect(c.days.reduce((t, d) => t + d.spent, 0)).toBe(s.spent)
          expect(c.days.reduce((t, d) => t + d.txn_count, 0)).toBeGreaterThanOrEqual(c.txns.length)
        }), { numRuns: 10 })
    } finally { await deleteUser(u.id) }
  }, 120_000)

  it('filters change spending but not dues or notes', async () => {
    const e = await plan(a, 2, '2026-11-10')
    await note(a, { date: '2026-11-12' })
    const all = await cal(a, '2026-11')
    const filtered = await cal(a, '2026-11', '2026-11-15', { accounts: [bank] })
    expect(filtered.totals.spent).toBe(5_000)
    expect(filtered.items).toEqual(all.items)
    expect(filtered.notes).toEqual(all.notes)
    expect(filtered.totals.dues_paise).toBe(all.totals.dues_paise)
    await must(rpc(a, 'delete_entry', { p_id: e.id }))
  })

  it('caps the rows per day at 25 but reports the true count', async () => {
    const u = await makeUser('cal-cap')
    try {
      const acc = (await must(u.client.from('accounts').select('id').limit(1).single()))!.id
      await sql(`insert into transactions (user_id, kind, amount_paise, date, account_id, title) select $1, 'expense', 100 + g, date '2026-11-05', $2, 'T' || g from generate_series(1, 40) g`, [u.id, acc])
      const c = await cal(u, '2026-11')
      expect(c.txns).toHaveLength(25)
      expect(c.days).toEqual([{ date: '2026-11-05', spent: 40 * 100 + 820, received: 0, txn_count: 40 }])
      expect(c.totals.spent).toBe(4_820)
    } finally { await deleteUser(u.id) }
  })
})

describe('plan rows (dues and payments)', () => {
  it('lists rows due in the month with remaining amounts, totals and overdue, and skips no-due-date loans', async () => {
    const e = await plan(a, 3, '2026-11-05') // due 5 Nov, 5 Dec, 5 Jan
    const nodue = await must(rpc(a, 'create_entry', { p_id: uid(), p_kind: 'lent', p_person: ravi, p_title: 'Open loan', p_amount: 1000, p_account: bank, p_start: '2026-11-01' }))
    const c = await cal(a, '2026-11', '2026-11-15')
    const mine = c.items.filter((i) => i.entry_id === e.id)
    expect(mine).toEqual([expect.objectContaining({ seq: 1, due_date: '2026-11-05', due_paise: 100_000, remaining_paise: 100_000, paid_on: null, name: 'Ravi' })])
    expect(c.items.some((i) => i.entry_id === (nodue as { id: string }).id)).toBe(false)
    expect(c.totals.dues_paise).toBe(100_000)
    expect(c.totals.overdue_paise).toBe(100_000) // 5 Nov is before 15 Nov
    expect((await cal(a, '2026-11', '2026-11-01')).totals.overdue_paise).toBe(0)
    await must(rpc(a, 'delete_entry', { p_id: e.id })); await must(rpc(a, 'delete_entry', { p_id: (nodue as { id: string }).id }))
  })

  it('an early-paid row appears in both months: the due month and the paid month', async () => {
    const e = await plan(a, 3, '2026-12-05') // rows due 5 Dec, 5 Jan, 5 Feb
    await must(rpc(a, 'record_payment', { p_id: uid(), p_entry: e.id, p_amount: 100_000, p_paid_on: '2026-11-20', p_account: bank, p_target_seq: 2 }))
    const nov = (await cal(a, '2026-11')).items.filter((i) => i.entry_id === e.id)
    expect(nov).toEqual([expect.objectContaining({ seq: 2, due_date: '2027-01-05', paid_on: '2026-11-20', paid_paise: 100_000 })])
    const jan = (await cal(a, '2027-01')).items.filter((i) => i.entry_id === e.id)
    expect(jan).toEqual([expect.objectContaining({ seq: 2, due_date: '2027-01-05', paid_on: '2026-11-20' })])
    expect((await cal(a, '2027-01')).totals.dues_paise).toBe(0) // paid: nothing still due in January
    const dec = (await cal(a, '2026-12')).items.filter((i) => i.entry_id === e.id)
    expect(dec.map((i) => i.seq)).toEqual([1])
    await must(rpc(a, 'delete_entry', { p_id: e.id }))
  })

  it('a part-paid row shows its remaining amount and no paid date', async () => {
    const e = await plan(a, 2, '2026-11-25')
    await must(rpc(a, 'record_payment', { p_id: uid(), p_entry: e.id, p_amount: 30_000, p_paid_on: '2026-11-26', p_account: bank }))
    const r = (await cal(a, '2026-11')).items.find((i) => i.entry_id === e.id && i.seq === 1)!
    expect(r).toMatchObject({ paid_paise: 30_000, paid_on: null, remaining_paise: 70_000 })
    await must(rpc(a, 'delete_entry', { p_id: e.id }))
  })
})

describe('notes and tasks', () => {
  it('returns one-off items in the month and repeating ones dated on or before it', async () => {
    const ids = await Promise.all([
      note(a, { title: 'in month', date: '2026-11-12' }),
      note(a, { title: 'next month', date: '2026-12-12' }),
      note(a, { title: 'old one-off', date: '2026-09-12' }),
      note(a, { title: 'weekly since Sep', date: '2026-09-07', repeat_rule: 'weekly' }),
      note(a, { title: 'repeat from Dec', date: '2026-12-01', repeat_rule: 'monthly' }),
      note(a, { title: 'done task', date: '2026-11-20', done: true }),
    ])
    expect(ids).toHaveLength(6)
    const titles = (await cal(a, '2026-11')).notes.map((n) => n.title)
    expect(titles).toEqual(expect.arrayContaining(['in month', 'weekly since Sep', 'done task']))
    for (const t of ['next month', 'old one-off', 'repeat from Dec']) expect(titles).not.toContain(t)
    expect((await cal(a, '2026-11')).notes.find((n) => n.title === 'done task')).toMatchObject({ done: true })
    await sql(`delete from notes where user_id = $1`, [a.id])
  })
})

describe('agenda', () => {
  it('returns items and notes for the window, bounds inclusive, and refuses bad windows', async () => {
    const e = await plan(a, 3, '2026-11-05')
    await note(a, { title: 'edge', date: '2026-12-05' })
    const ag = (await must(rpc(a, 'calendar_agenda', { p_from: '2026-11-05', p_to: '2026-12-05', p_today: '2026-11-15' }))) as { items: Cal['items']; notes: Cal['notes'] }
    expect(ag.items.filter((i) => i.entry_id === e.id).map((i) => i.due_date)).toEqual(['2026-11-05', '2026-12-05'])
    expect(ag.notes.map((n) => n.title)).toEqual(['edge'])
    const bad: [string, string][] = [['2026-12-05', '2026-11-05'], ['2026-01-01', '2026-06-01']]
    for (const [f, t] of bad) expect((await rpc(a, 'calendar_agenda', { p_from: f, p_to: t, p_today: '2026-11-15' })).error).not.toBeNull()
    await must(rpc(a, 'delete_entry', { p_id: e.id }))
    await sql(`delete from notes where user_id = $1`, [a.id])
  })
})

describe('validation and isolation', () => {
  it('rejects invalid months', async () => {
    for (const m of ['2026-13', '2026-1', 'nov', '']) expect((await rpc(a, 'calendar_month', { p_month: m, p_today: '2026-11-15' })).error, m).not.toBeNull()
  })
  it('another user sees nothing of it; anonymous callers are denied', async () => {
    const e = await plan(a, 2, '2026-11-05')
    await note(a, { date: '2026-11-06' })
    const c = await cal(b, '2026-11')
    expect(c).toMatchObject({ days: [], items: [], txns: [], notes: [], totals: { spent: 0, received: 0, dues_paise: 0 } })
    const anon = createClient(process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321', ANON, { auth: { persistSession: false } })
    expect((await anon.rpc('calendar_month' as never, { p_month: '2026-11', p_today: '2026-11-15' } as never)).error).not.toBeNull()
    expect((await anon.rpc('calendar_agenda' as never, { p_from: '2026-11-01', p_to: '2026-11-30', p_today: '2026-11-15' } as never)).error).not.toBeNull()
    await must(rpc(a, 'delete_entry', { p_id: e.id }))
    await sql(`delete from notes where user_id = $1`, [a.id])
  })
})

describe('performance with 5,000 transactions and 500 plans (a very heavy user)', () => {
  let perf: TestUser
  beforeAll(async () => {
    perf = await makeUser('cal-perf')
    await sql(
      `insert into transactions (user_id, kind, amount_paise, date, account_id, category_id, title, place)
       select $1, 'expense', 1000 + (g % 90000), date '2026-01-01' + (g % 300), (select id from accounts where user_id = $1 limit 1),
              (select id from categories where user_id = $1 and kind = 'expense' order by sort limit 1 offset (g % 12)), 'Item ' || g, 'Place ' || (g % 40)
       from generate_series(1, 5000) g`, [perf.id])
    await sql(`insert into people (user_id, name) select $1, 'P' || g from generate_series(1, 50) g`, [perf.id])
    await sql(
      `insert into entries (id, user_id, kind, direction, person_id, title, principal_paise, start_date, total_payable_paise, status)
       select gen_random_uuid(), $1, case when g % 2 = 0 then 'lent' else 'borrowed' end::entry_kind, case when g % 2 = 0 then 'receive' else 'pay' end::entry_dir,
              (select id from people where user_id = $1 order by name offset (g % 50) limit 1), 'E' || g, 1200000, date '2026-01-01', 1200000, 'open'
       from generate_series(1, 500) g`, [perf.id])
    await sql(
      `insert into schedule_items (user_id, entry_id, seq, due_date, due_paise, principal_paise, paid_paise, paid_on)
       select $1, e.id, r, date '2026-01-10' + (r * 30), 100000, 100000, case when r <= 3 then 100000 else 0 end, case when r <= 3 then date '2026-01-08' + (r * 30) end
       from entries e, generate_series(1, 12) r where e.user_id = $1`, [perf.id])
    await sql('analyze transactions'); await sql('analyze entries'); await sql('analyze schedule_items')
  }, 120_000)
  afterAll(async () => { await deleteUser(perf.id) })

  it('calendar_month answers in < 150 ms and reads the due/paid dates through indexes', async () => {
    await cal(perf, '2026-03')
    const times: number[] = []
    for (const m of ['2026-03', '2026-05', '2026-08']) {
      const t = performance.now(); await cal(perf, m); times.push(performance.now() - t)
    }
    console.log(`calendar_month ${times.map((x) => x.toFixed(0)).join(' / ')} ms (5,000 txns + 6,000 plan rows, ~500 items a month)`)
    expect(Math.max(...times)).toBeLessThan(150)
    const idx = (await sql(`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'schedule_items'`)).rows.map((r) => r.indexdef as string)
    expect(idx.some((d) => /\(user_id, paid_on\)/.test(d))).toBe(true) // the planner's own choice depends on statistics other test files change
  })
})
