// Runs scripts/health.sql against a database and prints the report; exits 1 if any "problem" row is not 0.
//   node scripts/health.mjs                       the local stack
//   SUPABASE_DB_URL=postgresql://… node scripts/health.mjs   another database (the cloud one: paste scripts/health.sql into the SQL editor instead)
import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const db = new pg.Client({ connectionString: url })
await db.connect()
const rows = (await db.query(readFileSync(new URL('./health.sql', import.meta.url), 'utf8'))).rows
await db.end()
for (const r of rows) console.log(`${r.kind === 'problem' ? (Number(r.n) > 0 ? '✗' : '✓') : '·'} ${String(r.n).padStart(6)}  ${r.check_name}`)
const bad = rows.filter((r) => r.kind === 'problem' && Number(r.n) > 0)
if (bad.length) { console.error(`\n${bad.length} problem(s): see docs/RUNBOOK.md, "When the numbers look wrong"`); process.exit(1) }
console.log('\nno problems found')
