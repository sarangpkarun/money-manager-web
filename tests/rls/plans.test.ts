import { readFileSync } from 'node:fs'
import fc from 'fast-check'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { allocatePayment } from '../../src/lib/allocate'
import { addExtraPayment, changeAmount, skipPeriod } from '../../src/lib/respread'
import { buildSchedule, type PlanInput, type ScheduleRow } from '../../src/lib/schedule'
import { ANON, deleteUser, makeUser, sql, type TestUser } from './helpers'

let a: TestUser, b: TestUser
let bank: string, shopping: string, ravi: string

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: RPC results are checked field by field
const rpc = (u: TestUser, fn: string, args: Record<string, unknown>) => u.client.rpc(fn as never, args as never) as unknown as PromiseLike<{ data: any; error: { message: string } | null }>
const uid = () => crypto.randomUUID()

const payload = (rows: ScheduleRow[]) =>
  rows.map(({ seq, due_date, due_paise, principal_paise, interest_paise }) => ({ seq, due_date, due_paise, principal_paise, interest_paise }))
const baseOf = (rows: ScheduleRow[]) => rows.map((r) => ({ ...r }))

interface PlanOpts {
  kind?: string; person?: string | null; party?: string | null; title?: string; principal?: number; down?: number; account?: string
  category?: string | null; start?: string; interest?: string; rate?: number; noCost?: boolean; rows?: unknown; id?: string
}
const create = (u: TestUser, rows: ScheduleRow[] | unknown, o: PlanOpts = {}) =>
  rpc(u, 'create_entry_with_plan', {
    p_id: o.id ?? uid(), p_kind: o.kind ?? 'borrowed', p_person: o.person === undefined ? ravi : o.person, p_party: o.party ?? null,
    p_title: o.title ?? 'Plan', p_principal: o.principal ?? 5_000_000, p_down: o.down ?? 0, p_account: o.account ?? bank, p_category: o.category ?? null,
    p_start: o.start ?? firstDue(rows) ?? '2026-12-01', p_interest: o.interest ?? 'none', p_rate_bps: o.rate ?? 0, p_no_cost: o.noCost ?? false,
    p_rows: Array.isArray(rows) && rows.length && 'paid_paise' in (rows[0] as object) ? payload(rows as ScheduleRow[]) : rows,
  })

const firstDue = (rows: unknown): string | undefined => (Array.isArray(rows) && rows.length ? ((rows[0] as { due_date?: string }).due_date) : undefined)
const pay = (entry: string, amount: number, on: string, o: Record<string, unknown> = {}) =>
  rpc(a, 'record_payment', { p_id: uid(), p_entry: entry, p_amount: amount, p_paid_on: on, p_account: bank, ...o })
const balance = async (id: string) => Number((await must(a.client.from('account_balances').select('balance_paise').eq('account_id', id).single()))!.balance_paise)
const dbRows = async (entry: string): Promise<ScheduleRow[]> =>
  (await sql(`select seq, due_date::text as due_date, due_paise, principal_paise, interest_paise, paid_paise, paid_on::text as paid_on from schedule_items where entry_id = $1 order by seq`, [entry]))
    .rows.map((r) => ({ ...r, due_paise: Number(r.due_paise), principal_paise: Number(r.principal_paise), interest_paise: Number(r.interest_paise), paid_paise: Number(r.paid_paise) }))
const count = async (table: string, entry: string) => (await sql(`select count(*)::int n from ${table} where entry_id = $1`, [entry])).rows[0].n as number
const monthly = (principal: number, count: number, first: string, extra: Partial<PlanInput> = {}) =>
  buildSchedule({ mode: 'equal', principal, count, firstDate: first, ...extra } as PlanInput).rows
const remove = (id: string) => rpc(a, 'delete_entry', { p_id: id })

beforeAll(async () => {
  a = await makeUser('plan-a')
  b = await makeUser('plan-b')
  bank = (await must(a.client.from('accounts').insert({ name: 'Bank', type: 'bank', opening_balance_paise: 10_000_000 }).select('id').single()))!.id
  shopping = (await must(a.client.from('categories').select('id').eq('name', 'Shopping').single()))!.id
  ravi = (await must(a.client.from('people').insert({ name: 'Ravi' }).select('id').single()))!.id
}, 30_000)

