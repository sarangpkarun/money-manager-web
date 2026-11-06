import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ANON, URL, deleteUser, makeUser, sql, type TestUser } from './helpers'

interface Facts {
  month: { spent_paise: number; prev_total_paise: number; days_elapsed: number; days_in_month: number }
  categories: { id: string | null; name: string; this_paise: number; prev_to_date_paise: number }[]
  people_overdue: { person_id: string | null; name: string; overdue_paise: number; days_late: number; entry_id: string }[]
  largest_outstanding: { person_id: string | null; name: string; outstanding_paise: number } | null
  cards: { id: string; name: string; outstanding_paise: number; limit_paise: number; due_day: number | null }[]
  for_others_aged: { entry_id: string; name: string; left_paise: number; days: number }[]
  streak: { early_this_year: number; late_this_year: number; early_in_a_row: number }
  budgets: { category_id: string | null; name: string; limit_paise: number; spent_paise: number }[]
  largest_spend: { id: string; title: string | null; amount_paise: number; date: string; category: string | null } | null
  top_account: { id: string; name: string; count: number } | null
}

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}
const facts = async (u: TestUser, today: string) => (await must(u.client.rpc('insight_facts', { p_today: today } as never))) as unknown as Facts

let a: TestUser, b: TestUser, c: TestUser
let cash: string, bank: string, card: string, food: string, travel: string
let ravi: string, arun: string, meera: string

const txn = (u: TestUser, rows: Record<string, unknown>[]) =>
  must(u.client.from('transactions').insert(rows.map((r) => ({ for_other_paise: 0, ...r })) as never))

async function entry(u: TestUser, o: { kind: string; direction: string; person: string; title: string; start: string; status?: string; rows: { due: string; due_paise: number; paid?: number; paid_on?: string }[] }) {
  const total = o.rows.reduce((s, r) => s + r.due_paise, 0)
  const e = (await sql(
    `insert into entries (user_id, kind, direction, person_id, title, principal_paise, start_date, total_payable_paise, status)
     values ($1,$2::entry_kind,$3::entry_dir,$4,$5,$6,$7,$6,$8::entry_status) returning id`,
    [u.id, o.kind, o.direction, o.person, o.title, total, o.start, o.status ?? 'open'])).rows[0].id as string
  let seq = 1
  for (const r of o.rows) {
    await sql(`insert into schedule_items (user_id, entry_id, seq, due_date, due_paise, paid_paise, paid_on) values ($1,$2,$3,$4,$5,$6,$7)`,
      [u.id, e, seq++, r.due, r.due_paise, r.paid ?? 0, r.paid_on ?? null])
  }
  return e
}

