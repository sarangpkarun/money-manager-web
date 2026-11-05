import fc from 'fast-check'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteUser, makeUser, sql, type TestUser } from './helpers'

interface Dash {
  month: {
    month: string; start: string; end: string; spent: number; received: number; saved: number
    prev_spent: number; prev_received: number; days_in_month: number; days_elapsed: number
    avg_daily_spent: number | null; projected_spent: number | null; count: number
  }
  daily: { date: string; spent: number; received: number }[]
  by_category: { id: string | null; name: string; spent: number; count: number }[]
  by_account: { id: string; name: string; spent: number; count: number }[]
  by_place: { name: string; spent: number; count: number }[]
  recent: { id: string; date: string }[]
  accounts: { id: string; name: string; type: string; balance_paise: number; outstanding_paise: number | null }[]
}

let a: TestUser, b: TestUser
let cash: string, bank: string, card: string, food: string, travel: string

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}

const dash = async (u: TestUser, month: string, today: string, filters: Record<string, unknown> = {}) =>
  (await must(u.client.rpc('dashboard_summary', { p_month: month, p_today: today, p_filters: filters } as never))) as unknown as Dash

// PostgREST bulk insert sends null for keys missing from some rows, so default for_other_paise explicitly
const ins = (u: TestUser, rows: Record<string, unknown>[]) =>
  must(u.client.from('transactions').insert(rows.map((r) => ({ for_other_paise: 0, ...r })) as never))

beforeAll(async () => {
  a = await makeUser('dash-a')
  b = await makeUser('dash-b')
  cash = (await must(a.client.from('accounts').select('id').eq('name', 'Cash').single()))!.id
  bank = (await must(a.client.from('accounts').insert({ name: 'Bank', type: 'bank', opening_balance_paise: 100_000 }).select('id').single()))!.id
  card = (await must(a.client.from('accounts').insert({ name: 'Card', type: 'credit_card', credit_limit_paise: 5_000_000 }).select('id').single()))!.id
  const cats = (await must(a.client.from('categories').select('id,name')))!
  food = cats.find((c) => c.name === 'Food')!.id
  travel = cats.find((c) => c.name === 'Travel')!.id
}, 30_000)

afterAll(async () => {
  await Promise.all([a, b].map((u) => u && deleteUser(u.id)))
})