afterAll(async () => { await Promise.all([a, b].map((u) => u && deleteUser(u.id))) })

describe('golden schedules: the server accepts and round-trips exactly what the TypeScript builds', () => {
  const golden = JSON.parse(readFileSync('tests/fixtures/schedule-cases.json', 'utf8')) as { cases: { name: string; input: PlanInput & Record<string, unknown>; expected: { total_payable_paise: number; rows: { seq: number; due_date: string; due_paise: number; principal_paise: number; interest_paise: number }[] } }[] }
  for (const c of golden.cases) {
    it(c.name, async () => {
      const i = c.input as Record<string, unknown>
      const interest = i.mode === 'reducing' ? 'reducing' : ((i.interest as string | undefined) ?? 'none')
      const noCost = !!i.noCost
      const first = c.expected.rows[0]!.due_date
      const entry = await must(create(a, c.expected.rows, {
        principal: i.principal as number, start: first, interest: noCost ? (i.mode === 'reducing' ? 'reducing' : 'none') : interest,
        rate: (i.rateBps as number | undefined) ?? 0, noCost,
        ...(noCost ? { kind: 'emi_purchase', person: null, party: 'Store' } : {}), // no-cost is a purchase feature
      }))
      expect(entry.total_payable_paise).toBe(c.expected.total_payable_paise)
      const stored = await dbRows(entry.id)
      expect(stored.map(({ seq, due_date, due_paise, principal_paise, interest_paise }) => ({ seq, due_date, due_paise, principal_paise, interest_paise }))).toEqual(c.expected.rows)
      await must(remove(entry.id))
    })
  }
})

describe('create_entry_with_plan validation', () => {
  const ok = () => monthly(5_000_000, 10, '2026-12-05')
  it('rejects bad payloads and changes nothing', async () => {
    const rows = ok()
    const bad: [string, unknown, PlanOpts, RegExp][] = [
      ['sum mismatch', payload(rows), { principal: 4_999_999 }, /do not add up/],
      ['no rows', [], {}, /at least one row/],
      ['not an array', { a: 1 }, {}, /at least one row/],
      ['seq not 1..n', payload(rows).map((r, i) => ({ ...r, seq: i + 2 })), {}, /row numbers/],
      ['dates not increasing', payload(rows).map((r, i) => (i === 3 ? { ...r, due_date: rows[1]!.due_date } : r)), {}, /dates must increase/],
      ['date before start', payload(rows), { start: '2027-06-01' }, /before the start/],
      ['zero row', payload(rows).map((r, i) => (i === 0 ? { ...r, due_paise: 0, principal_paise: 0 } : r)), {}, /invalid amounts/],
      ['principal + interest <> due', payload(rows).map((r, i) => (i === 0 ? { ...r, interest_paise: 5 } : r)), {}, /invalid amounts/],
      ['interest on an interest-free plan', payload(rows).map((r, i) => (i === 0 ? { ...r, due_paise: r.due_paise + 5, interest_paise: 5 } : r)), {}, /no interest/],
      ['flat mismatch', payload(rows), { interest: 'flat', rate: 1000 }, /flat interest does not match/],
      ['interest needs a rate', payload(rows), { interest: 'simple', rate: 0 }, /rate/],
      ['unsupported kind', payload(rows), { kind: 'on_behalf' }, /unsupported/],
      ['lent needs a person', payload(rows), { kind: 'lent', person: null }, /person not found/],
      ['EMI needs a store or person', payload(rows), { kind: 'emi_purchase', person: null }, /store or person/],
      ['down payment is for purchases', payload(rows), { down: 100 }, /purchases only/],
      ['no-cost is for purchases', payload(rows), { noCost: true }, /purchases only/],
      ['foreign account', payload(rows), { account: (await must(b.client.from('accounts').select('id').limit(1).single()))!.id }, /account not found/],
      ['foreign person', payload(rows), { person: (await must(b.client.from('people').insert({ name: 'X' }).select('id').single()))!.id }, /person not found/],
      ['foreign category', payload(rows), { kind: 'instalment', person: null, party: 'Shop', category: (await must(b.client.from('categories').select('id').limit(1).single()))!.id }, /category not found/],
      ['blank title', payload(rows), { title: '  ' }, /title/],
    ]
    for (const [name, r, o, re] of bad) {
      const id = uid()
      expect((await create(a, r, { ...o, id })).error?.message, name).toMatch(re)
      expect(await count('schedule_items', id), name).toBe(0)
    }
  })

  it('is idempotent on its id', async () => {
    const id = uid()
    const first = await must(create(a, ok(), { id }))
    const again = await must(create(a, ok(), { id }))
    expect(again.id).toBe(first.id)
    expect(await count('schedule_items', id)).toBe(10)
    expect(await count('transactions', id)).toBe(1)
    await must(remove(id))
  })
})

