// The security headers Vercel sends (vercel.json is the single source of truth), for `vite preview` and the tests.
import { readFileSync } from 'node:fs'

export const PROD_SUPABASE_HOST = 'kfcnxlspvbblefntjnuu.supabase.co'

/** Headers for "/(.*)" from vercel.json, with the production Supabase origin swapped for `supabaseUrl` (e.g. the local stack). */
export function securityHeaders(supabaseUrl, vercelJsonPath = new URL('../vercel.json', import.meta.url)) {
  const rule = JSON.parse(readFileSync(vercelJsonPath, 'utf8')).headers.find((h) => h.source === '/(.*)')
  if (!rule) throw new Error('vercel.json has no "/(.*)" headers')
  const origin = new URL(supabaseUrl)
  const ws = `${origin.protocol === 'https:' ? 'wss' : 'ws'}://${origin.host}`
  return Object.fromEntries(rule.headers.map((h) => [
    h.key,
    h.value
      .replaceAll(`https://${PROD_SUPABASE_HOST}`, origin.origin)
      .replaceAll(`wss://${PROD_SUPABASE_HOST}`, ws),
  ]))
}
