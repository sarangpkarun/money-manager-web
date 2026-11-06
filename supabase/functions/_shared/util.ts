/** Constant-time string comparison (for secrets), so response timing reveals nothing about a near-match. */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** JSON response. Functions that browsers call (send-test, delete-account) send CORS headers; the cron function does not (`cors: false`). */
export const json = (body: unknown, status = 200, cors = true): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...(cors ? CORS : {}), 'Content-Type': 'application/json' } })
