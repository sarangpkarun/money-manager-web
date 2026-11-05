import fc from 'fast-check'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ANON, deleteUser, makeUser, sql, type TestUser } from './helpers'

let a: TestUser, b: TestUser
let cash: string, upi: string, card: string, food: string
let arun: string, meera: string, ravi: string

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: RPC results are checked field by field
const rpc = (u: TestUser, fn: string, args: Record<string, unknown>) => u.client.rpc(fn as never, args as never) as unknown as PromiseLike<{ data: any; error: { message: string } | null }>
const uid = () => crypto.randomUUID()

interface Other { person_id: string; amount_paise: number; due_date?: string; rows?: unknown[] }
const add = (o: Record<string, unknown> = {}, others: Other[] = [{ person_id: arun, amount_paise: 3_000_000 }]) =>
  rpc(a, 'quick_add_with_others', {
    p_id: uid(), p_amount: 3_000_000, p_date: '2026-11-10', p_account: card, p_category: food, p_title: 'Dinner', p_place: null, p_notes: null, p_tags: [], p_others: others, ...o,
  })
const balance = async (id: string) => Number((await must(a.client.from('account_balances').select('balance_paise').eq('account_id', id).single()))!.balance_paise)
const outstanding = async (id: string) => Number((await must(a.client.from('account_balances').select('outstanding_paise').eq('account_id', id).single()))!.outstanding_paise)
const txn = async (id: string) => (await sql(`select kind, amount_paise, for_other_paise, entry_id, account_id from transactions where id = $1`, [id])).rows[0]
const entriesOf = async (txnId: string) => (await sql(`select id, kind, direction, person_id, principal_paise, status, due_date::text as due_date from entries where source_txn_id = $1 order by (select name from people where id = person_id), id`, [txnId])).rows
const pay = (entry: string, amount: number, account: string, on = '2026-11-12') =>
  rpc(a, 'record_payment', { p_id: uid(), p_entry: entry, p_amount: amount, p_paid_on: on, p_account: account })
const spent = async (month = '2026-11') => (await must(rpc(a, 'dashboard_summary', { p_month: month, p_today: '2026-11-20', p_filters: {} }))).month.spent as number
const cleanup = async (...ids: string[]) => { for (const id of ids) await sql(`delete from entries where source_txn_id = $1`, [id]).then(() => sql(`delete from transactions where id = $1 or entry_id in (select id from entries where source_txn_id = $1)`, [id])) }

beforeAll(async () => {
  a = await makeUser('oth-a')
  b = await makeUser('oth-b')
  cash = (await must(a.client.from('accounts').select('id').eq('name', 'Cash').single()))!.id
  upi = (await must(a.client.from('accounts').insert({ name: 'UPI', type: 'upi', opening_balance_paise: 1_000_000 }).select('id').single()))!.id
  card = (await must(a.client.from('accounts').insert({ name: 'HDFC Card', type: 'credit_card', credit_limit_paise: 20_000_000, due_day: 22 }).select('id').single()))!.id
  food = (await must(a.client.from('categories').select('id').eq('name', 'Food').single()))!.id
  arun = (await must(a.client.from('people').insert({ name: 'Arun' }).select('id').single()))!.id
  meera = (await must(a.client.from('people').insert({ name: 'Meera' }).select('id').single()))!.id
  ravi = (await must(a.client.from('people').insert({ name: 'Ravi' }).select('id').single()))!.id
}, 30_000)
afterAll(async () => { await Promise.all([a, b].map((u) => u && deleteUser(u.id))) })

