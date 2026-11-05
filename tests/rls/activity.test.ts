import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteUser, makeUser, sql, type TestUser } from './helpers'

let a: TestUser, b: TestUser
let cash: string, bank: string, card: string, food: string, travel: string, salary: string

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}

const add = (u: TestUser, o: Record<string, unknown>) =>
  u.client.rpc('quick_add_transaction', {
    p_id: crypto.randomUUID(), p_kind: 'expense', p_amount: 10000, p_date: '2026-11-05', p_account: cash, ...o,
  } as never)

const balance = async (u: TestUser, id: string) =>
  (await must(u.client.from('account_balances').select('*').eq('account_id', id).single()))!

beforeAll(async () => {
  a = await makeUser('act-a')
  b = await makeUser('act-b')
  const accounts = (await must(a.client.from('accounts').select('id,name,type')))!
  cash = accounts.find((x) => x.name === 'Cash')!.id
  bank = (await must(a.client.from('accounts').insert({ name: 'Bank', type: 'bank', opening_balance_paise: 1_000_000 }).select('id').single()))!.id
  card = (await must(a.client.from('accounts').insert({ name: 'HDFC Card', type: 'credit_card', credit_limit_paise: 10_000_000 }).select('id').single()))!.id
  const cats = (await must(a.client.from('categories').select('id,name,kind')))!
  food = cats.find((c) => c.name === 'Food')!.id
  travel = cats.find((c) => c.name === 'Travel')!.id
  salary = cats.find((c) => c.name === 'Salary')!.id
})

afterAll(async () => {
  await Promise.all([a, b].map((u) => u && deleteUser(u.id)))
})

describe('signup seeds', () => {
  it('creates a Cash account for new users', async () => {
    const accs = (await must(b.client.from('accounts').select('name,type')))!
    expect(accs).toEqual([{ name: 'Cash', type: 'cash' }])
  })
})

describe('balances', () => {
  it('expense, income and transfers move balances correctly', async () => {
    await must(add(a, { p_kind: 'expense', p_amount: 25_000, p_account: bank, p_category: food, p_title: 'Lunch' }))
    await must(add(a, { p_kind: 'income', p_amount: 500_000, p_account: bank, p_category: salary, p_title: 'Pay' }))
    await must(add(a, { p_kind: 'transfer', p_amount: 100_000, p_account: bank, p_to_account: cash }))
    expect((await balance(a, bank)).balance_paise).toBe(1_000_000 - 25_000 + 500_000 - 100_000)
    expect((await balance(a, cash)).balance_paise).toBe(100_000)
  })

  it('credit card: outstanding and bill payment (transfer Bank -> Card)', async () => {
    await must(add(a, { p_kind: 'expense', p_amount: 3_000_000, p_account: card, p_category: travel, p_title: 'Flights' }))
    let c = await balance(a, card)
    expect(c.outstanding_paise).toBe(3_000_000)
    expect(c.balance_paise).toBe(-3_000_000)
    expect(c.credit_limit_paise).toBe(10_000_000)
    await must(add(a, { p_kind: 'transfer', p_amount: 1_000_000, p_account: bank, p_to_account: card }))
    c = await balance(a, card)
    expect(c.outstanding_paise).toBe(2_000_000)
  })

  it('outstanding is null for non-card accounts and never negative on overpayment', async () => {
    expect((await balance(a, cash)).outstanding_paise).toBeNull()
    await must(add(a, { p_kind: 'transfer', p_amount: 9_000_000, p_account: bank, p_to_account: card }))
    expect((await balance(a, card)).outstanding_paise).toBe(0)
  })

  it('debt_in / debt_out count toward balances but not spending', async () => {
    const acc = (await must(a.client.from('accounts').insert({ name: 'UPI', type: 'upi' }).select('id').single()))!.id
    await must(a.client.from('transactions').insert([
      { kind: 'debt_out', amount_paise: 40_000, date: '2026-11-01', account_id: acc },
      { kind: 'debt_in', amount_paise: 15_000, date: '2026-11-02', account_id: acc },
    ]))
    expect((await balance(a, acc)).balance_paise).toBe(-25_000)
    const s = (await must(a.client.rpc('activity_summary', { p_filters: { accounts: [acc] } })))! as { spent: number; received: number }
    expect(s.spent).toBe(0)
    expect(s.received).toBe(0)
  })

  it('a user only sees their own balances', async () => {
    expect((await must(b.client.from('account_balances').select('account_id').eq('account_id', cash)))).toEqual([])
  })
})