beforeAll(async () => {
  ;[a, b, c] = await Promise.all([makeUser('ins-a'), makeUser('ins-b'), makeUser('ins-c')])
  cash = (await must(a.client.from('accounts').select('id').eq('name', 'Cash').single()))!.id
  bank = (await must(a.client.from('accounts').insert({ name: 'Bank', type: 'bank' }).select('id').single()))!.id
  card = (await must(a.client.from('accounts').insert({ name: 'Card', type: 'credit_card', credit_limit_paise: 5_000_000, due_day: 18 }).select('id').single()))!.id
  const cats = (await must(a.client.from('categories').select('id,name')))!
  food = cats.find((x) => x.name === 'Food')!.id
  travel = cats.find((x) => x.name === 'Travel')!.id
  const ppl = (await must(a.client.from('people').insert([{ name: 'Ravi' }, { name: 'Arun' }, { name: 'Meera' }]).select('id,name')))!
  ravi = ppl.find((p) => p.name === 'Ravi')!.id; arun = ppl.find((p) => p.name === 'Arun')!.id; meera = ppl.find((p) => p.name === 'Meera')!.id

  await txn(a, [
    { kind: 'expense', amount_paise: 40_000, date: '2026-11-03', account_id: cash, category_id: food, title: 'Big' },
    { kind: 'expense', amount_paise: 30_000, for_other_paise: 10_000, date: '2026-11-10', account_id: cash, category_id: food },
    { kind: 'expense', amount_paise: 15_000, date: '2026-11-12', account_id: bank, category_id: travel },
    { kind: 'expense', amount_paise: 5_000, date: '2026-11-14', account_id: card },
    { kind: 'expense', amount_paise: 20_000, date: '2026-10-10', account_id: cash, category_id: food },
    { kind: 'expense', amount_paise: 50_000, date: '2026-10-20', account_id: cash, category_id: food },
    { kind: 'expense', amount_paise: 7_000, date: '2026-10-31', account_id: bank, category_id: travel },
    { kind: 'expense', amount_paise: 99_000, date: '2026-12-01', account_id: cash, category_id: food },
    { kind: 'income', amount_paise: 900_000, date: '2026-11-03', account_id: bank },
    { kind: 'transfer', amount_paise: 70_000, date: '2026-11-04', account_id: bank, to_account_id: cash },
    { kind: 'debt_out', amount_paise: 40_000, date: '2026-11-04', account_id: cash },
  ])
  await txn(b, [{ kind: 'expense', amount_paise: 777_000, date: '2026-11-05' }])

  await entry(a, { kind: 'lent', direction: 'receive', person: ravi, title: 'Old loan', start: '2026-09-01', rows: [{ due: '2026-10-01', due_paise: 100_000 }] })
  await entry(a, { kind: 'lent', direction: 'receive', person: ravi, title: 'Small loan', start: '2026-10-20', rows: [{ due: '2026-11-10', due_paise: 50_000, paid: 20_000 }] })
  await entry(a, { kind: 'on_behalf', direction: 'receive', person: arun, title: 'Phone', start: '2026-09-20', rows: [{ due: '9999-12-31', due_paise: 300_000, paid: 100_000 }] })
  await entry(a, { kind: 'on_behalf', direction: 'receive', person: meera, title: 'Lunch', start: '2026-10-25', rows: [{ due: '9999-12-31', due_paise: 90_000 }] })
  await entry(a, { kind: 'lent', direction: 'receive', person: meera, title: 'Cancelled', start: '2026-08-01', status: 'cancelled', rows: [{ due: '2026-08-15', due_paise: 999_000 }] })
  await entry(a, { kind: 'lent', direction: 'receive', person: arun, title: 'Settled late', start: '2026-09-01', status: 'settled', rows: [{ due: '2026-10-01', due_paise: 10_000, paid: 10_000, paid_on: '2026-10-20' }] })
  await entry(a, {
    kind: 'emi_purchase', direction: 'pay', person: meera, title: 'Laptop EMI', start: '2026-07-05',
    rows: [
      { due: '2026-08-05', due_paise: 10_000, paid: 10_000, paid_on: '2026-08-01' },
      { due: '2026-09-05', due_paise: 10_000, paid: 10_000, paid_on: '2026-09-05' },
      { due: '2026-10-05', due_paise: 10_000, paid: 10_000, paid_on: '2026-10-03' },
      { due: '2026-11-05', due_paise: 10_000, paid: 10_000, paid_on: '2026-11-06' },
      { due: '2026-12-05', due_paise: 10_000 },
    ],
  })
  await must(a.client.from('budgets').insert([{ category_id: food, limit_paise: 100_000 }, { category_id: null, limit_paise: 150_000 }] as never))

  // user c: three early payments in a row this year, plus the previous-month clamp cases
  const cm = (await must(c.client.from('people').insert({ name: 'Lender' }).select('id').single()))!.id
  await entry(c, {
    kind: 'borrowed', direction: 'pay', person: cm, title: 'Loan', start: '2026-01-01',
    rows: [
      { due: '2026-02-10', due_paise: 1_000, paid: 1_000, paid_on: '2026-02-09' },
      { due: '2026-03-10', due_paise: 1_000, paid: 1_000, paid_on: '2026-03-01' },
      { due: '2026-04-10', due_paise: 1_000, paid: 1_000, paid_on: '2026-04-10' },
      { due: '2026-05-10', due_paise: 1_000, paid: 1_000, paid_on: '2026-05-02' },
      { due: '2026-06-10', due_paise: 1_000, paid: 1_000, paid_on: '2026-06-01' },
    ],
  })
  const cCash = (await must(c.client.from('accounts').select('id').eq('name', 'Cash').single()))!.id
  await txn(c, [
    { kind: 'expense', amount_paise: 1_000, date: '2026-02-28', account_id: cCash },
    { kind: 'expense', amount_paise: 2_000, date: '2026-02-01', account_id: cCash },
    { kind: 'expense', amount_paise: 4_000, date: '2026-03-31', account_id: cCash },
  ])
}, 60_000)

afterAll(async () => { await Promise.all([a, b, c].map((u) => u && deleteUser(u.id))) })