describe('scenario A: ₹30,000 on the card for Arun', () => {
  let t: string, entry: string
  it('the card carries the whole bill but personal spend does not move', async () => {
    const before = await spent()
    const r = await must(add())
    t = r.txn.id
    expect(await txn(t)).toMatchObject({ kind: 'expense', amount_paise: '3000000', for_other_paise: '3000000', entry_id: null })
    expect(await outstanding(card)).toBe(3_000_000)
    expect(await spent()).toBe(before) // spend +₹0
    const es = await entriesOf(t)
    expect(es).toHaveLength(1)
    expect(es[0]).toMatchObject({ kind: 'on_behalf', direction: 'receive', person_id: arun, principal_paise: '3000000', status: 'open', due_date: null })
    entry = es[0].id
    expect(r.entries).toEqual([entry])
    expect(r.txn.for_other_paise).toBe(3_000_000)
  })

  it('Activity rows and the calendar carry who still owes what', async () => {
    const rows = (await must(rpc(a, 'search_transactions', { p_filters: {}, p_limit: 20 }))) as { id: string; others: { person_name: string; pending_paise: number; entry_id: string }[] }[]
    const row = rows.find((x) => x.id === t)!
    expect(row.others).toEqual([{ entry_id: entry, person_id: arun, person_name: 'Arun', amount_paise: 3_000_000, pending_paise: 3_000_000 }])
    const cal = await must(rpc(a, 'calendar_month', { p_month: '2026-11', p_today: '2026-11-20', p_filters: {} }))
    expect(cal.txns.find((x: { id: string }) => x.id === t).others[0]).toMatchObject({ person_name: 'Arun', pending_paise: 3_000_000 })
    expect(cal.totals.spent).toBe(await spent()) // the calendar agrees with the dashboard
  })

  it('Money lists Arun as owing ₹30,000; the dashboard totals friends and the card', async () => {
    const ov = await must(rpc(a, 'money_overview', { p_today: '2026-11-20' }))
    expect(ov.entries.find((e: { id: string }) => e.id === entry)).toMatchObject({ kind: 'on_behalf', direction: 'receive', person_name: 'Arun', outstanding_paise: 3_000_000 })
    const d = await must(rpc(a, 'dashboard_summary', { p_month: '2026-11', p_today: '2026-11-20', p_filters: {} }))
    expect(d.friends.pending_paise).toBe(3_000_000)
    expect(d.friends.by_account).toEqual([{ account_id: card, pending_paise: 3_000_000 }])
    expect(d.net_position.owed_to_me).toBeGreaterThanOrEqual(3_000_000)
  })

  it('part payment ₹10,000 into UPI is a debt_in (not income), the entry stays open', async () => {
    const upiBefore = await balance(upi)
    const e = await must(pay(entry, 1_000_000, upi))
    expect(e.status).toBe('open')
    expect(await balance(upi)).toBe(upiBefore + 1_000_000)
    const kinds = (await sql(`select kind from transactions where entry_id = $1`, [entry])).rows.map((r) => r.kind)
    expect(kinds).toEqual(['debt_in'])
    expect(await spent()).toBe(await spent()) // unchanged by repayments
    expect((await must(rpc(a, 'search_transactions', { p_filters: {}, p_limit: 20 }))).find((x: { id: string }) => x.id === t).others[0].pending_paise).toBe(2_000_000)
    expect(await outstanding(card)).toBe(3_000_000) // the card bill is settled separately
  })

  it('₹20,000 cash settles: entry settled, history lists it, for_other is unchanged, nothing pending', async () => {
    const cashBefore = await balance(cash)
    const e = await must(pay(entry, 2_000_000, cash, '2026-11-15'))
    expect(e).toMatchObject({ status: 'settled', settled_on: '2026-11-15' })
    expect(await balance(cash)).toBe(cashBefore + 2_000_000)
    expect(await txn(t)).toMatchObject({ for_other_paise: '3000000' })
    const h = await must(rpc(a, 'money_history', { p_limit: 5 }))
    expect(h.find((x: { id: string }) => x.id === entry)).toMatchObject({ kind: 'on_behalf', person_name: 'Arun', paid_paise: 3_000_000 })
    const d = await must(rpc(a, 'dashboard_summary', { p_month: '2026-11', p_today: '2026-11-20', p_filters: {} }))
    expect(d.friends.pending_paise).toBe(0)
    const row = (await must(rpc(a, 'search_transactions', { p_filters: {}, p_limit: 20 }))).find((x: { id: string }) => x.id === t)
    expect(row.others[0].pending_paise).toBe(0)
  })
})

