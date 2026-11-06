// Pure helpers for the security checks: what a built bundle or a tracked file may contain.

/** Hosts that appear in the bundle only as text (library error links, XML namespaces), never as requests: the CSP is what stops requests. */
export const ALLOWED_HOSTS = ['www.w3.org', 'json-schema.org', 'github.com', 'react.dev', 'reactrouter.com', 'tailwindcss.com', 'bit.ly', 'localhost', '127.0.0.1']

/** Distinct http(s) hosts mentioned in a text. */
export function hostsIn(text) {
  return [...new Set([...text.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)].map((m) => m[1].toLowerCase().replace(/\.$/, '')))]
}

/** Hosts not on the allow-list (plus the app's own Supabase host). */
export function foreignHosts(text, supabaseUrl) {
  const own = supabaseUrl ? new URL(supabaseUrl).hostname.toLowerCase() : ''
  return hostsIn(text).filter((h) => h !== own && !ALLOWED_HOSTS.includes(h))
}

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g

/** Decoded payloads of the JWT-looking strings in a text (`{ role, iss }`); undecodable ones are reported with role "unreadable". */
export function jwtsIn(text) {
  return [...text.matchAll(JWT)].map((m) => {
    try {
      const p = JSON.parse(Buffer.from(m[0].split('.')[1], 'base64url').toString('utf8'))
      return { role: String(p.role ?? ''), iss: String(p.iss ?? ''), token: m[0] }
    } catch {
      return { role: 'unreadable', iss: '', token: m[0] }
    }
  })
}

/** Secrets that must never be in the shipped app: anything but an anon-role key, a service_role key, a Supabase secret key. */
export function bundleSecrets(text) {
  const out = []
  for (const j of jwtsIn(text)) if (j.role !== 'anon') out.push(`JWT with role "${j.role}"`)
  if (/service_role/i.test(text)) out.push('the word service_role')
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) out.push('a Supabase secret key')
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) out.push('a private key')
  return out
}

/** Secrets in a tracked source file. The public local-stack demo keys (issuer "supabase-demo") are fine. */
export function fileSecrets(text) {
  const out = []
  for (const j of jwtsIn(text)) if (j.role === 'service_role' && j.iss !== 'supabase-demo') out.push('a service_role JWT')
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) out.push('a Supabase secret key')
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) out.push('a private key')
  if (/"private_key"\s*:\s*"-----BEGIN/.test(text)) out.push('a service-account private_key')
  if (/\bVAPID_PRIVATE_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]{30,}/.test(text)) out.push('a VAPID private key')
  if (/\bAKIA[0-9A-Z]{16}\b/.test(text)) out.push('an AWS access key')
  if (/\bgh[pousr]_[A-Za-z0-9]{36,}\b/.test(text)) out.push('a GitHub token')
  if (/\bCRON_SECRET\s*[=:]\s*["'][A-Za-z0-9_-]{20,}["']/.test(text)) out.push('the cron secret')
  return out
}