describe('insight_facts', () => {
  const today = '2026-11-15'

  it('month totals: personal spend only, this month vs last month in full', async () => {
    const f = await facts(a, today)
    expect(f.month).toEqual({ spent_paise: 40_000 + 20_000 + 15_000 + 5_000, prev_total_paise: 20_000 + 50_000 + 7_000, days_elapsed: 15, days_in_month: 30 })
  })

  it('categories compare month-to-date with the same days of last month; for-others spend, transfers, debts and later months are ignored', async () => {
    const f = await facts(a, today)
    const by = Object.fromEntries(f.categories.map((x) => [x.name, x]))
    expect(by.Food).toMatchObject({ id: food, this_paise: 60_000, prev_to_date_paise: 20_000 }) // Oct 20 is after the 15th: not counted
    expect(by.Travel).toMatchObject({ this_paise: 15_000, prev_to_date_paise: 0 }) // Oct 31 is outside the stretch
    expect(by.Uncategorised).toMatchObject({ id: null, this_paise: 5_000, prev_to_date_paise: 0 })
    expect(f.categories.map((x) => x.name)).toEqual(['Food', 'Travel', 'Uncategorised'])
  })

  it('people overdue: grouped per person, oldest due date sets the days, cancelled and no-due-date rows ignored', async () => {
    const f = await facts(a, today)
    expect(f.people_overdue).toHaveLength(1)
    expect(f.people_overdue[0]).toMatchObject({ person_id: ravi, name: 'Ravi', overdue_paise: 100_000 + 30_000, days_late: 45 })
  })

  it('largest outstanding person counts every open row (also with no due date)', async () => {
    const f = await facts(a, today)
    expect(f.largest_outstanding).toEqual({ person_id: arun, name: 'Arun', outstanding_paise: 200_000 })
  })

  it('credit cards: outstanding, limit and due day', async () => {
    const f = await facts(a, today)
    expect(f.cards).toEqual([{ id: card, name: 'Card', outstanding_paise: 5_000, limit_paise: 5_000_000, due_day: 18 }])
  })

  it('paid-for-others older than 30 days and still open', async () => {
    const f = await facts(a, today)
    expect(f.for_others_aged).toHaveLength(1)
    expect(f.for_others_aged[0]).toMatchObject({ name: 'Arun', left_paise: 200_000, days: 56 })
    const later = await facts(a, '2026-11-25') // Meera's 25 Oct entry is now 31 days old
    expect(later.for_others_aged.map((x) => x.name)).toEqual(['Arun', 'Meera'])
  })

  it('early/late counts only cover the payments you make this year; the streak stops at the latest non-early one', async () => {
    const f = await facts(a, today)
    expect(f.streak).toEqual({ early_this_year: 2, late_this_year: 1, early_in_a_row: 0 }) // the settled receivable paid late by a friend is not yours
    const g = await facts(c, '2026-06-30')
    expect(g.streak).toEqual({ early_this_year: 4, late_this_year: 0, early_in_a_row: 2 }) // Jun, May early; Apr on time
    expect((await facts(c, '2026-03-31')).streak).toEqual({ early_this_year: 2, late_this_year: 0, early_in_a_row: 2 })
    expect((await facts(c, '2027-01-05')).streak).toEqual({ early_this_year: 0, late_this_year: 0, early_in_a_row: 0 }) // new year starts clean
  })

  it('budgets: spent so far this month per category and overall', async () => {
    const f = await facts(a, today)
    expect(f.budgets).toEqual([
      { category_id: food, name: 'Food', limit_paise: 100_000, spent_paise: 60_000 },
      { category_id: null, name: 'Overall', limit_paise: 150_000, spent_paise: 80_000 },
    ])
  })

  it('largest single spend (personal amount) and most-used account this month', async () => {
    const f = await facts(a, today)
    expect(f.largest_spend).toMatchObject({ title: 'Big', amount_paise: 40_000, date: '2026-11-03', category: 'Food' })
    expect(f.top_account).toMatchObject({ id: cash, name: 'Cash', count: 2 })
  })

  it('an empty account gets empty lists and nulls, never an error', async () => {
    const u = await makeUser('ins-empty')
    empties.push(u)
    const f = await facts(u, today)
    expect(f).toMatchObject({
      month: { spent_paise: 0, prev_total_paise: 0 }, categories: [], people_overdue: [], largest_outstanding: null, cards: [],
      for_others_aged: [], streak: { early_this_year: 0, late_this_year: 0, early_in_a_row: 0 }, budgets: [], largest_spend: null, top_account: null,
    })
  })

  it("someone else's data is never counted", async () => {
    expect((await facts(b, today)).month.spent_paise).toBe(777_000)
    expect((await facts(a, today)).month.spent_paise).toBe(80_000)
    expect((await facts(b, today)).people_overdue).toEqual([])
  })

  it('last-month stretch clamps to its length (31 Mar against February) and starts on the 1st', async () => {
    const f = await facts(c, '2026-03-31')
    expect(f.categories[0]).toMatchObject({ name: 'Uncategorised', this_paise: 4_000, prev_to_date_paise: 1_000 + 2_000 })
    const first = await facts(c, '2026-03-01')
    expect(first.month.days_elapsed).toBe(1)
    expect((await facts(c, '2026-03-01')).categories.map((x) => x.prev_to_date_paise)).toEqual([2_000]) // only 1 Feb
  })

  it('needs a date and is closed to anonymous callers', async () => {
    const { error } = await a.client.rpc('insight_facts', { p_today: null } as never)
    expect(error?.message).toMatch(/p_today is required/)
    const anon = await fetch(`${URL}/rest/v1/rpc/insight_facts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify({ p_today: today }),
    })
    expect(anon.status).toBeGreaterThanOrEqual(400)
  })
})

const empties: TestUser[] = []
afterAll(async () => { await Promise.all(empties.map((u) => deleteUser(u.id))) })