describe('partial amounts and splits', () => {
  it('₹5,000 bill with ₹4,000 for a friend → personal spend ₹1,000', async () => {
    const before = await spent('2026-12')
    const r = await must(add({ p_amount: 500_000, p_date: '2026-12-02', p_account: cash }, [{ person_id: ravi, amount_paise: 400_000 }]))
    expect(r.txn.for_other_paise).toBe(400_000)
    expect(await spent('2026-12')).toBe(before + 100_000)
    const f = await must(rpc(a, 'activity_summary', { p_filters: { from: '2026-12-01', to: '2026-12-31' } }))
    expect(f.spent).toBe(before + 100_000)
    await cleanup(r.txn.id)
  })

  it('a three-way split reconciles to the purchase and each friend gets their own entry', async () => {
    const r = await must(add({ p_amount: 900_000, p_date: '2026-12-03', p_account: cash }, [
      { person_id: arun, amount_paise: 300_000 }, { person_id: meera, amount_paise: 300_000 }, { person_id: ravi, amount_paise: 300_000 }]))
    const es = await entriesOf(r.txn.id)
    expect(es.map((e) => e.person_id).sort()).toEqual([arun, meera, ravi].sort())
    expect(es.reduce((s, e) => s + Number(e.principal_paise), 0)).toBe(Number(r.txn.for_other_paise))
    expect(r.txn.for_other_paise).toBe(900_000)
    const row = (await must(rpc(a, 'search_transactions', { p_filters: {}, p_limit: 20 }))).find((x: { id: string }) => x.id === r.txn.id)
    expect(row.others.map((o: { person_name: string }) => o.person_name)).toEqual(['Arun', 'Meera', 'Ravi'])
    await cleanup(r.txn.id)
  })

  it('a friend can repay in instalments: the plan rows are stored and Due soon sees them', async () => {
    const rows = [1, 2, 3].map((n) => ({ seq: n, due_date: `2026-11-${10 + n * 5}`, due_paise: 100_000, principal_paise: 100_000, interest_paise: 0 }))
    const r = await must(add({ p_amount: 300_000, p_date: '2026-11-02', p_account: cash }, [{ person_id: meera, amount_paise: 300_000, rows }]))
    const es = await entriesOf(r.txn.id)
    expect(es[0]!.due_date).toBe('2026-11-25')
    expect((await sql(`select count(*)::int n from schedule_items where entry_id = $1`, [es[0]!.id])).rows[0].n).toBe(3)
    const d = await must(rpc(a, 'dashboard_summary', { p_month: '2026-11', p_today: '2026-11-14', p_filters: {} }))
    expect(d.due_soon.items.some((i: { entry_id: string; kind: string }) => i.entry_id === es[0]!.id && i.kind === 'on_behalf')).toBe(true)
    await cleanup(r.txn.id)
  })

  it('shares may add up to less than the purchase; more than the purchase is refused', async () => {
    const ok = await must(add({ p_amount: 1_000_000, p_account: cash }, [{ person_id: arun, amount_paise: 250_000 }, { person_id: meera, amount_paise: 250_000 }]))
    expect(ok.txn.for_other_paise).toBe(500_000)
    await cleanup(ok.txn.id)
    const id = uid()
    const bad = await add({ p_id: id, p_amount: 1_000_000, p_account: cash }, [{ person_id: arun, amount_paise: 600_000 }, { person_id: meera, amount_paise: 600_000 }])
    expect(bad.error?.message).toMatch(/cannot owe more/)
    expect(await txn(id)).toBeUndefined()
  })
})

