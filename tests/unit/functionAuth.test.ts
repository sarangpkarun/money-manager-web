import { describe, expect, it } from 'vitest'
import { cronAuthorized } from '../../supabase/functions/_shared/cronAuth.ts'
import { CORS, json, safeEqual } from '../../supabase/functions/_shared/util.ts'

const SECRET = 'a'.repeat(8) + 'b'.repeat(24)

describe('cronAuthorized (send-reminders)', () => {
  it('accepts exactly the secret the database holds', () => expect(cronAuthorized(SECRET, SECRET)).toBe(true))
  it('rejects a missing, empty, wrong, longer, shorter or differently cased header', () => {
    for (const h of [null, '', 'x', SECRET + 'x', SECRET.slice(1), SECRET.toUpperCase(), ` ${SECRET}`]) expect(cronAuthorized(h, SECRET), String(h)).toBe(false)
  })
  it('never matches when the database secret could not be read (null, undefined, empty, short, not a string)', () => {
    for (const s of [null, undefined, '', 'short', 123, {}]) {
      expect(cronAuthorized('', s)).toBe(false)
      expect(cronAuthorized('short', s)).toBe(false)
      expect(cronAuthorized(null, s)).toBe(false)
    }
  })
})

describe('safeEqual', () => {
  it('compares whole strings, including different lengths and unicode', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual('', '')).toBe(true)
    expect(safeEqual('é', 'é')).toBe(true)
    expect(safeEqual('é', 'e')).toBe(false)
  })
})

describe('json responses', () => {
  it('browser-facing functions send CORS headers, the cron function does not', async () => {
    const a = json({ ok: 1 })
    expect(a.headers.get('Access-Control-Allow-Origin')).toBe(CORS['Access-Control-Allow-Origin'])
    const b = json({ error: 'unauthorized' }, 401, false)
    expect(b.status).toBe(401)
    expect(b.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(b.headers.get('Content-Type')).toBe('application/json')
    expect(await b.json()).toEqual({ error: 'unauthorized' })
  })
})
