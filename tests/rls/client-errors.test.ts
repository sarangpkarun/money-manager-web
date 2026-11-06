import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ANON, URL, deleteUser, makeUser, sql, type TestUser } from './helpers'

let a: TestUser, b: TestUser, unverified: TestUser

beforeAll(async () => {
  ;[a, b] = await Promise.all([makeUser('err-a'), makeUser('err-b')])
  unverified = await makeUser('err-u', false)
}, 30_000)
afterAll(async () => { await Promise.all([a, b, unverified].map((u) => u && deleteUser(u.id))) })

const log = (u: TestUser, row: Record<string, unknown> = {}) =>
  u.client.from('client_errors').insert({ kind: 'error', message: 'TypeError: x is undefined', route: '/activity', app_version: '1.0.0', ...row } as never)

describe('client_errors', () => {
  it('a user can log and read their own errors, and nobody else sees them', async () => {
    expect((await log(a)).error).toBeNull()
    const mine = await a.client.from('client_errors').select('message, route, kind')
    expect(mine.data).toEqual([{ message: 'TypeError: x is undefined', route: '/activity', kind: 'error' }])
    expect((await b.client.from('client_errors').select('id')).data).toEqual([])
  })

  it("an error cannot be filed in someone else's name", async () => {
    const { error } = await log(a, { user_id: b.id })
    expect(error).toBeTruthy()
    expect((await sql(`select count(*)::int n from client_errors where user_id = $1`, [b.id])).rows[0].n).toBe(0)
  })

  it('users who have not confirmed their email cannot write or read', async () => {
    expect((await log(unverified)).error).toBeTruthy()
    expect((await unverified.client.from('client_errors').select('id')).data ?? []).toEqual([])
  })

  it('the log cannot be edited, but the owner can clear it', async () => {
    const id = (await a.client.from('client_errors').select('id').limit(1).single()).data!.id
    const upd = await a.client.from('client_errors').update({ message: 'changed' } as never).eq('id', id)
    expect(upd.error).toBeTruthy()
    expect((await a.client.from('client_errors').delete().eq('id', id)).error).toBeNull()
  })

  it('field sizes and kinds are capped by the database', async () => {
    for (const bad of [{ message: 'x'.repeat(501) }, { stack: 'x'.repeat(4001) }, { route: 'x'.repeat(201) }, { user_agent: 'x'.repeat(301) }, { app_version: 'x'.repeat(33) }, { kind: 'custom' }]) {
      expect((await log(b, bad)).error, JSON.stringify(Object.keys(bad))).toBeTruthy()
    }
    expect((await log(b, { message: 'x'.repeat(500), stack: 'x'.repeat(4000) })).error).toBeNull()
  })

  it('a crash loop is cut off: at most 30 rows per 10 minutes per user, the rest are dropped without an error', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ kind: 'error', message: `loop ${i}` }))
    for (const r of rows) await log(b, r)
    const n = (await sql(`select count(*)::int n from client_errors where user_id = $1 and at > now() - interval '10 minutes'`, [b.id])).rows[0].n
    expect(n).toBe(30)
    // the limit is per user
    expect((await log(a, { message: 'fine' })).error).toBeNull()
    expect((await sql(`select count(*)::int n from client_errors where user_id = $1`, [a.id])).rows[0].n).toBe(1)
  })

  it('the 60-day retention statement removes only old rows', async () => {
    await sql(`insert into client_errors (user_id, kind, message, at) values ($1, 'error', 'old', now() - interval '61 days'), ($1, 'error', 'recent', now() - interval '59 days')`, [a.id])
    await sql(`delete from public.client_errors where at < now() - interval '60 days'`)
    const left = (await sql(`select message from client_errors where user_id = $1 and message in ('old', 'recent')`, [a.id])).rows.map((r) => r.message)
    expect(left).toEqual(['recent'])
  })

  it('the prune job is scheduled where pg_cron exists', async () => {
    const has = (await sql(`select to_regclass('cron.job') r`)).rows[0].r
    if (!has) return
    const j = (await sql(`select schedule, command from cron.job where jobname = 'prune-client-errors'`)).rows[0]
    expect(j.schedule).toBe('17 3 * * *')
    expect(j.command).toContain('60 days')
  })

  it('deleting the account removes the log', async () => {
    const u = await makeUser('err-del')
    await log(u)
    await deleteUser(u.id)
    expect((await sql(`select count(*)::int n from client_errors where user_id = $1`, [u.id])).rows[0].n).toBe(0)
  })
})

describe('ping', () => {
  it('answers "ok" to anyone, even without signing in, and touches no data', async () => {
    const c = createClient(URL, ANON, { auth: { persistSession: false } })
    const r = await c.rpc('ping')
    expect(r.error).toBeNull()
    expect(r.data).toBe('ok')
  })
})