describe('validation, idempotency, isolation', () => {
  it('rejects bad input and saves nothing', async () => {
    const cases: [string, Record<string, unknown>, Other[], RegExp][] = [
      ['nobody', {}, [], /choose who/],
      ['zero amount', {}, [{ person_id: arun, amount_paise: 0 }], /above zero/],
      ['foreign person', {}, [{ person_id: (await must(b.client.from('people').insert({ name: 'X' }).select('id').single()))!.id, amount_paise: 100 }], /person not found/],
      ['no account', { p_account: uid() }, [{ person_id: arun, amount_paise: 100 }], /Account not found/],
      ['zero purchase', { p_amount: 0 }, [{ person_id: arun, amount_paise: 100 }], /cannot owe more|greater than zero/],
    ]
    for (const [name, o, others, re] of cases) {
      const id = uid()
      expect((await add({ p_id: id, ...o }, others)).error?.message, name).toMatch(re)
      expect(await txn(id), name).toBeUndefined()
    }
  })

  it('is idempotent on the purchase id', async () => {
    const id = uid()
    const first = await must(add({ p_id: id, p_account: cash }))
    const again = await must(add({ p_id: id, p_account: cash }))
    expect(again.txn.id).toBe(first.txn.id)
    expect((await entriesOf(id))).toHaveLength(1)
    await cleanup(id)
  })

  it('a failure part-way leaves nothing behind (purchase, entries and rows)', async () => {
    const id = uid()
    await sql(`create function fail_second_row() returns trigger language plpgsql as $$ begin if new.due_paise = 123456 then raise exception 'forced failure'; end if; return new; end $$`)
    await sql(`create trigger t_fail before insert on schedule_items for each row execute function fail_second_row()`)
    try {
      expect((await add({ p_id: id, p_amount: 500_000, p_account: cash }, [{ person_id: arun, amount_paise: 100_000 }, { person_id: meera, amount_paise: 123_456 }])).error?.message).toMatch(/forced failure/)
    } finally {
      await sql('drop trigger t_fail on schedule_items'); await sql('drop function fail_second_row()')
    }
    expect(await txn(id)).toBeUndefined()
    expect((await sql(`select count(*)::int n from entries where source_txn_id = $1`, [id])).rows[0].n).toBe(0)
  })

  it('another user cannot see or touch it; anonymous callers are denied', async () => {
    const r = await must(add({ p_account: cash }))
    const rows = (await must(rpc(b, 'search_transactions', { p_filters: {}, p_limit: 20 }))) as { id: string }[]
    expect(rows.some((x) => x.id === r.txn.id)).toBe(false)
    expect((await rpc(b, 'delete_transaction', { p_id: r.txn.id })).error).not.toBeNull()
    expect((await rpc(b, 'update_expense_for_others', { p_id: r.txn.id, p_patch: { title: 'x' } })).error).not.toBeNull()
    const anon = createClient(process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321', ANON, { auth: { persistSession: false } })
    for (const fn of ['quick_add_with_others', 'delete_transaction', 'update_expense_for_others']) expect((await anon.rpc(fn as never, {} as never)).error, fn).not.toBeNull()
    await cleanup(r.txn.id)
  })

  it('the purchase stays editable in Activity terms (no entry_id) while payments are read-only', async () => {
    const r = await must(add({ p_account: cash }))
    const e = (await entriesOf(r.txn.id))[0]!
    await must(pay(e.id, 100_000, upi))
    expect((await txn(r.txn.id)).entry_id).toBeNull()
    expect((await sql(`select entry_id from transactions where entry_id = $1`, [e.id])).rows).toHaveLength(1)
    await sql(`delete from transactions where entry_id = $1`, [e.id]); await cleanup(r.txn.id)
  })
})

describe('deleting a purchase', () => {
  it('is blocked once a friend has paid, with a clear message, and nothing changes', async () => {
    const r = await must(add({ p_account: cash }, [{ person_id: arun, amount_paise: 1_000_000 }, { person_id: meera, amount_paise: 500_000 }]))
    const [e1] = await entriesOf(r.txn.id)
    const paid = await must(pay(e1!.id, 250_000, upi))
    expect(paid.status).toBe('open')
    const del = await rpc(a, 'delete_transaction', { p_id: r.txn.id })
    expect(del.error?.message).toMatch(/has already paid ₹2500\. Delete those payments first/)
    expect(await txn(r.txn.id)).toBeDefined()
    expect(await entriesOf(r.txn.id)).toHaveLength(2)
    // remove the payment, then it works
    const pid = (await sql(`select id from payments where entry_id = $1`, [e1!.id])).rows[0].id
    await must(rpc(a, 'delete_payment', { p_id: pid }))
    const gone = await must(rpc(a, 'delete_transaction', { p_id: r.txn.id }))
    expect(gone.txn.id).toBe(r.txn.id)
    expect(gone.others).toHaveLength(2)
    expect(await txn(r.txn.id)).toBeUndefined()
    expect(await entriesOf(r.txn.id)).toHaveLength(0)
  })

  it('returns a snapshot that quick_add_with_others restores (Undo), including a friend’s plan rows', async () => {
    const rows = [1, 2].map((n) => ({ seq: n, due_date: `2026-12-${10 + n}`, due_paise: 100_000, principal_paise: 100_000, interest_paise: 0 }))
    const r = await must(add({ p_amount: 400_000, p_account: cash, p_date: '2026-12-01' }, [{ person_id: arun, amount_paise: 200_000, rows }, { person_id: meera, amount_paise: 100_000, due_date: '2026-12-20' }]))
    const snap = await must(rpc(a, 'delete_transaction', { p_id: r.txn.id }))
    const again = await must(rpc(a, 'quick_add_with_others', {
      p_id: snap.txn.id, p_amount: snap.txn.amount_paise, p_date: snap.txn.date, p_account: snap.txn.account_id, p_category: snap.txn.category_id, p_title: snap.txn.title,
      p_place: snap.txn.place, p_notes: snap.txn.notes, p_tags: snap.txn.tags, p_others: snap.others,
    }))
    expect(again.txn.for_other_paise).toBe(300_000)
    const es = await entriesOf(snap.txn.id)
    expect(es).toHaveLength(2)
    expect((await sql(`select count(*)::int n from schedule_items where entry_id = $1`, [es.find((e) => e.person_id === arun)!.id])).rows[0].n).toBe(2)
    await cleanup(snap.txn.id)
  })

  it('a loan or EMI transaction cannot be deleted this way', async () => {
    const e = await must(rpc(a, 'create_entry', { p_id: uid(), p_kind: 'lent', p_person: ravi, p_title: 'Loan', p_amount: 1000, p_account: cash, p_start: '2026-11-01' }))
    const t = (await sql(`select id from transactions where entry_id = $1`, [(e as { id: string }).id])).rows[0].id
    expect((await rpc(a, 'delete_transaction', { p_id: t })).error?.message).toMatch(/belongs to a loan/)
    await must(rpc(a, 'delete_entry', { p_id: (e as { id: string }).id }))
  })
})

describe('editing a purchase', () => {
  it('title, category, place and date change freely; the friends’ debts are untouched', async () => {
    const r = await must(add({ p_account: cash }))
    const u = await must(rpc(a, 'update_expense_for_others', { p_id: r.txn.id, p_patch: { title: ' Lunch ', place: 'Cafe', date: '2026-11-11', tags: ['work'] } }))
    expect(u.txn).toMatchObject({ title: 'Lunch', place: 'Cafe', date: '2026-11-11', tags: ['work'], for_other_paise: 3_000_000 })
    expect(u.others[0]).toMatchObject({ person_name: 'Arun', pending_paise: 3_000_000 })
    await cleanup(r.txn.id)
  })

  it('amount cannot drop below what friends owe; raising it is fine', async () => {
    const r = await must(add({ p_account: cash, p_amount: 1_000_000 }, [{ person_id: arun, amount_paise: 600_000 }]))
    expect((await rpc(a, 'update_expense_for_others', { p_id: r.txn.id, p_patch: { amount_paise: 500_000 } })).error?.message).toMatch(/less than what friends owe/)
    const up = await must(rpc(a, 'update_expense_for_others', { p_id: r.txn.id, p_patch: { amount_paise: 1_200_000 } }))
    expect(up.txn).toMatchObject({ amount_paise: 1_200_000, for_other_paise: 600_000 })
    await cleanup(r.txn.id)
  })

  it('friends can be changed where nothing was paid: amounts, additions and removals re-sync for_other', async () => {
    const r = await must(add({ p_account: cash, p_amount: 1_000_000 }, [{ person_id: arun, amount_paise: 300_000 }, { person_id: meera, amount_paise: 300_000 }]))
    const [ea, em] = await entriesOf(r.txn.id)
    const up = await must(rpc(a, 'update_expense_for_others', {
      p_id: r.txn.id, p_patch: {},
      p_others: [{ entry_id: ea!.id, person_id: ea!.person_id, amount_paise: 400_000 }, { person_id: ravi, amount_paise: 100_000 }], // Meera removed, Ravi added, Arun raised
    }))
    expect(up.txn.for_other_paise).toBe(500_000)
    expect(up.others.map((o: { person_name: string; amount_paise: number }) => [o.person_name, o.amount_paise])).toEqual([['Arun', 400_000], ['Ravi', 100_000]])
    expect((await sql(`select count(*)::int n from entries where id = $1`, [em!.id])).rows[0].n).toBe(0)
    await cleanup(r.txn.id)
  })

  it('a friend who has paid cannot be removed or cut below their payment; others still can change', async () => {
    const r = await must(add({ p_account: cash, p_amount: 1_000_000 }, [{ person_id: arun, amount_paise: 400_000 }, { person_id: meera, amount_paise: 200_000 }]))
    const [ea, em] = await entriesOf(r.txn.id)
    await must(pay(ea!.id, 150_000, upi))
    expect((await rpc(a, 'update_expense_for_others', { p_id: r.txn.id, p_patch: {}, p_others: [{ entry_id: em!.id, person_id: meera, amount_paise: 200_000 }] })).error?.message).toMatch(/already paid cannot be removed/)
    expect((await rpc(a, 'update_expense_for_others', { p_id: r.txn.id, p_patch: {}, p_others: [{ entry_id: ea!.id, person_id: arun, amount_paise: 100_000 }, { entry_id: em!.id, person_id: meera, amount_paise: 200_000 }] })).error?.message).toMatch(/cannot go below/)
    expect(await entriesOf(r.txn.id)).toHaveLength(2) // nothing changed
    const ok = await must(rpc(a, 'update_expense_for_others', { p_id: r.txn.id, p_patch: {}, p_others: [{ entry_id: ea!.id, person_id: arun, amount_paise: 300_000 }, { entry_id: em!.id, person_id: meera, amount_paise: 100_000 }] }))
    expect(ok.txn.for_other_paise).toBe(400_000)
    await sql(`delete from transactions where entry_id = $1`, [ea!.id]); await cleanup(r.txn.id)
  })

  it('only a plain purchase can be edited here', async () => {
    const income = await must(a.client.from('transactions').insert({ kind: 'income', amount_paise: 100, date: '2026-11-01', account_id: cash, for_other_paise: 0 } as never).select('id').single())
    expect((await rpc(a, 'update_expense_for_others', { p_id: income!.id, p_patch: { title: 'x' } })).error?.message).toMatch(/only a purchase/)
    await sql(`delete from transactions where id = $1`, [income!.id])
  })
})

describe('keeping for_other_paise honest', () => {
  it('deleting a friend’s entry reduces for_other; editing their due date does not change it', async () => {
    const r = await must(add({ p_account: cash, p_amount: 900_000 }, [{ person_id: arun, amount_paise: 300_000 }, { person_id: meera, amount_paise: 300_000 }]))
    const [ea, em] = await entriesOf(r.txn.id)
    await must(rpc(a, 'update_entry', { p_id: ea!.id, p_patch: { due_date: '2026-12-31' } }))
    expect((await txn(r.txn.id)).for_other_paise).toBe('600000')
    await must(rpc(a, 'delete_entry', { p_id: em!.id }))
    expect((await txn(r.txn.id)).for_other_paise).toBe('300000')
    const row = (await must(rpc(a, 'search_transactions', { p_filters: {}, p_limit: 20 }))).find((x: { id: string }) => x.id === r.txn.id)
    expect(row.others).toHaveLength(1)
    await cleanup(r.txn.id)
  })

  it('property: after any mix of adds, repayments, removals and edits, for_other equals the sum of the open entries’ principals', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.record({ op: fc.constantFrom('remove', 'raise', 'pay', 'noop'), who: fc.integer({ min: 0, max: 2 }), amt: fc.integer({ min: 1_000, max: 100_000 }) }), { minLength: 1, maxLength: 5 }),
      async (ops) => {
        const r = await must(add({ p_account: cash, p_amount: 1_000_000 }, [{ person_id: arun, amount_paise: 200_000 }, { person_id: meera, amount_paise: 200_000 }, { person_id: ravi, amount_paise: 200_000 }]))
        const id = r.txn.id as string
        for (const o of ops) {
          const es = await entriesOf(id)
          const e = es[o.who % Math.max(es.length, 1)]
          if (!e) continue
          if (o.op === 'remove') await rpc(a, 'delete_entry', { p_id: e.id })
          else if (o.op === 'raise') await rpc(a, 'update_expense_for_others', { p_id: id, p_patch: {}, p_others: es.map((x) => ({ entry_id: x.id, person_id: x.person_id, amount_paise: Number(x.principal_paise) + (x.id === e.id ? o.amt : 0) })) })
          else if (o.op === 'pay') await pay(e.id, Math.min(o.amt, Number(e.principal_paise)), upi)
        }
        const sum = (await sql(`select coalesce(sum(principal_paise), 0)::text s from entries where source_txn_id = $1 and kind = 'on_behalf' and status <> 'cancelled'`, [id])).rows[0].s
        expect((await txn(id)).for_other_paise).toBe(sum)
        expect(Number(sum)).toBeLessThanOrEqual(1_000_000)
        await sql(`delete from transactions where entry_id in (select id from entries where source_txn_id = $1)`, [id]); await cleanup(id)
      }), { numRuns: 8 })
  }, 120_000)
})