describe('dashboard_summary', () => {
  beforeAll(async () => {
    await ins(a, [
      { kind: 'expense', amount_paise: 30_000, for_other_paise: 10_000, date: '2026-11-01', account_id: cash, category_id: food, title: 'Dinner', place: 'Cafe' },
      { kind: 'expense', amount_paise: 20_000, date: '2026-11-30', account_id: bank, category_id: travel, title: 'Cab', place: ' cafe ' },
      { kind: 'expense', amount_paise: 5_000, date: '2026-11-05', account_id: card, title: 'Misc' },
      { kind: 'income', amount_paise: 900_000, date: '2026-11-03', account_id: bank, title: 'Pay' },
      { kind: 'transfer', amount_paise: 70_000, date: '2026-11-04', account_id: bank, to_account_id: cash },
      { kind: 'debt_out', amount_paise: 40_000, date: '2026-11-04', account_id: cash },
      // previous month and neighbours
      { kind: 'expense', amount_paise: 12_000, date: '2026-10-31', account_id: cash, category_id: food },
      { kind: 'income', amount_paise: 50_000, date: '2026-10-01', account_id: bank },
      { kind: 'expense', amount_paise: 99_000, date: '2026-12-01', account_id: cash },
    ])
  })

  it('totals: spent excludes for_other, transfers and debts; month edges are inclusive', async () => {
    const d = await dash(a, '2026-11', '2026-11-05')
    expect(d.month.spent).toBe(20_000 + 20_000 + 5_000)
    expect(d.month.received).toBe(900_000)
    expect(d.month.saved).toBe(900_000 - 45_000)
    expect(d.month.prev_spent).toBe(12_000)
    expect(d.month.prev_received).toBe(50_000)
    expect(d.month.count).toBe(4)
  })

  it('daily series is zero-filled for every day and sums to the month', async () => {
    const d = await dash(a, '2026-11', '2026-11-05')
    expect(d.daily).toHaveLength(30)
    expect(d.daily[0]).toEqual({ date: '2026-11-01', spent: 20_000, received: 0 })
    expect(d.daily[29]?.spent).toBe(20_000)
    expect(d.daily.reduce((s, x) => s + x.spent, 0)).toBe(d.month.spent)
    expect(d.daily.reduce((s, x) => s + x.received, 0)).toBe(d.month.received)
  })

  it('breakdowns each sum to spent; places merge case/whitespace; uncategorised is named', async () => {
    const d = await dash(a, '2026-11', '2026-11-05')
    for (const list of [d.by_category, d.by_account, d.by_place]) expect(list.reduce((s, x) => s + x.spent, 0)).toBe(d.month.spent)
    expect(d.by_place.find((p) => p.name.toLowerCase().trim() === 'cafe')?.spent).toBe(40_000)
    expect(d.by_place.find((p) => p.name === 'No place')?.spent).toBe(5_000)
    expect(d.by_category.find((c) => c.id === null)?.name).toBe('Uncategorised')
    expect(d.by_category[0]?.spent).toBeGreaterThanOrEqual(d.by_category[1]?.spent ?? 0)
  })

  it('projection and elapsed days are driven by p_today', async () => {
    const cur = await dash(a, '2026-11', '2026-11-10')
    expect(cur.month.days_elapsed).toBe(10)
    expect(cur.month.projected_spent).toBe(Math.round((45_000 / 10) * 30))
    expect(cur.month.avg_daily_spent).toBe(4_500)
    expect((await dash(a, '2026-11', '2026-11-02')).month.projected_spent).toBeNull() // < 3 days
    const past = await dash(a, '2026-11', '2026-12-15')
    expect(past.month.days_elapsed).toBe(30)
    expect(past.month.projected_spent).toBeNull()
    const future = await dash(a, '2026-11', '2026-10-15')
    expect(future.month.days_elapsed).toBe(0)
    expect(future.month.avg_daily_spent).toBeNull()
  })

  it('handles leap February and Dec → Jan boundaries', async () => {
    expect((await dash(a, '2028-02', '2028-02-10')).daily).toHaveLength(29)
    expect((await dash(a, '2026-02', '2026-02-10')).daily).toHaveLength(28)
    await ins(a, [{ kind: 'expense', amount_paise: 7_000, date: '2025-12-31', account_id: cash }])
    expect((await dash(a, '2026-01', '2026-01-05')).month.prev_spent).toBe(7_000)
  })

  it('recent = 5 newest in the month; accounts exclude archived and include balances', async () => {
    const d = await dash(a, '2026-11', '2026-11-05')
    expect(d.recent.length).toBeLessThanOrEqual(5)
    expect(d.recent.every((r) => r.date >= '2026-11-01' && r.date <= '2026-11-30')).toBe(true)
    expect(d.recent[0]?.date).toBe('2026-11-30')
    const arch = (await must(a.client.from('accounts').insert({ name: 'Old', type: 'bank', archived: true }).select('id').single()))!.id
    const d2 = await dash(a, '2026-11', '2026-11-05')
    expect(d2.accounts.some((x) => x.id === arch)).toBe(false)
    expect(d2.accounts.find((x) => x.id === card)?.outstanding_paise).toBe(5_000)
    expect(d2.accounts.find((x) => x.id === bank)?.balance_paise).toBe(100_000 + 900_000 + 50_000 - 20_000 - 70_000) // incl. October income
  })

  it('filters apply to every card and replace any from/to', async () => {
    const byAcc = await dash(a, '2026-11', '2026-11-05', { accounts: [cash] })
    expect(byAcc.month.spent).toBe(20_000)
    const byCat = await dash(a, '2026-11', '2026-11-05', { categories: [travel] })
    expect(byCat.month.spent).toBe(20_000)
    expect(byCat.by_category).toHaveLength(1)
    const big = await dash(a, '2026-11', '2026-11-05', { min: 25_000 })
    expect(big.month.spent).toBe(20_000) // 30,000 gross dinner counts as 20,000 personal
    const ignored = await dash(a, '2026-11', '2026-11-05', { from: '2020-01-01', to: '2020-01-31' })
    expect(ignored.month.spent).toBe(45_000)
    expect((await dash(a, '2026-11', '2026-11-05', { place: 'cafe' })).month.spent).toBe(40_000)
  })

  it('rejects invalid months', async () => {
    for (const m of ['2026-13', '2026-1', 'nov', '']) {
      const { error } = await a.client.rpc('dashboard_summary', { p_month: m, p_today: '2026-11-05' } as never)
      expect(error, m).not.toBeNull()
    }
  })

  it('is isolated between users and denied to anonymous callers', async () => {
    const d = await dash(b, '2026-11', '2026-11-05')
    expect(d.month.spent).toBe(0)
    expect(d.recent).toEqual([])
    expect(d.accounts.map((x) => x.name)).toEqual(['Cash'])
    const anon = (await import('@supabase/supabase-js')).createClient(process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
      (await import('./helpers')).ANON, { auth: { persistSession: false } })
    const { error } = await anon.rpc('dashboard_summary', { p_month: '2026-11', p_today: '2026-11-05' } as never)
    expect(error).not.toBeNull()
  })
})

