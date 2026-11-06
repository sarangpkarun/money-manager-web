import { safeEqual } from './util.ts'

/**
 * The cron function is called by the database, not by browsers: it accepts exactly the secret the database holds.
 * A missing, empty or non-string secret (the database could not be read) must never match an empty header.
 */
export function cronAuthorized(header: string | null, secret: unknown): boolean {
  if (typeof secret !== 'string' || secret.length < 16) return false
  return safeEqual(header ?? '', secret)
}
