// Proves that a backup restores: dump everything, wipe the LOCAL database back to "migrations only", load the dump, compare.
//   node scripts/restore-drill.mjs        (local Supabase must be running; destroys and restores the local data)
// Steps: seed a drill account with known data -> fingerprint -> backup (--local) -> `supabase db reset` -> load data.sql -> fingerprint
// again -> the two must match and the drill account must still be able to sign in. The dump stays in backups/ if anything fails.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { backup } from './backup.mjs'

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const SERVICE = process.env.SUPABASE_SERVICE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
if (!/127\.0\.0\.1|localhost/.test(URL)) throw new Error('Refusing to run the drill against a non-local project')

const CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_money-management-web'

const TABLES = ['profiles', 'accounts', 'categories', 'people', 'transactions', 'entries', 'schedule_items', 'payments', 'notes', 'budgets', 'recurring', 'push_subscriptions', 'reminder_log', 'client_errors']

/** Row counts and an order-independent hash of every table, plus the money totals that matter. */
export async function fingerprint(db) {
  const out = { auth_users: (await db.query('select count(*)::int n from auth.users')).rows[0].n }
  for (const t of TABLES) {
    const r = await db.query(`select count(*)::int n, coalesce(md5(string_agg(md5(x::text), '' order by md5(x::text))), '') h from public.${t} x`)
    out[t] = `${r.rows[0].n}:${r.rows[0].h}`
  }
  out.balances = (await db.query(`select coalesce(sum(balance_paise), 0)::text s from public.account_balances`)).rows[0].s
  out.schedule = (await db.query(`select coalesce(sum(due_paise), 0)::text d, coalesce(sum(paid_paise), 0)::text p from public.schedule_items`)).rows[0]
  out.passwords = (await db.query(`select md5(string_agg(encrypted_password, '' order by id::text)) h from auth.users`)).rows[0].h
  return out
}

async function seedDrillAccount() {
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
  const email = `drill-${Date.now()}@restore.test`
  const password = 'Drill-pass-1'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'Drill' } })
  if (error) throw error
  const uid = data.user.id
  const db = new pg.Client({ connectionString: DB })
  await db.connect()
  const cash = (await db.query(`select id from accounts where user_id = $1 and name = 'Cash'`, [uid])).rows[0].id
  const food = (await db.query(`select id from categories where user_id = $1 and name = 'Food'`, [uid])).rows[0].id
  await db.query(`insert into transactions (user_id, kind, amount_paise, date, account_id, category_id, title) values ($1,'expense',25000,current_date,$2,$3,'Drill lunch'),($1,'income',900000,current_date,$2,null,'Drill pay')`, [uid, cash, food])
  const p = (await db.query(`insert into people (user_id, name) values ($1,'Drill Friend') returning id`, [uid])).rows[0].id
  const e = (await db.query(`insert into entries (user_id, kind, direction, person_id, title, principal_paise, start_date, total_payable_paise) values ($1,'lent','receive',$2,'Drill loan',500000,current_date,500000) returning id`, [uid, p])).rows[0].id
  await db.query(`insert into schedule_items (user_id, entry_id, seq, due_date, due_paise, paid_paise) values ($1,$2,1,current_date + 30,500000,100000)`, [uid, e])
  await db.query(`insert into payments (user_id, entry_id, amount_paise, paid_on) values ($1,$2,100000,current_date)`, [uid, e])
  await db.query(`insert into notes (user_id, kind, title, date) values ($1,'task','Drill task',current_date)`, [uid])
  await db.end()
  return { email, password }
}

export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

async function main() {
  const acct = await seedDrillAccount()
  let db = new pg.Client({ connectionString: DB }); await db.connect()
  const before = await fingerprint(db)
  await db.end()
  console.log('before:', before)

  const dir = backup({ local: true })
  const data = join(dir, 'data.sql')
  console.log(`\nbackup in ${dir}; wiping the local database back to migrations only…`)
  execFileSync('supabase', ['db', 'reset'], { stdio: 'inherit' })

  db = new pg.Client({ connectionString: DB }); await db.connect()
  const empty = await fingerprint(db)
  if (empty.transactions.startsWith('0:') === false) throw new Error('the reset did not empty the database')
  await db.end()
  // COPY data cannot go through a normal query: stream the file into psql inside the database container. The dump itself
  // switches triggers off first (the sign-up trigger would otherwise create profiles that the dump also contains).
  execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], { input: readFileSync(data), stdio: ['pipe', 'inherit', 'inherit'] })

  db = new pg.Client({ connectionString: DB }); await db.connect()
  const after = await fingerprint(db)
  await db.end()
  console.log('after: ', after)

  const bad = Object.keys(before).filter((k) => !same(before[k], after[k]))
  if (bad.length) { console.error(`\n✗ restore does not match for: ${bad.join(', ')}\n  the dump is kept in ${dir}`); process.exit(1) }

  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword(acct)
  if (error) { console.error(`\n✗ the restored account cannot sign in: ${error.message}`); process.exit(1) }
  console.log('\n✓ restore matches: every table, balances, schedule totals, password hashes; the drill account signs in')
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
