// Backs up the database to backups/<UTC timestamp>/ : schema.sql, data.sql (auth + public, COPY format), SHA256SUMS.
//   node scripts/backup.mjs            the linked cloud project (needs `supabase link` and SUPABASE_DB_PASSWORD, or it asks)
//   node scripts/backup.mjs --local    the local stack
// The free Supabase plan has no automatic backups: run this weekly and before every `supabase db push`.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** "2026-11-06T09-30-00Z" (UTC, safe in file names). */
export const stamp = (d = new Date()) => d.toISOString().replace(/\.\d+Z$/, 'Z').replaceAll(':', '-')

/** The sha256 line format `sha256sum -c` understands. */
export const sumsLine = (hex, file) => `${hex}  ${file}`

export function backup({ local = false, root = 'backups', now = new Date(), run = (args) => execFileSync('supabase', args, { stdio: 'inherit' }) } = {}) {
  const target = local ? ['--local'] : ['--linked']
  const dir = join(root, stamp(now))
  mkdirSync(dir, { recursive: true })
  run(['db', 'dump', ...target, '-f', join(dir, 'schema.sql')])
  run(['db', 'dump', ...target, '--data-only', '--use-copy', '-s', 'auth,public', '-f', join(dir, 'data.sql')])
  const sums = ['schema.sql', 'data.sql'].map((f) => {
    if (statSync(join(dir, f)).size === 0) throw new Error(`${f} is empty: the dump failed`)
    return sumsLine(createHash('sha256').update(readFileSync(join(dir, f))).digest('hex'), f)
  })
  writeFileSync(join(dir, 'SHA256SUMS'), sums.join('\n') + '\n')
  return dir
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = backup({ local: process.argv.includes('--local') })
  console.log(`\nBackup written to ${dir}\nCheck it later with:  cd ${dir} && sha256sum -c SHA256SUMS\nKeep a copy somewhere other than this computer.`)
}
