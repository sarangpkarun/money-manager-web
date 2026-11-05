import { describe, expect, it } from 'vitest'
import { CORS, json, safeEqual } from '../../supabase/functions/_shared/util.ts'

describe('safeEqual', () => {
  it('compares secrets exactly', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual('', '')).toBe(true)
    expect(safeEqual('', 'x')).toBe(false)
    expect(safeEqual('é', 'e')).toBe(false)
  })
})

describe('json', () => {
  it('returns JSON with CORS headers and the status', async () => {
    const r = json({ a: 1 }, 418)
    expect(r.status).toBe(418)
    expect(r.headers.get('Content-Type')).toBe('application/json')
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(CORS['Access-Control-Allow-Origin'])
    expect(await r.json()).toEqual({ a: 1 })
  })
})
