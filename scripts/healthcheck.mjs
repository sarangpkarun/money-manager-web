// Is the deployed app up? Used by .github/workflows/healthcheck.yml (every 6 hours) and runnable by hand:
//   APP_URL=https://… SUPABASE_URL=https://….supabase.co SUPABASE_ANON_KEY=… node scripts/healthcheck.mjs
// The ping RPC also keeps a free Supabase project from being paused for inactivity.

/** Runs the checks with the given fetch; returns [{ name, ok, detail }]. Pure apart from `fetchImpl`. */
export async function runChecks({ appUrl, supabaseUrl, anonKey, fetchImpl = fetch, timeoutMs = 15_000 }) {
  const get = async (url, init = {}) => {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), timeoutMs)
    try { return await fetchImpl(url, { ...init, signal: ctl.signal, redirect: 'follow' }) } finally { clearTimeout(t) }
  }
  const app = appUrl.replace(/\/$/, '')
  const api = supabaseUrl.replace(/\/$/, '')
  const keyHeaders = { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
  const checks = [
    ['app serves the page', async () => {
      const r = await get(`${app}/`)
      const html = await r.text()
      return r.ok && html.includes('id="root"') ? null : `status ${r.status}${html.includes('id="root"') ? '' : ', no app root in the HTML'}`
    }],
    ['app sends a Content-Security-Policy', async () => {
      const r = await get(`${app}/`)
      return (r.headers.get('content-security-policy') ?? '').includes("default-src 'self'") ? null : 'header missing'
    }],
    ['service worker is served', async () => { const r = await get(`${app}/sw.js`); return r.ok ? null : `status ${r.status}` }],
    ['manifest is served', async () => { const r = await get(`${app}/manifest.webmanifest`); return r.ok ? null : `status ${r.status}` }],
    ['an unknown route still loads the app (SPA rewrite)', async () => {
      const r = await get(`${app}/settings/about`)
      return r.ok && (await r.text()).includes('id="root"') ? null : `status ${r.status}`
    }],
    ['Supabase auth is healthy', async () => { const r = await get(`${api}/auth/v1/health`, { headers: keyHeaders }); return r.ok ? null : `status ${r.status}` }],
    ['database answers (ping)', async () => {
      const r = await get(`${api}/rest/v1/rpc/ping`, { method: 'POST', headers: { ...keyHeaders, 'Content-Type': 'application/json' }, body: '{}' })
      const body = await r.text()
      return r.ok && body.trim() === '"ok"' ? null : `status ${r.status}: ${body.slice(0, 80)}`
    }],
    ['reminder function is deployed and refuses strangers', async () => {
      const r = await get(`${api}/functions/v1/send-reminders`, { method: 'POST', headers: keyHeaders, body: '{}' })
      return r.status === 401 ? null : `expected 401, got ${r.status}`
    }],
  ]
  const results = []
  for (const [name, fn] of checks) {
    try {
      const problem = await fn()
      results.push({ name, ok: problem === null, detail: problem ?? '' })
    } catch (e) {
      results.push({ name, ok: false, detail: e?.name === 'AbortError' ? 'timed out' : String(e?.message ?? e) })
    }
  }
  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { APP_URL, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env
  if (!APP_URL || !SUPABASE_URL || !SUPABASE_ANON_KEY) { console.error('Set APP_URL, SUPABASE_URL and SUPABASE_ANON_KEY'); process.exit(2) }
  const results = await runChecks({ appUrl: APP_URL, supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY })
  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `: ${r.detail}`}`)
  const failed = results.filter((r) => !r.ok)
  if (failed.length) { console.error(`\n${failed.length} of ${results.length} checks failed`); process.exit(1) }
  console.log(`\nall ${results.length} checks passed`)
}