describe('the "not returned yet" filter', () => {
  it('lists only purchases where a friend still owes something', async () => {
    await must(add({ p_account: cash, p_amount: 100_000, p_title: 'PendingOne' }, [{ person_id: arun, amount_paise: 100_000 }]))
    const settled = await must(add({ p_account: cash, p_amount: 100_000, p_title: 'SettledOne' }, [{ person_id: arun, amount_paise: 100_000 }]))
    await must(pay((await entriesOf(settled.txn.id))[0]!.id, 100_000, upi))
    await must(a.client.from('transactions').insert({ kind: 'expense', amount_paise: 100, date: '2026-11-10', account_id: cash, title: 'PlainOne', for_other_paise: 0 } as never))
    const titles = async (f: Record<string, unknown>) => ((await must(rpc(a, 'search_transactions', { p_filters: f, p_limit: 200 }))) as { title: string }[]).map((x) => x.title)
    const all = await titles({})
    for (const t of ['PendingOne', 'SettledOne', 'PlainOne']) expect(all).toContain(t)
    const only = await titles({ others: 'pending' })
    expect(only).toContain('PendingOne')
    expect(only).not.toContain('SettledOne')
    expect(only).not.toContain('PlainOne')
    expect((await must(rpc(a, 'activity_summary', { p_filters: { others: 'pending' } }))).spent).toBeGreaterThanOrEqual(0)
    await sql(`delete from transactions where entry_id in (select id from entries where source_txn_id = $1)`, [settled.txn.id])
  })
})

