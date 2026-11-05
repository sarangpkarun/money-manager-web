// Seeds 5,000 transactions for a local test user so the Activity list can be tried at scale.
// Usage: node scripts/seed-transactions.mjs [email]   (local Supabase only: uses the public demo keys)
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE = process.env.SUPABASE_SERVICE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
if (!/127\.0\.0\.1|localhost/.test(URL)) throw new Error('Refusing to seed a non-local Supabase project')

const email = process.argv[2] ?? 'perf@test.local'
const password = 'Passw0rd!perf'
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const db = new pg.Client({ connectionString: DB })
await db.connect()

let { rows } = await db.query('select id from auth.users where email = $1', [email])
if (!rows[0]) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'Perf' } })
  if (error) throw error
  rows = [{ id: data.user.id }]
  console.log(`created ${email} / ${password}`)
}
const uid = rows[0].id
await db.query('delete from transactions where user_id = $1 and title like $2', [uid, 'Item %'])
await db.query(
  `insert into transactions (user_id, kind, amount_paise, date, account_id, category_id, title, place, tags)
   select $1, 'expense', 1000 + (g % 90000), current_date - (g % 120),
          (select id from accounts where user_id = $1 limit 1),
          (select id from categories where user_id = $1 and kind = 'expense' order by sort limit 1 offset (g % 12)),
          'Item ' || g, 'Place ' || (g % 40), array['t' || (g % 7)]
   from generate_series(1, 5000) g`, [uid])
await db.end()
console.log(`seeded 5,000 transactions for ${email} (spread over the last 120 days)`)