describe('scenario B: borrow ₹50,000 in 10 monthly instalments, #2 paid early', () => {
  let id: string
  const rows = monthly(5_000_000, 10, '2026-12-05')
  it('creates 10 rows and credits the account', async () => {
    const before = await balance(bank)
    const e = await must(create(a, rows, { title: 'From Ravi', start: '2026-12-01' }))
    id = e.id
    expect(e).toMatchObject({ kind: 'borrowed', direction: 'pay', total_payable_paise: 5_000_000, due_date: rows[9]!.due_date })
    expect(await balance(bank)).toBe(before + 5_000_000)
    expect((await dbRows(id)).map((r) => r.due_paise)).toEqual(Array(10).fill(500_000))
  })
  it('paying #2 first sets its paid_on and leaves #1 unpaid', async () => {
    await must(pay(id, 500_000, '2026-12-20', { p_target_seq: 2 }))
    const r = await dbRows(id)
    expect(r[1]).toMatchObject({ paid_paise: 500_000, paid_on: '2026-12-20' })
    expect(r[0]).toMatchObject({ paid_paise: 0, paid_on: null })
  })
  it('Due soon lists #1 but not #2; overview shows 1 of 10 paid and the next unpaid due date', async () => {
    const d = await must(rpc(a, 'dashboard_summary', { p_month: '2026-12', p_today: '2026-12-02', p_filters: {} }))
    const items = d.due_soon.items.filter((i: { entry_id: string }) => i.entry_id === id)
    expect(items.map((i: { seq: number }) => i.seq)).toEqual([1])
    const ov = await must(rpc(a, 'money_overview', { p_today: '2026-12-02' }))
    const row = ov.entries.find((x: { id: string }) => x.id === id)
    expect(row).toMatchObject({ rows_total: 10, rows_paid: 1, paid_paise: 500_000, outstanding_paise: 4_500_000, total_paise: 5_000_000, due_date: '2026-12-05', person_name: 'Ravi' })
  })
  it('a payment that spans rows pays #1 then #3 (earliest unpaid)', async () => {
    await must(pay(id, 700_000, '2026-12-05'))
    const r = await dbRows(id)
    expect(r.map((x) => x.paid_paise).slice(0, 4)).toEqual([500_000, 500_000, 200_000, 0])
    expect(r[0]!.paid_on).toBe('2026-12-05')
    expect(r[2]!.paid_on).toBeNull()
    await must(remove(id))
  })
})

describe('scenario C: ₹60,000 EMI, ₹6,000 down, 9 months, no-cost', () => {
  const rows = buildSchedule({ mode: 'reducing', principal: 5_400_000, count: 9, firstDate: '2026-12-10', rateBps: 1500, noCost: true }).rows
  let id: string
  it('creates 9 rows; the down payment is a spend on the account', async () => {
    const before = await balance(bank)
    const e = await must(create(a, rows, { kind: 'emi_purchase', person: null, party: 'Croma', title: 'Phone', principal: 5_400_000, down: 600_000, category: shopping, interest: 'reducing', rate: 1500, noCost: true, start: '2026-12-01' }))
    id = e.id
    expect(e).toMatchObject({ kind: 'emi_purchase', direction: 'pay', party_name: 'Croma', no_cost: true, down_payment_paise: 600_000, total_payable_paise: 5_400_000, category_id: shopping })
    expect(rows).toHaveLength(9)
    expect(rows.reduce((s, r) => s + r.due_paise, 0)).toBe(5_400_000)
    expect(await balance(bank)).toBe(before - 600_000)
    const t = (await sql(`select kind, amount_paise, category_id from transactions where entry_id = $1`, [id])).rows
    expect(t).toEqual([{ kind: 'expense', amount_paise: '600000', category_id: shopping }])
  })
  it('shows under I owe with the store as the name; instalments are expenses in the category', async () => {
    const ov = await must(rpc(a, 'money_overview', { p_today: '2026-12-02' }))
    expect(ov.entries.find((x: { id: string }) => x.id === id)).toMatchObject({ person_name: 'Croma', kind: 'emi_purchase', outstanding_paise: 5_400_000, rows_total: 9 })
    await must(pay(id, rows[0]!.due_paise, '2026-12-10'))
    const t = (await sql(`select kind, category_id from transactions where entry_id = $1 order by date, created_at`, [id])).rows
    expect(t.map((x) => x.kind)).toEqual(['expense', 'expense'])
    expect(t[1]!.category_id).toBe(shopping)
    const s = (await must(a.client.rpc('activity_summary', { p_filters: { categories: [shopping] } } as never))) as unknown as { spent: number }
    expect(s.spent).toBe(600_000 + rows[0]!.due_paise)
  })
  it('settling every row closes the entry', async () => {
    const left = (await dbRows(id)).reduce((s, r) => s + r.due_paise - r.paid_paise, 0)
    const e = await must(pay(id, left, '2027-01-01'))
    expect(e.status).toBe('settled')
    await must(remove(id))
  })
})

