// Fails if a tracked file contains a secret (private key, service_role JWT, secret key, token). Usage: node scripts/scan-secrets.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileSecrets } from './security.mjs'

const SKIP = /(^|\/)(pnpm-lock\.yaml|.*\.(png|jpg|jpeg|ico|svg|woff2?|webmanifest|tsbuildinfo))$/
let bad = 0
for (const f of execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)) {
  if (SKIP.test(f)) continue
  let text
  try { text = readFileSync(f, 'utf8') } catch { continue }
  const found = fileSecrets(text)
  if (found.length) { console.error(`✗ ${f}: ${found.join(', ')}`); bad++ }
}
if (bad) { console.error(`\n${bad} file(s) with secrets`); process.exit(1) }
console.log('secret scan: no secrets in tracked files')
