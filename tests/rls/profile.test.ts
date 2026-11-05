import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteUser, makeUser, sql, type TestUser } from './helpers'

let a: TestUser, b: TestUser

beforeAll(async () => { a = await makeUser('prof-a'); b = await makeUser('prof-b') })
afterAll(async () => { await Promise.all([a, b].map((u) => u && deleteUser(u.id))) })

const update = (u: TestUser, patch: Record<string, unknown>) => u.client.from('profiles').update(patch as never).eq('id', u.id).select().single()

describe('profile values the app understands', () => {
  it('accepts every valid choice', async () => {
    for (const patch of [
      { number_format: 'western' }, { number_format: 'indian' },
      { date_format: 'MMM dd, yyyy' }, { date_format: 'dd/MM/yyyy' }, { date_format: 'yyyy-MM-dd' }, { date_format: 'dd MMM yyyy' },
      { week_starts_on: 0 }, { week_starts_on: 1 }, { summary_mode: 'daily' }, { summary_mode: 'weekly', summary_weekday: 6 }, { summary_mode: 'off', summary_weekday: null },
      { theme: 'dark' }, { theme: 'light' }, { theme: 'system' }, { timezone: 'America/New_York' }, { timezone: 'UTC' }, { timezone: 'Asia/Kolkata' }, { name: 'A'.repeat(60) }, { name: null },
    ]) {
      const { error } = await update(a, patch)
      expect(error, JSON.stringify(patch)).toBeNull()
    }
  })

  it('refuses everything else, and nothing is changed', async () => {
    const before = (await sql(`select number_format, date_format, week_starts_on, summary_mode, theme, timezone, currency, name from profiles where id = $1`, [a.id])).rows[0]
    for (const patch of [
      { number_format: 'european' }, { date_format: 'd/M/yy' }, { week_starts_on: 2 }, { week_starts_on: -1 }, { summary_mode: 'hourly' }, { summary_weekday: 7 }, { summary_weekday: -1 },
      { theme: 'sepia' }, { timezone: 'Nowhere/Land' }, { timezone: '' }, { currency: 'USD' }, { name: 'A'.repeat(61) },
    ]) {
      const { error } = await update(a, patch)
      expect(error, JSON.stringify(patch)).not.toBeNull()
    }
    expect((await sql(`select number_format, date_format, week_starts_on, summary_mode, theme, timezone, currency, name from profiles where id = $1`, [a.id])).rows[0]).toEqual(before)
  })

  it('a user can only change their own profile', async () => {
    const r = await b.client.from('profiles').update({ name: 'Hijacked' } as never).eq('id', a.id).select()
    expect(r.data).toEqual([])
    expect((await sql(`select name from profiles where id = $1`, [a.id])).rows[0].name).not.toBe('Hijacked')
  })

  it('new sign-ups get valid defaults', async () => {
    const p = (await sql(`select number_format, date_format, week_starts_on, summary_mode, theme, timezone, currency from profiles where id = $1`, [b.id])).rows[0]
    expect(p).toEqual({ number_format: 'indian', date_format: 'dd MMM yyyy', week_starts_on: 1, summary_mode: 'off', theme: 'system', timezone: 'Asia/Kolkata', currency: 'INR' })
  })

  it('is_valid_timezone', async () => {
    const v = async (t: string) => (await sql(`select public.is_valid_timezone($1) as ok`, [t])).rows[0].ok
    expect(await v('Europe/London')).toBe(true)
    expect(await v('Mars/Olympus')).toBe(false)
    expect(await v('')).toBe(false)
  })
})