describe('quick_add_transaction', () => {
  it('validates input', async () => {
    const bad = async (o: Record<string, unknown>) => (await add(a, o)).error?.message ?? ''
    expect(await bad({ p_amount: 0 })).toMatch(/greater than zero/)
    expect(await bad({ p_amount: -5 })).toMatch(/greater than zero/)
    expect(await bad({ p_kind: 'debt_out' })).toMatch(/Unsupported/)
    expect(await bad({ p_kind: 'transfer', p_to_account: null })).toMatch(/two different accounts/)
    expect(await bad({ p_kind: 'transfer', p_to_account: cash })).toMatch(/two different accounts/)
    expect(await bad({ p_account: crypto.randomUUID() })).toMatch(/Account not found/)
    expect(await bad({ p_kind: 'income', p_category: food })).toMatch(/does not match/)
    expect(await bad({ p_category: crypto.randomUUID() })).toMatch(/Category not found/)
  })

  it("rejects another user's account, category and destination", async () => {
    expect((await add(b, { p_account: cash })).error?.message).toMatch(/Account not found/)
    const bcash = (await must(b.client.from('accounts').select('id').eq('name', 'Cash').single()))!.id
    expect((await add(b, { p_account: bcash, p_category: food })).error?.message).toMatch(/Category not found/)
    expect((await add(b, { p_kind: 'transfer', p_account: bcash, p_to_account: cash })).error?.message).toMatch(/Destination/)
  })

  it('is idempotent on the client-supplied id', async () => {
    const id = crypto.randomUUID()
    const first = await must(add(a, { p_id: id, p_amount: 7_700, p_title: 'once' }))
    const again = await must(add(a, { p_id: id, p_amount: 7_700, p_title: 'once' }))
    expect((first as { id: string }).id).toBe((again as { id: string }).id)
    expect((await must(a.client.from('transactions').select('id').eq('id', id)))!).toHaveLength(1)
  })

  it("an id already used by another user is rejected, not leaked", async () => {
    const id = crypto.randomUUID()
    await must(add(a, { p_id: id }))
    const bcash = (await must(b.client.from('accounts').select('id').eq('name', 'Cash').single()))!.id
    const r = await add(b, { p_id: id, p_account: bcash })
    expect(r.error?.message).toMatch(/already in use/)
  })

  it('normalises blanks, clears category on transfers and to_account on others', async () => {
    const t = (await must(add(a, { p_title: '  ', p_place: ' Cafe ', p_to_account: bank, p_category: food }))) as Record<string, unknown>
    expect(t).toMatchObject({ title: null, place: 'Cafe', to_account_id: null, category_id: food })
    const tr = (await must(add(a, { p_kind: 'transfer', p_account: cash, p_to_account: bank, p_category: food }))) as Record<string, unknown>
    expect(tr.category_id).toBeNull()
  })
})