describe('performance with friends on 500 of 5,000 purchases', () => {
  let perf: TestUser
  beforeAll(async () => {
    perf = await makeUser('oth-perf')
    const acc = (await must(perf.client.from('accounts').select('id').limit(1).single()))!.id
    const p = (await must(perf.client.from('people').insert({ name: 'Friend' }).select('id').single()))!.id
    await sql(
      `insert into transactions (user_id, kind, amount_paise, for_other_paise, date, account_id, title)
       select $1, 'expense', 100000, case when g % 10 = 0 then 50000 else 0 end, date '2026-01-01' + (g % 300), $2, 'Item ' || g from generate_series(1, 5000) g`, [perf.id, acc])
    await sql(
      `insert into entries (user_id, kind, direction, person_id, title, principal_paise, start_date, total_payable_paise, status, source_txn_id)
       select $1, 'on_behalf', 'receive', $2, 'F', 50000, t.date, 50000, 'open', t.id from transactions t where t.user_id = $1 and t.for_other_paise > 0`, [perf.id, p])
    await sql(
      `insert into schedule_items (user_id, entry_id, seq, due_date, due_paise, principal_paise) select $1, e.id, 1, date '9999-12-31', 50000, 50000 from entries e where e.user_id = $1`, [perf.id])
    await sql('analyze transactions'); await sql('analyze entries'); await sql('analyze schedule_items')
  }, 90_000)
  afterAll(async () => { await deleteUser(perf.id) })

  it('search stays well under 300 ms, plain and with the filter', async () => {
    const time = async (f: Record<string, unknown>) => { const t0 = performance.now(); await rpc(perf, 'search_transactions', { p_filters: f, p_limit: 50 }); return performance.now() - t0 }
    await time({})
    const plain = await time({}); const pending = await time({ others: 'pending' })
    console.log(`search with friends: plain ${plain.toFixed(0)} ms, others=pending ${pending.toFixed(0)} ms`)
    expect(Math.max(plain, pending)).toBeLessThan(300)
  })
})