describe('scenario D: lent ₹2,000 weekly 4 × ₹500, row 3 paid first', () => {
  it('row 3 gets paid_on; two days late', async () => {
    const rows = buildSchedule({ mode: 'equal', principal: 200_000, count: 4, firstDate: '2026-03-01', period: 'weekly' }).rows
    const e = await must(create(a, rows, { kind: 'lent', title: 'Lent weekly', principal: 200_000, start: '2026-03-01' }))
    await must(pay(e.id, 50_000, '2026-03-17', { p_account: bank, p_target_seq: 3 }))
    const r = await dbRows(e.id)
    expect(r[2]).toMatchObject({ due_date: '2026-03-15', paid_paise: 50_000, paid_on: '2026-03-17' })
    expect(r.filter((x) => x.paid_on).length).toBe(1)
    await must(remove(e.id))
  })
})

describe('allocation matches the TypeScript allocatePayment', () => {
  it('for random payment sequences (target row, spill, exact settle, overpay refused)', async () => {
    const rows = monthly(600_000, 6, '2026-01-10')
    await fc.assert(
      fc.asyncProperty(fc.array(fc.record({ amount: fc.integer({ min: 1, max: 250_000 }), target: fc.option(fc.integer({ min: 1, max: 6 }), { nil: undefined }) }), { minLength: 1, maxLength: 6 }), async (ops) => {
        const e = await must(create(a, rows, { principal: 600_000, start: '2026-01-01' }))
        let model = rows.map((r) => ({ ...r }))
        for (const op of ops) {
          let expectErr = false
          let next = model
          try { next = allocatePayment(model, op.amount, '2026-02-01', op.target).rows } catch { expectErr = true }
          const r = await pay(e.id, op.amount, '2026-02-01', { p_target_seq: op.target ?? null })
          if (expectErr) expect(r.error).not.toBeNull()
          else {
            expect(r.error).toBeNull()
            model = next
          }
        }
        expect((await dbRows(e.id)).map((r) => r.paid_paise)).toEqual(model.map((r) => r.paid_paise))
        await must(remove(e.id))
      }),
      { numRuns: 12 },
    )
  }, 120_000)

  it('overpayment is refused with the amount left; a paid row cannot be targeted', async () => {
    const rows = monthly(300_000, 3, '2026-01-10')
    const e = await must(create(a, rows, { principal: 300_000 }))
    expect((await pay(e.id, 300_001, '2026-01-11')).error?.message).toMatch(/exceeds the amount left \(300000/)
    await must(pay(e.id, 100_000, '2026-01-11', { p_target_seq: 1 }))
    expect((await pay(e.id, 10, '2026-01-12', { p_target_seq: 1 })).error?.message).toMatch(/already paid/)
    expect((await pay(e.id, 10, '2026-01-12', { p_target_seq: 9 })).error?.message).toMatch(/not found/)
    await must(remove(e.id))
  })
})

describe('deleting payments', () => {
  it('a payment that spans rows is reversed as a whole (rows, transaction, balance, status)', async () => {
    const rows = monthly(300_000, 3, '2026-01-10')
    const e = await must(create(a, rows, { principal: 300_000 }))
    const before = await balance(bank)
    const pid = uid()
    await must(pay(e.id, 250_000, '2026-01-11', { p_id: pid }))
    expect(await count('payments', e.id)).toBe(3)
    expect(await balance(bank)).toBe(before - 250_000)
    const r = await must(rpc(a, 'delete_payment', { p_id: pid }))
    expect(r.status).toBe('open')
    expect((await dbRows(e.id)).map((x) => [x.paid_paise, x.paid_on])).toEqual([[0, null], [0, null], [0, null]])
    expect(await count('payments', e.id)).toBe(0)
    expect(await balance(bank)).toBe(before)
    await must(remove(e.id))
  })
  it('re-recording with the same id after Undo behaves identically', async () => {
    const rows = monthly(200_000, 2, '2026-01-10')
    const e = await must(create(a, rows, { principal: 200_000 }))
    const pid = uid()
    await must(pay(e.id, 150_000, '2026-01-11', { p_id: pid }))
    await must(rpc(a, 'delete_payment', { p_id: pid }))
    await must(pay(e.id, 150_000, '2026-01-11', { p_id: pid }))
    expect((await dbRows(e.id)).map((x) => x.paid_paise)).toEqual([100_000, 50_000])
    await must(remove(e.id))
  })
  it('a settled entry reopens when one of its payments is deleted', async () => {
    const e = await must(create(a, monthly(100_000, 2, '2026-01-10'), { principal: 100_000 }))
    const pid = uid()
    expect((await must(pay(e.id, 100_000, '2026-01-12', { p_id: pid }))).status).toBe('settled')
    expect((await must(rpc(a, 'delete_payment', { p_id: pid }))).status).toBe('open')
    await must(remove(e.id))
  })
})

describe('plan edits (client computes, server validates)', () => {
  const fresh = async (n = 4) => {
    const rows = monthly(400_000, n, '2026-01-31')
    const e = await must(create(a, rows, { principal: 400_000, start: '2026-01-01' }))
    return { id: e.id as string, rows }
  }

  it('skip month moves the chosen and later unpaid rows', async () => {
    const { id, rows } = await fresh()
    await must(pay(id, 100_000, '2026-01-31', { p_target_seq: 1 }))
    const current = await dbRows(id)
    const next = skipPeriod(current, 2)
    await must(rpc(a, 'plan_skip_month', { p_entry: id, p_base: baseOf(current), p_rows: next }))
    const after = await dbRows(id)
    expect(after.map((r) => r.due_date)).toEqual(next.map((r) => r.due_date))
    expect(after[0]!.due_date).toBe(rows[0]!.due_date) // paid row stays
    expect(after[1]!.due_date).toBe('2026-03-31') // 28 Feb → 31 Mar via the month-end anchor
    expect((await sql(`select due_date::text d from entries where id = $1`, [id])).rows[0].d).toBe(after[3]!.due_date)
    await must(remove(id))
  })

  it('change amount re-spreads the difference; the total is unchanged', async () => {
    const { id } = await fresh()
    const current = await dbRows(id)
    const next = changeAmount(current, 1, 150_000)
    await must(rpc(a, 'plan_change_amount', { p_entry: id, p_base: baseOf(current), p_rows: next }))
    const after = await dbRows(id)
    expect(after.map((r) => r.due_paise)).toEqual(next.map((r) => r.due_paise))
    expect(after.reduce((s, r) => s + r.due_paise, 0)).toBe(400_000)
    await must(remove(id))
  })

  it('extra payment shortens the plan from the last row, records cash only, and cannot be undone', async () => {
    const { id } = await fresh()
    const before = await balance(bank)
    const current = await dbRows(id)
    const res = addExtraPayment(current, 250_000, '2026-02-15')
    const pid = uid()
    const e = await must(rpc(a, 'plan_extra_payment', { p_id: pid, p_entry: id, p_amount: 250_000, p_paid_on: '2026-02-15', p_account: bank, p_mode: null, p_note: null, p_base: baseOf(current), p_rows: res.rows }))
    expect(e.status).toBe('open')
    expect(await balance(bank)).toBe(before - 250_000)
    const after = await dbRows(id)
    expect(after.map((r) => r.due_paise)).toEqual(res.rows.map((r) => r.due_paise))
    expect(after).toHaveLength(2)
    expect((await sql(`select schedule_item_id from payments where id = $1`, [pid])).rows[0].schedule_item_id).toBeNull()
    const ov = await must(rpc(a, 'money_overview', { p_today: '2026-02-20' }))
    expect(ov.entries.find((x: { id: string }) => x.id === id)).toMatchObject({ paid_paise: 250_000, outstanding_paise: 150_000, total_paise: 400_000, rows_total: 2 })
    expect((await rpc(a, 'delete_payment', { p_id: pid })).error?.message).toMatch(/extra payment cannot be deleted/)
    expect((await rpc(a, 'mark_unpaid', { p_entry: id })).error?.message).toMatch(/shortened/)
    await must(remove(id))
  })

  it('an extra payment that clears everything settles the entry', async () => {
    const { id } = await fresh(2)
    const current = await dbRows(id)
    const res = addExtraPayment(current, 400_000, '2026-02-01')
    const e = await must(rpc(a, 'plan_extra_payment', { p_id: uid(), p_entry: id, p_amount: 400_000, p_paid_on: '2026-02-01', p_account: bank, p_mode: null, p_note: null, p_base: baseOf(current), p_rows: res.rows }))
    expect(e).toMatchObject({ status: 'settled', settled_on: '2026-02-01' })
    await must(remove(id))
  })

  it('a stale base is refused (the plan changed under the screen)', async () => {
    const { id } = await fresh()
    const stale = await dbRows(id)
    await must(pay(id, 100_000, '2026-01-31', { p_target_seq: 1 }))
    const r = await rpc(a, 'plan_skip_month', { p_entry: id, p_base: baseOf(stale), p_rows: skipPeriod(stale, 2) })
    expect(r.error?.message).toMatch(/changed, please reload/)
    await must(remove(id))
  })

  it('hostile rows are rejected and nothing changes', async () => {
    const { id } = await fresh()
    const current = await dbRows(id)
    const base = baseOf(current)
    const tweak = (f: (r: ScheduleRow, i: number) => ScheduleRow) => current.map(f)
    const cases: [string, string, unknown][] = [
      ['plan_skip_month', 'amount change in a skip', tweak((r, i) => (i === 1 ? { ...r, due_paise: r.due_paise + 1, principal_paise: r.principal_paise + 1 } : r))],
      ['plan_skip_month', 'paid amounts changed', tweak((r, i) => (i === 0 ? { ...r, paid_paise: 5 } : r))],
      ['plan_skip_month', 'unknown row', [...current, { ...current[0]!, seq: 9 }]],
      ['plan_skip_month', 'row removed in a skip', current.slice(0, 3)],
      ['plan_change_amount', 'total changed', tweak((r, i) => (i === 0 ? { ...r, due_paise: r.due_paise + 7, principal_paise: r.principal_paise + 7 } : r))],
      ['plan_change_amount', 'date changed', tweak((r, i) => (i === 0 ? { ...r, due_date: '2026-01-01' } : r))],
      ['plan_change_amount', 'row below paid', tweak((r, i) => (i === 0 ? { ...r, due_paise: 0, principal_paise: 0 } : r))],
      ['plan_change_amount', 'inconsistent split', tweak((r, i) => (i === 0 ? { ...r, interest_paise: 3 } : r))],
    ]
    for (const [fn, name, rows] of cases) {
      const { error } = await rpc(a, fn, { p_entry: id, p_base: base, p_rows: rows })
      expect(error, name).not.toBeNull()
    }
    expect(await dbRows(id)).toEqual(current)
    await must(remove(id))
  })
})

describe('atomicity and concurrency', () => {
  it('a failure while recording a multi-part payment leaves nothing behind', async () => {
    const e = await must(create(a, monthly(300_000, 3, '2026-01-10'), { principal: 300_000 }))
    await sql(`create function fail_second_part() returns trigger language plpgsql as $$ begin if new.amount_paise = 50000 then raise exception 'forced failure'; end if; return new; end $$`)
    await sql(`create trigger t_fail before insert on payments for each row execute function fail_second_part()`)
    try {
      expect((await pay(e.id, 150_000, '2026-01-11')).error?.message).toMatch(/forced failure/)
    } finally {
      await sql('drop trigger t_fail on payments'); await sql('drop function fail_second_part()')
    }
    expect(await count('payments', e.id)).toBe(0)
    expect((await dbRows(e.id)).every((r) => r.paid_paise === 0)).toBe(true)
    expect(await count('transactions', e.id)).toBe(1) // only the loan itself
    await must(remove(e.id))
  })

  it('a failure while creating a plan leaves nothing behind', async () => {
    const id = uid()
    await sql(`create function fail_plan_txn() returns trigger language plpgsql as $$ begin if new.title = 'Boom' then raise exception 'forced failure'; end if; return new; end $$`)
    await sql(`create trigger t_fail before insert on transactions for each row execute function fail_plan_txn()`)
    try {
      expect((await create(a, monthly(100_000, 2, '2026-01-10'), { id, principal: 100_000, title: 'Boom' })).error?.message).toMatch(/forced failure/)
    } finally {
      await sql('drop trigger t_fail on transactions'); await sql('drop function fail_plan_txn()')
    }
    expect(await count('schedule_items', id)).toBe(0)
    expect((await sql(`select count(*)::int n from entries where id = $1`, [id])).rows[0].n).toBe(0)
  })

  it('two simultaneous payments cannot overpay a plan', async () => {
    const e = await must(create(a, monthly(100_000, 2, '2026-01-10'), { principal: 100_000 }))
    const res = await Promise.all([pay(e.id, 70_000, '2026-01-11'), pay(e.id, 70_000, '2026-01-11')])
    expect(res.filter((r) => r.error).length).toBe(1)
    expect((await dbRows(e.id)).reduce((s, r) => s + r.paid_paise, 0)).toBe(70_000)
    await must(remove(e.id))
  })
})

describe('reads over many rows', () => {
  it('stats, ageing, people_balances, history and the dashboard cards agree', async () => {
    const e1 = await must(create(a, monthly(300_000, 3, '2026-01-10'), { title: 'Owed plan', principal: 300_000, start: '2026-01-01' })) // borrowed: I owe
    const e2 = await must(create(a, monthly(200_000, 2, '2026-03-10'), { kind: 'lent', title: 'Lent plan', principal: 200_000, start: '2026-03-01' }))
    const today = '2026-03-20'
    const ov = await must(rpc(a, 'money_overview', { p_today: today }))
    const mine = ov.entries.filter((x: { id: string }) => [e1.id, e2.id].includes(x.id))
    expect(mine).toHaveLength(2)
    const owe = mine.find((x: { id: string }) => x.id === e1.id)
    expect(owe).toMatchObject({ overdue_paise: 300_000, due_date: '2026-01-10', outstanding_paise: 300_000 }) // all three rows are late
    const stats = ov.stats
    expect(stats.i_owe).toBeGreaterThanOrEqual(300_000)
    expect(stats.overdue_i_owe).toBeGreaterThanOrEqual(300_000)
    expect(stats.ageing_i_owe.d61_plus).toBeGreaterThanOrEqual(100_000) // row of 10 Jan is 69 days late

    const pb = (await must(a.client.from('people_balances').select('*').eq('person_id', ravi).single()))!
    expect(Number(pb.i_owe_paise)).toBeGreaterThanOrEqual(300_000)
    expect(Number(pb.owed_to_me_paise)).toBeGreaterThanOrEqual(200_000)

    const d = await must(rpc(a, 'dashboard_summary', { p_month: '2026-03', p_today: today, p_filters: {} }))
    expect(d.people).toEqual(stats)
    expect(d.emi_load.outstanding_paise).toBeGreaterThanOrEqual(300_000)
    expect(d.emi_load.months).toHaveLength(12)
    expect(d.emi_load.months[0].month).toBe('2026-03')
    expect(d.emi_load.overdue_paise).toBeGreaterThanOrEqual(200_000) // Jan and Feb rows (before this month)
    expect(d.due_soon.items.length).toBeLessThanOrEqual(5)
    expect(d.due_soon.total_count).toBeGreaterThanOrEqual(4) // 3 late rows of the owed plan + the 10 Mar row of the lent plan

    await must(pay(e1.id, 300_000, today))
    const h = await must(rpc(a, 'money_history', { p_limit: 5 }))
    expect(h[0]).toMatchObject({ id: e1.id, paid_paise: 300_000, total_paise: 300_000, settled_on: today })
    await must(remove(e1.id)); await must(remove(e2.id))
  })

  it('EMI load buckets sit in their due month and the debt-free date is the last due date', async () => {
    const rows = monthly(300_000, 3, '2026-05-10')
    const e = await must(create(a, rows, { principal: 300_000, start: '2026-05-01' }))
    const d = await must(rpc(a, 'dashboard_summary', { p_month: '2026-05', p_today: '2026-05-02', p_filters: {} }))
    const by = Object.fromEntries(d.emi_load.months.map((m: { month: string; due_paise: number }) => [m.month, m.due_paise]))
    expect(by['2026-05']).toBeGreaterThanOrEqual(100_000)
    expect(by['2026-06']).toBeGreaterThanOrEqual(100_000)
    expect(d.emi_load.debt_free_date >= '2026-07-10').toBe(true)
    await must(remove(e.id))
  })
})

describe('isolation', () => {
  it('another user cannot act on, or see, a plan; anonymous callers are denied', async () => {
    const rows = monthly(100_000, 2, '2026-01-10')
    const e = await must(create(a, rows, { principal: 100_000 }))
    const cur = await dbRows(e.id)
    const calls: [string, Record<string, unknown>][] = [
      ['record_payment', { p_id: uid(), p_entry: e.id, p_amount: 1, p_paid_on: '2026-01-11', p_account: bank }],
      ['plan_skip_month', { p_entry: e.id, p_base: baseOf(cur), p_rows: skipPeriod(cur, 1) }],
      ['plan_change_amount', { p_entry: e.id, p_base: baseOf(cur), p_rows: cur }],
    ]
    for (const [fn, args] of calls) expect((await rpc(b, fn, args)).error, fn).not.toBeNull()
    expect((await must(rpc(b, 'money_overview', { p_today: '2026-01-20' }))).entries).toEqual([])
    const anon = createClient(process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321', ANON, { auth: { persistSession: false } })
    expect((await anon.rpc('create_entry_with_plan' as never, {} as never)).error).not.toBeNull()
    await must(remove(e.id))
  })
})

describe('performance with 2,000 plans of up to 12 rows', () => {
  let perf: TestUser
  beforeAll(async () => {
    perf = await makeUser('plan-perf')
    await sql(`insert into people (user_id, name) select $1, 'P' || g from generate_series(1, 50) g`, [perf.id])
    await sql(
      `insert into entries (id, user_id, kind, direction, person_id, title, principal_paise, start_date, total_payable_paise, status)
       select gen_random_uuid(), $1, case when g % 2 = 0 then 'lent' else 'borrowed' end::entry_kind, case when g % 2 = 0 then 'receive' else 'pay' end::entry_dir,
              (select id from people where user_id = $1 order by name offset (g % 50) limit 1), 'E' || g, 1200000, date '2026-01-01', 1200000, 'open'
       from generate_series(1, 2000) g`, [perf.id])
    await sql(
      `insert into schedule_items (user_id, entry_id, seq, due_date, due_paise, principal_paise, paid_paise)
       select $1, e.id, r, date '2026-01-10' + (r * 30), 100000, 100000, case when r <= 3 then 100000 else 0 end
       from entries e, generate_series(1, 12) r where e.user_id = $1`, [perf.id])
    await sql('analyze entries'); await sql('analyze schedule_items')
  }, 90_000)
  afterAll(async () => { await deleteUser(perf.id) })

  it('overview, history and the dashboard answer in < 150 ms', async () => {
    const time = async (fn: () => PromiseLike<unknown>) => { const t = performance.now(); await fn(); return performance.now() - t }
    await rpc(perf, 'money_overview', { p_today: '2026-06-15' })
    const ov = await time(() => rpc(perf, 'money_overview', { p_today: '2026-06-15' }))
    const dash = await time(() => rpc(perf, 'dashboard_summary', { p_month: '2026-06', p_today: '2026-06-15', p_filters: {} }))
    console.log(`plans: money_overview ${ov.toFixed(0)} ms, dashboard ${dash.toFixed(0)} ms (2,000 entries x 12 rows)`)
    expect(Math.max(ov, dash)).toBeLessThan(150)
  })
})