describe('search and filters', () => {
  beforeAll(async () => {
    const rows = [
      ['2026-10-02', 'expense', 12_000, 'Chai', 'Cafe Blue', food, cash, ['work']],
      ['2026-10-15', 'expense', 90_000, 'Taxi', 'Airport', travel, bank, ['trip', 'work']],
      ['2026-10-31', 'income', 700_000, 'Bonus', null, salary, bank, []],
      ['2026-11-01', 'expense', 45_000, 'Dinner', 'Spice Hub', food, card, ['family']],
    ] as const
    for (const [d, k, amt, title, place, cat, acc, tags] of rows)
      await must(add(a, { p_date: d, p_kind: k, p_amount: amt, p_title: title, p_place: place, p_category: cat, p_account: acc, p_tags: tags }))
  })
  const search = async (f: Record<string, unknown>, limit = 200) =>
    (await must(a.client.rpc('search_transactions', { p_filters: f, p_limit: limit } as never)))! as { title: string; amount_paise: number }[]
  const titles = async (f: Record<string, unknown>) => (await search(f)).map((r) => r.title)

  it('date range', async () => {
    expect(await titles({ from: '2026-10-01', to: '2026-10-31', q: 'a' })).toEqual(expect.arrayContaining(['Chai', 'Taxi', 'Bonus']))
    expect((await titles({ from: '2026-10-01', to: '2026-10-31' })).includes('Dinner')).toBe(false)
  })
  it('kinds, accounts, categories', async () => {
    expect(await titles({ kinds: ['income'], from: '2026-10-01', to: '2026-10-31' })).toEqual(['Bonus'])
    expect(await titles({ accounts: [card], categories: [food] })).toEqual(['Dinner'])
    expect(await titles({ categories: [travel] })).toEqual(['Flights', 'Taxi'])
  })
  it('amount range, place, tag', async () => {
    expect(await titles({ min: 80_000, max: 100_000, from: '2026-10-01', to: '2026-10-31' })).toEqual(['Taxi'])
    expect(await titles({ place: 'spice' })).toEqual(['Dinner'])
    expect(await titles({ tag: 'work' })).toEqual(['Taxi', 'Chai'])
  })
  it('free text covers title, place, notes, tags, account and category names', async () => {
    expect(await titles({ q: 'chai' })).toEqual(['Chai'])
    expect(await titles({ q: 'airport' })).toEqual(['Taxi'])
    expect(await titles({ q: 'family' })).toEqual(['Dinner'])
    expect(await titles({ q: 'hdfc' })).toEqual(expect.arrayContaining(['Dinner', 'Flights']))
    expect(await titles({ q: 'travel' })).toEqual(expect.arrayContaining(['Taxi', 'Flights']))
    expect(await titles({ q: 'zzzz-nothing' })).toEqual([])
  })
  it('transfers match on either account', async () => {
    const hit = (await search({ kinds: ['transfer'], accounts: [card] })).length
    expect(hit).toBeGreaterThanOrEqual(2)
  })
  it('sorts newest first and keyset pagination has no gaps or duplicates', async () => {
    const all = (await search({}, 200)) as unknown as { id: string; date: string; created_at: string }[]
    expect(all.length).toBeGreaterThan(8)
    expect([...all].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0)).map((r) => r.id)).toEqual(all.map((r) => r.id))
    const seen: string[] = []
    let cursor: unknown = null
    for (let i = 0; i < 50; i++) {
      const page = (await must(a.client.rpc('search_transactions', { p_filters: {}, p_limit: 3, p_cursor: cursor } as never)))! as unknown as { id: string; date: string; created_at: string }[]
      if (page.length === 0) break
      seen.push(...page.map((r) => r.id))
      const last = page[page.length - 1]!
      cursor = { date: last.date, created_at: last.created_at, id: last.id }
    }
    expect(seen).toEqual(all.map((r) => r.id))
    expect(new Set(seen).size).toBe(seen.length)
  })
  it("never returns another user's rows", async () => {
    expect((await must(b.client.rpc('search_transactions', { p_filters: {}, p_limit: 50 } as never)))!).toEqual([])
  })
})

describe('activity_summary', () => {
  it('spent excludes the part paid for others; transfers are not spending', async () => {
    const ua = await makeUser('sum')
    try {
      const acc = (await must(ua.client.from('accounts').select('id').eq('name', 'Cash').single()))!.id
      await must(ua.client.from('transactions').insert([
        { kind: 'expense', amount_paise: 500_000, for_other_paise: 400_000, date: '2026-11-03', account_id: acc },
        { kind: 'expense', amount_paise: 20_000, for_other_paise: 0, date: '2026-11-04', account_id: acc },
        { kind: 'income', amount_paise: 100_000, for_other_paise: 0, date: '2026-11-04', account_id: acc },
        { kind: 'expense', amount_paise: 99_000, for_other_paise: 0, date: '2026-10-04', account_id: acc },
      ]))
      const s = (await must(ua.client.rpc('activity_summary', { p_filters: { from: '2026-11-01', to: '2026-11-30' } })))! as
        { spent: number; received: number; net: number; by_account: { name: string; spent: number; received: number }[] }
      expect(s).toMatchObject({ spent: 120_000, received: 100_000, net: -20_000 })
      expect(s.by_account).toEqual([{ account_id: acc, name: 'Cash', spent: 120_000, received: 100_000 }])
      const empty = (await must(ua.client.rpc('activity_summary', { p_filters: { from: '2030-01-01' } })))! as { spent: number; by_account: unknown[] }
      expect(empty).toMatchObject({ spent: 0, by_account: [] })
    } finally {
      await deleteUser(ua.id)
    }
  })
})

