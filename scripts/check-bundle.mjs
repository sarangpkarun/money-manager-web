// Fails if the initial JS (scripts referenced by dist/index.html) exceeds the gz budget,
// and if anything resembling a service-role key leaked into the bundle.
import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
import { bundleSecrets, foreignHosts } from './security.mjs'

const BUDGET = 200 * 1024
const html = await readFile('dist/index.html', 'utf8')
const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1])
let total = 0
for (const f of files) {
  const size = gzipSync(await readFile(join('dist', f))).length
  total += size
  console.log(`${f}: ${(size / 1024).toFixed(1)} KB gz`)
}
console.log(`initial JS: ${(total / 1024).toFixed(1)} KB gz (budget ${BUDGET / 1024} KB)`)

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else yield p
  }
}
let leaked = false
const supabaseUrl = process.env.VITE_SUPABASE_URL
const foreign = new Set()
for await (const p of walk('dist')) {
  if (!/\.(js|html|css|webmanifest|map)$/.test(p)) continue
  const text = await readFile(p, 'utf8')
  for (const s of bundleSecrets(text)) { console.error(`${s} found in ${p}`); leaked = true }
  for (const h of foreignHosts(text, supabaseUrl)) foreign.add(`${h} (${p})`)
}
// no trackers or third-party services: only the app's own Supabase host and documentation links may appear
for (const f of foreign) { console.error(`unexpected external host: ${f}`); leaked = true }
if (total > BUDGET || leaked) process.exit(1)
