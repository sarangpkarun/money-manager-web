import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteUser, makeUser, type TestUser } from './helpers'

let a: TestUser, b: TestUser, unverified: TestUser
// ids of rows owned by A
const ids: Record<string, string> = {}

const OWNED = ['accounts', 'categories', 'people', 'transactions', 'entries', 'schedule_items', 'payments',
  'notes', 'budgets', 'recurring', 'push_subscriptions'] as const

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}

beforeAll(async () => {
  a = await makeUser('a')
  b = await makeUser('b')
  unverified = await makeUser('unv', false)

  const acc = await must(a.client.from('accounts').insert({ name: 'A bank', type: 'bank' }).select('id').single())
  ids.accounts = acc!.id
  const cat = await must(a.client.from('categories').insert({ name: 'A cat', kind: 'expense' }).select('id').single())
  ids.categories = cat!.id
  const person = await must(a.client.from('people').insert({ name: 'Arun' }).select('id').single())
  ids.people = person!.id
  const txn = await must(a.client.from('transactions').insert(
    { kind: 'expense', amount_paise: 1000, date: '2026-01-01', account_id: ids.accounts }).select('id').single())
  ids.transactions = txn!.id
  const entry = await must(a.client.from('entries').insert({
    kind: 'lent', direction: 'receive', person_id: ids.people, title: 't', principal_paise: 5000,
    start_date: '2026-01-01', total_payable_paise: 5000 }).select('id').single())
  ids.entries = entry!.id
  const si = await must(a.client.from('schedule_items').insert(
    { entry_id: ids.entries, seq: 1, due_date: '2026-02-01', due_paise: 5000 }).select('id').single())
  ids.schedule_items = si!.id
  const pay = await must(a.client.from('payments').insert(
    { entry_id: ids.entries, amount_paise: 100, paid_on: '2026-01-05' }).select('id').single())
  ids.payments = pay!.id
  const note = await must(a.client.from('notes').insert({ kind: 'note', title: 'n', date: '2026-01-01' }).select('id').single())
  ids.notes = note!.id
  const bud = await must(a.client.from('budgets').insert({ limit_paise: 1000 }).select('id').single())
  ids.budgets = bud!.id
  const rec = await must(a.client.from('recurring').insert(
    { template: {}, rule: 'monthly', next_date: '2026-02-01' }).select('id').single())
  ids.recurring = rec!.id
  const ps = await must(a.client.from('push_subscriptions').insert(
    { endpoint: `https://push.example/${crypto.randomUUID()}`, keys: {} }).select('id').single())
  ids.push_subscriptions = ps!.id
})

afterAll(async () => {
  await Promise.all([a, b, unverified].map((u) => u && deleteUser(u.id)))
})

describe('signup trigger', () => {
  it('creates a profile and 17 seeded categories', async () => {
    const prof = await must(b.client.from('profiles').select('id').eq('id', b.id))
    expect(prof).toHaveLength(1)
    const cats = (await must(b.client.from('categories').select('kind'))) ?? []
    expect(cats.filter((c) => c.kind === 'expense')).toHaveLength(12)
    expect(cats.filter((c) => c.kind === 'income')).toHaveLength(5)
  })
})

describe.each(OWNED)('isolation on %s', (table) => {
  it('B cannot read A rows', async () => {
    const { data } = await b.client.from(table).select('id').eq('id', ids[table]!)
    expect(data).toEqual([])
  })
  it('B cannot update A rows', async () => {
    const { data } = await b.client.from(table).update({ user_id: b.id }).eq('id', ids[table]!).select('id')
    expect(data ?? []).toEqual([])
  })
  it('B cannot delete A rows', async () => {
    await b.client.from(table).delete().eq('id', ids[table]!)
    const { data } = await a.client.from(table).select('id').eq('id', ids[table]!)
    expect(data).toHaveLength(1)
  })
  it('B cannot insert a row owned by A', async () => {
    const { error } = await b.client.from(table).insert(sample(table, a.id) as never)
    expect(error).not.toBeNull()
  })
})

describe('profiles isolation', () => {
  it('B cannot read or update A profile', async () => {
    const { data } = await b.client.from('profiles').select('id').eq('id', a.id)
    expect(data).toEqual([])
    const upd = await b.client.from('profiles').update({ name: 'hacked' }).eq('id', a.id).select('id')
    expect(upd.data ?? []).toEqual([])
  })
})

describe('cross-user linking', () => {
  it("B cannot attach a transaction to A's account", async () => {
    const { error } = await b.client.from('transactions').insert(
      { kind: 'expense', amount_paise: 1, date: '2026-01-01', account_id: ids.accounts })
    expect(error).not.toBeNull()
  })
  it("B cannot create an entry for A's person", async () => {
    const { error } = await b.client.from('entries').insert({ kind: 'lent', direction: 'receive',
      person_id: ids.people, title: 'x', principal_paise: 1, start_date: '2026-01-01', total_payable_paise: 1 })
    expect(error).not.toBeNull()
  })
  it("B cannot add a payment to A's entry", async () => {
    const { error } = await b.client.from('payments').insert({ entry_id: ids.entries, amount_paise: 1, paid_on: '2026-01-01' })
    expect(error).not.toBeNull()
  })
  it("B cannot add a schedule item to A's entry", async () => {
    const { error } = await b.client.from('schedule_items').insert(
      { entry_id: ids.entries, seq: 99, due_date: '2026-03-01', due_paise: 1 })
    expect(error).not.toBeNull()
  })
})

describe('unverified email gate', () => {
  it('sees no rows and cannot insert', async () => {
    const prof = await unverified.client.from('profiles').select('id')
    expect(prof.data ?? []).toEqual([])
    const cats = await unverified.client.from('categories').select('id')
    expect(cats.data ?? []).toEqual([])
    const ins = await unverified.client.from('accounts').insert({ name: 'x', type: 'cash' })
    expect(ins.error).not.toBeNull()
  })
})

/** Minimal valid row for each table, owned by `uid` (to prove B can't forge ownership). */
function sample(table: (typeof OWNED)[number], uid: string): Record<string, unknown> {
  const base = { user_id: uid }
  switch (table) {
    case 'accounts': return { ...base, name: 'x', type: 'cash' }
    case 'categories': return { ...base, name: 'x', kind: 'expense' }
    case 'people': return { ...base, name: 'x' }
    case 'transactions': return { ...base, kind: 'expense', amount_paise: 1, date: '2026-01-01' }
    case 'entries': return { ...base, kind: 'lent', direction: 'receive', title: 'x', principal_paise: 1,
      start_date: '2026-01-01', total_payable_paise: 1 }
    case 'schedule_items': return { ...base, entry_id: ids.entries, seq: 7, due_date: '2026-03-01', due_paise: 1 }
    case 'payments': return { ...base, entry_id: ids.entries, amount_paise: 1, paid_on: '2026-01-01' }
    case 'notes': return { ...base, kind: 'note', title: 'x', date: '2026-01-01' }
    case 'budgets': return { ...base, limit_paise: 1 }
    case 'recurring': return { ...base, template: {}, rule: 'monthly', next_date: '2026-02-01' }
    case 'push_subscriptions': return { ...base, endpoint: `https://push.example/${crypto.randomUUID()}`, keys: {} }
  }
}