describe('title_suggestions', () => {
  it('returns the last category/account/place for a title, most-used first, escaping wildcards', async () => {
    await must(add(a, { p_title: 'Coffee', p_category: food, p_place: 'Old Place', p_date: '2026-09-01' }))
    await must(add(a, { p_title: 'coffee', p_category: food, p_account: bank, p_place: 'New Place', p_date: '2026-09-05' }))
    await must(add(a, { p_title: 'Cookies', p_category: food, p_date: '2026-09-06' }))
    const s = (await must(a.client.rpc('title_suggestions', { p_prefix: 'co' })))! as { title: string; account_id: string; place: string; uses: number }[]
    expect(s[0]).toMatchObject({ title: 'coffee', account_id: bank, place: 'New Place', uses: 2 })
    expect(s.map((x) => x.title)).toContain('Cookies')
    expect((await must(a.client.rpc('title_suggestions', { p_prefix: '%' })))!).toEqual([])
    expect((await must(a.client.rpc('title_suggestions', { p_prefix: '  ' })))!).toEqual([])
    expect((await must(b.client.rpc('title_suggestions', { p_prefix: 'co' })))!).toEqual([])
  })
})

describe('updated_at trigger', () => {
  it('moves forward on update', async () => {
    const t = (await must(add(a, { p_title: 'touch' }))) as { id: string; updated_at: string }
    await new Promise((r) => setTimeout(r, 20))
    const u = (await must(a.client.from('transactions').update({ title: 'touched' }).eq('id', t.id).select('updated_at').single()))!
    expect(new Date(u.updated_at).getTime()).toBeGreaterThan(new Date(t.updated_at).getTime())
  })
})

describe('performance with 5,000 rows', () => {
  let perf: TestUser
  beforeAll(async () => {
    perf = await makeUser('perf')
    await sql(
      `insert into transactions (user_id, kind, amount_paise, date, account_id, category_id, title, place, tags)
       select $1, 'expense', 1000 + (g % 90000), date '2026-01-01' + (g % 300),
              (select id from accounts where user_id = $1 limit 1),
              (select id from categories where user_id = $1 and kind = 'expense' order by sort limit 1 offset (g % 12)),
              'Item ' || g, 'Place ' || (g % 40), array['t' || (g % 7)]
       from generate_series(1, 5000) g`, [perf.id])
  }, 60_000)
  afterAll(async () => { await deleteUser(perf.id) })

  const time = async (fn: () => PromiseLike<unknown>) => { const t = performance.now(); await fn(); return performance.now() - t }

  it('search < 300 ms (free text and page of 50)', async () => {
    await perf.client.rpc('search_transactions', { p_filters: {}, p_limit: 50 } as never) // warm
    const plain = await time(() => perf.client.rpc('search_transactions', { p_filters: {}, p_limit: 50 } as never))
    const text = await time(() => perf.client.rpc('search_transactions', { p_filters: { q: 'item 49' }, p_limit: 50 } as never))
    console.log(`search plain ${plain.toFixed(0)} ms, text ${text.toFixed(0)} ms`)
    expect(plain).toBeLessThan(300)
    expect(text).toBeLessThan(300)
  })
  it('summary < 150 ms', async () => {
    await perf.client.rpc('activity_summary', { p_filters: {} } as never)
    const ms = await time(() => perf.client.rpc('activity_summary', { p_filters: { from: '2026-03-01', to: '2026-03-31' } } as never))
    console.log(`summary ${ms.toFixed(0)} ms`)
    expect(ms).toBeLessThan(150)
  })
  it('count is right', async () => {
    const { count } = await perf.client.from('transactions').select('id', { count: 'exact', head: true })
    expect(count).toBe(5000)
  })
})