describe('dashboard reconciles with Activity', () => {
  let u: TestUser
  let acc: string[]
  beforeAll(async () => {
    u = await makeUser('dash-fc')
    await must(u.client.from('accounts').insert({ name: 'Bank', type: 'bank' }))
    acc = (await must(u.client.from('accounts').select('id').order('sort').order('name')))!.map((x) => x.id)
  })
  afterAll(async () => { await deleteUser(u.id) })

  const op = fc.record({
    kind: fc.constantFrom('expense', 'income', 'transfer', 'debt_out'),
    amount: fc.integer({ min: 100, max: 500_000 }),
    other: fc.integer({ min: 0, max: 100 }),
    day: fc.integer({ min: 1, max: 31 }),
    place: fc.constantFrom('A', 'a ', 'B', null),
  })

  it('month totals and breakdown totals equal activity_summary, for random data and filters', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(op, { minLength: 1, maxLength: 25 }), fc.constantFrom({}, { min: 1_000 }, { place: 'a' }), async (ops, filters) => {
        await sql('delete from transactions where user_id = $1', [u.id])
        for (const o of ops) {
          const amount = o.amount
          await sql(
            `insert into transactions (user_id, kind, amount_paise, for_other_paise, date, account_id, to_account_id, place)
             values ($1, $2::txn_kind, $3, $4, make_date(2026, 10, least($5, 31)), $6, $7, $8)`,
            [u.id, o.kind, amount, o.kind === 'expense' ? Math.floor((amount * o.other) / 100) : 0, o.day, acc[0],
             o.kind === 'transfer' ? acc[1] : null, o.place])
        }
        const d = await dash(u, '2026-10', '2026-10-20', filters)
        const s = (await must(u.client.rpc('activity_summary', { p_filters: { ...filters, from: '2026-10-01', to: '2026-10-31' } } as never))) as unknown as
          { spent: number; received: number; net: number }
        expect(d.month.spent).toBe(s.spent)
        expect(d.month.received).toBe(s.received)
        expect(d.month.saved).toBe(s.net)
        expect(d.by_category.reduce((t, x) => t + x.spent, 0)).toBe(s.spent)
        expect(d.by_place.reduce((t, x) => t + x.spent, 0)).toBe(s.spent)
      }),
      { numRuns: 12 },
    )
  }, 120_000)
})

describe('dashboard performance with 5,000 rows', () => {
  let perf: TestUser
  beforeAll(async () => {
    perf = await makeUser('dash-perf')
    await sql(
      `insert into transactions (user_id, kind, amount_paise, date, account_id, category_id, title, place)
       select $1, case when g % 10 = 0 then 'income' else 'expense' end::txn_kind, 1000 + (g % 90000), date '2026-01-01' + (g % 300),
              (select id from accounts where user_id = $1 limit 1),
              (select id from categories where user_id = $1 and kind = 'expense' order by sort limit 1 offset (g % 12)),
              'Item ' || g, 'Place ' || (g % 40)
       from generate_series(1, 5000) g`, [perf.id])
    await sql('analyze transactions')
  }, 60_000)
  afterAll(async () => { await deleteUser(perf.id) })

  it('answers in < 150 ms', async () => {
    await dash(perf, '2026-03', '2026-03-10') // warm
    const times: number[] = []
    for (const m of ['2026-03', '2026-05', '2026-08']) {
      const t = performance.now()
      await dash(perf, m, '2026-11-05')
      times.push(performance.now() - t)
    }
    console.log(`dashboard_summary ${times.map((x) => x.toFixed(0)).join(' / ')} ms`)
    expect(Math.max(...times)).toBeLessThan(150)
  })

  it('has the (user_id, date) index the month read relies on', async () => {
    // asserting the index exists is deterministic; the planner's choice depends on table statistics that other test files change
    const idx = (await sql(`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'transactions'`)).rows.map((r) => r.indexdef as string)
    expect(idx.some((d) => /\(user_id, date DESC\)/.test(d))).toBe(true)
  })
})
