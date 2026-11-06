import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteUser, makeUser, sql, type TestUser } from './helpers'

/** scripts/health.sql against clean data (all problem rows 0) and against deliberately broken data (each break is named). */
const FILE = readFileSync(join(process.cwd(), 'scripts/health.sql'), 'utf8')

let u: TestUser
let cash: string, entry: string, person: string

async function report(uid = u.id) {
  const r = (await sql(FILE.replace('select null::uuid as uid', `select '${uid}'::uuid as uid`))).rows as { kind: string; check_name: string; n: string | number; status: string }[]
  return Object.fromEntries(r.map((x) => [x.check_name, { kind: x.kind, n: Number(x.n), status: x.status }]))
}
const problems = async () => Object.entries(await report()).filter(([, v]) => v.kind === 'problem' && v.n > 0).map(([k]) => k)

beforeAll(async () => {
  u = await makeUser('health')
  cash = (await sql(`select id from accounts where user_id = $1 and name = 'Cash'`, [u.id])).rows[0].id
  person = (await sql(`insert into people (user_id, name) values ($1, 'Friend') returning id`, [u.id])).rows[0].id
  await sql(`insert into transactions (user_id, kind, amount_paise, date, account_id, title) values ($1, 'expense', 25000, current_date, $2, 'Lunch'), ($1, 'income', 900000, current_date, $2, 'Pay')`, [u.id, cash])
  entry = (await sql(`insert into entries (user_id, kind, direction, person_id, title, principal_paise, start_date, total_payable_paise)
                      values ($1, 'lent', 'receive', $2, 'Loan', 300000, current_date, 300000) returning id`, [u.id, person])).rows[0].id
  const rows = [[1, 100000, 100000], [2, 100000, 0], [3, 100000, 0]]
  for (const [seq, due, paid] of rows) await sql(`insert into schedule_items (user_id, entry_id, seq, due_date, due_paise, paid_paise) values ($1,$2,$3,current_date + $3 * 30,$4,$5)`, [u.id, entry, seq, due, paid])
  await sql(`insert into payments (user_id, entry_id, amount_paise, paid_on) values ($1, $2, 100000, current_date)`, [u.id, entry])
}, 30_000)
afterAll(async () => { if (u) await deleteUser(u.id) })

describe('scripts/health.sql', () => {
  it('reports every check, and clean data has no problems', async () => {
    const r = await report()
    expect(Object.keys(r).length).toBe(13)
    expect(await problems()).toEqual([])
    expect(Object.values(r).filter((v) => v.kind === 'problem').every((v) => v.status === 'ok')).toBe(true)
  })

  it('problems come first, info rows after', async () => {
    const rows = (await sql(FILE.replace('select null::uuid as uid', `select '${u.id}'::uuid as uid`))).rows as { kind: string }[]
    const firstInfo = rows.findIndex((r) => r.kind === 'info')
    expect(rows.slice(0, firstInfo).every((r) => r.kind === 'problem')).toBe(true)
    expect(rows.slice(firstInfo).every((r) => r.kind === 'info')).toBe(true)
  })

  const breakIt = async (name: string, breakSql: string, params: unknown[], fixSql: string, fixParams: unknown[] = params) => {
    await sql(breakSql, params)
    const flagged = await problems()
    expect(flagged, name).toContain(name)
    await sql(fixSql, fixParams)
    expect(await problems(), `${name} fixed`).toEqual([])
  }

  it('flags an expense with no account', () =>
    breakIt('expenses, income or transfers with no account', `update transactions set account_id = null where user_id = $1 and title = 'Lunch'`, [u.id],
      `update transactions set account_id = $2 where user_id = $1 and title = 'Lunch'`, [u.id, cash]))

  it('flags a transfer to the same account', async () => {
    const id = (await sql(`insert into transactions (user_id, kind, amount_paise, date, account_id, to_account_id) values ($1, 'transfer', 100, current_date, $2, $2) returning id`, [u.id, cash])).rows[0].id
    expect(await problems()).toContain('transfers from an account to itself')
    await sql(`delete from transactions where id = $1`, [id])
    expect(await problems()).toEqual([])
  })

  it('flags a row paid more than due', () =>
    breakIt('instalment rows paid more than they are due', `update schedule_items set paid_paise = due_paise + 1 where entry_id = $1 and seq = 1`, [entry],
      `update schedule_items set paid_paise = due_paise where entry_id = $1 and seq = 1`))

  it('flags rows that do not add up to the total payable', () =>
    breakIt('entries whose rows do not add up to the total payable', `update entries set total_payable_paise = 1 where id = $1`, [entry],
      `update entries set total_payable_paise = 300000 where id = $1`))

  it('flags a settled entry with an unpaid row, and an open one with everything paid', async () => {
    await sql(`update entries set status = 'settled' where id = $1`, [entry])
    expect(await problems()).toContain('settled entries that still have an unpaid row')
    await sql(`update entries set status = 'open' where id = $1`, [entry])
    await sql(`update schedule_items set paid_paise = due_paise where entry_id = $1`, [entry])
    await sql(`update payments set amount_paise = 300000 where entry_id = $1`, [entry]) // keep payments consistent so only this check fires
    expect(await problems()).toEqual(['open entries where every row is already paid'])
    await sql(`update schedule_items set paid_paise = 0 where entry_id = $1 and seq > 1`, [entry])
    await sql(`update payments set amount_paise = 100000 where entry_id = $1`, [entry])
    expect(await problems()).toEqual([])
  })

  it('flags payments that differ from what the rows say was paid', () =>
    breakIt('entries whose recorded payments differ from what the rows say was paid', `update payments set amount_paise = 5 where entry_id = $1`, [entry],
      `update payments set amount_paise = 100000 where entry_id = $1`))

  it('flags a "for others" amount that the friends’ entries do not add up to', async () => {
    const t = (await sql(`insert into transactions (user_id, kind, amount_paise, for_other_paise, date, account_id, title) values ($1, 'expense', 1000, 400, current_date, $2, 'Shared') returning id`, [u.id, cash])).rows[0].id
    expect(await problems()).toContain("purchases paid for friends whose \"for others\" amount differs from the friends' entries")
    await sql(`update transactions set for_other_paise = 0 where id = $1`, [t])
    expect(await problems()).toEqual([])
    await sql(`delete from transactions where id = $1`, [t])
  })

  it('info rows count what they say', async () => {
    await sql(`insert into transactions (user_id, kind, amount_paise, date, account_id, title) values ($1, 'expense', 9000000, current_date, $2, 'Big')`, [u.id, cash])
    await sql(`insert into reminder_log (user_id, key, sent_at) values ($1, 'k1', now()), ($1, 'k2', null)`, [u.id])
    await sql(`update reminder_log set claimed_at = now() - interval '2 hours' where user_id = $1 and key = 'k2'`, [u.id])
    await sql(`insert into client_errors (user_id, kind, message) values ($1, 'error', 'x')`, [u.id])
    const r = await report()
    expect(r['cash, bank, UPI and wallet accounts below zero']!.n).toBe(1)
    expect(r['reminders sent in the last 7 days']!.n).toBe(1)
    expect(r['reminders claimed but never confirmed (older than 1 hour)']!.n).toBe(1)
    expect(r['app errors logged in the last 7 days']!.n).toBe(1)
    expect(await problems()).toEqual([]) // info rows never count as problems
  })

  it('without a user filter it looks at every user', async () => {
    const all = (await sql(FILE)).rows as { check_name: string; n: string }[]
    expect(all.length).toBe(13)
  })
})
