/**
 * The app's own error log. Uncaught errors are scrubbed here, then stored in the user's own Supabase project (table
 * `client_errors`, readable only by them). Nothing goes to a third party.
 */

const MAX_MESSAGE = 500
const MAX_STACK = 4000

/**
 * Removes anything personal or financial from an error text before it leaves the page: emails, URLs, every digit (amounts, ids,
 * dates, phone numbers). What is left is the kind of error and the code path, which is all a bug report needs.
 */
export function scrub(text: string, max = MAX_MESSAGE): string {
  return text
    .replace(/\S*@\S*/g, '<email>') // anything around an @, however odd the address
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s)"']+/gi, '<url>')
    .replace(/\d/g, '#')
    .slice(0, max)
}

export type ErrorKind = 'error' | 'unhandledrejection' | 'boundary'

export interface ErrorRow {
  kind: ErrorKind
  message: string
  stack: string | null
  route: string
  app_version: string
  user_agent: string
}

/** Browser noise that is not a bug in the app. */
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i, /Non-Error promise rejection/i, /Load failed|Failed to fetch|NetworkError/i, /AbortError/i]

/** Turns whatever was thrown into a scrubbed row, or null for noise. */
export function toRow(kind: ErrorKind, thrown: unknown, ctx: { route: string; version: string; userAgent: string }): ErrorRow | null {
  const e = thrown instanceof Error ? thrown : null
  const raw = e ? `${e.name}: ${e.message}` : typeof thrown === 'string' ? thrown : typeof (thrown as { message?: unknown } | null)?.message === 'string' ? String((thrown as { message: string }).message) : 'Unknown error'
  if (IGNORED.some((r) => r.test(raw) || (e && r.test(e.message)))) return null
  return {
    kind,
    message: scrub(raw),
    stack: e?.stack ? scrub(e.stack, MAX_STACK) : null,
    // the route without its ids or query: "/money/entry/<id>" keeps its shape
    route: scrub(ctx.route.split('?')[0]!.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id'), 200),
    app_version: ctx.version.slice(0, 32),
    user_agent: ctx.userAgent.slice(0, 300),
  }
}

export interface Reporter {
  report: (kind: ErrorKind, thrown: unknown) => void
}

/** Sends scrubbed errors through `send`, at most `perSession` of them, never the same one twice within `dedupeMs`. */
export function createReporter(deps: {
  send: (row: ErrorRow) => Promise<void>
  context: () => { route: string; version: string; userAgent: string }
  canSend: () => boolean | Promise<boolean>
  now?: () => number
  perSession?: number
  dedupeMs?: number
}): Reporter {
  const now = deps.now ?? Date.now
  const limit = deps.perSession ?? 10
  const dedupeMs = deps.dedupeMs ?? 60_000
  const seen = new Map<string, number>()
  let sent = 0
  return {
    report(kind, thrown) {
      const row = toRow(kind, thrown, deps.context())
      if (!row || sent >= limit) return
      const key = `${row.kind}|${row.message}|${row.stack?.slice(0, 200) ?? ''}`
      const at = now()
      const last = seen.get(key)
      if (last !== undefined && at - last < dedupeMs) return
      seen.set(key, at)
      sent++
      void new Promise<boolean>((res) => res(deps.canSend())).then((ok) => (ok ? deps.send(row) : undefined)).catch(() => undefined)
    },
  }
}
