import { describe, expect, it } from 'vitest'
import { runChecks } from '../../scripts/healthcheck.mjs'

const HTML = '<html><body><div id="root"></div></body></html>'
/** A fake network: each URL path maps to a response factory. */
function net(over: Record<string, () => Response> = {}): typeof fetch {
  const ok: Record<string, () => Response> = {
    'app/': () => new Response(HTML, { headers: { 'content-security-policy': "default-src 'self'; script-src 'self'" } }),
    'app/sw.js': () => new Response('//sw'),
    'app/manifest.webmanifest': () => new Response('{}'),
    'app/settings/about': () => new Response(HTML),
    'api/auth/v1/health': () => new Response('{"ok":1}'),
    'api/rest/v1/rpc/ping': () => new Response('"ok"'),
    'api/functions/v1/send-reminders': () => new Response('{"error":"unauthorized"}', { status: 401 }),
  }
  return (async (input: RequestInfo | URL) => {
    const u = String(input).replace('https://app.example', 'app').replace('https://abc.supabase.co', 'api')
    const f = over[u] ?? ok[u]
    if (!f) return new Response('not found', { status: 404 })
    return f()
  }) as typeof fetch
}
const run = (fetchImpl: typeof fetch) => runChecks({ appUrl: 'https://app.example/', supabaseUrl: 'https://abc.supabase.co', anonKey: 'k', fetchImpl })

describe('healthcheck', () => {
  it('passes when everything is up', async () => {
    const r = await run(net())
    expect(r.length).toBe(8)
    expect(r.filter((x) => !x.ok)).toEqual([])
  })
  it('names the failing check and why', async () => {
    const r = await run(net({ 'api/rest/v1/rpc/ping': () => new Response('{"message":"paused"}', { status: 503 }) }))
    const bad = r.filter((x) => !x.ok)
    expect(bad.map((x) => x.name)).toEqual(['database answers (ping)'])
    expect(bad[0]!.detail).toContain('503')
  })
  it('flags a missing CSP, a page without the app root, a missing service worker and a function that does not refuse strangers', async () => {
    const r = await run(net({
      'app/': () => new Response('<html>maintenance</html>'),
      'app/sw.js': () => new Response('x', { status: 404 }),
      'api/functions/v1/send-reminders': () => new Response('{}', { status: 200 }),
    }))
    expect(r.filter((x) => !x.ok).map((x) => x.name)).toEqual([
      'app serves the page', 'app sends a Content-Security-Policy', 'service worker is served', 'reminder function is deployed and refuses strangers',
    ])
  })
  it('network errors and timeouts become failures instead of crashing the run', async () => {
    const boom = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    const r = await run(boom)
    expect(r.every((x) => !x.ok && x.detail === 'fetch failed')).toBe(true)
    const abort = (async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) }) as unknown as typeof fetch
    expect((await run(abort))[0]!.detail).toBe('timed out')
  })
  it('sends the anon key to Supabase', async () => {
    const seen: Record<string, string>[] = []
    const spy = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('abc.supabase.co')) seen.push(init?.headers as Record<string, string>)
      return net()(url, init)
    }) as typeof fetch
    await run(spy)
    expect(seen.length).toBe(3)
    expect(seen.every((h) => h.apikey === 'k' && h.Authorization === 'Bearer k')).toBe(true)
  })
})
