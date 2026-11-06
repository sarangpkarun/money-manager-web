import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { createReporter, scrub, toRow, type ErrorRow } from './errorLog'

const ctx = { route: '/money/entry/3f2b8c1e-1111-4222-8333-444455556666?x=1', version: '1.2.3', userAgent: 'UA' }

describe('scrub', () => {
  it('removes emails, URLs and every digit', () => {
    expect(scrub('Failed for sarang@example.com at https://x.supabase.co/rest/v1/transactions?amount=25000')).toBe('Failed for <email> at <url>')
    expect(scrub('Cannot read ₹1,20,000 of null (acct 4455)')).toBe('Cannot read ₹#,##,### of null (acct ####)')
    expect(scrub('+91 98765 43210')).toBe('+## ##### #####')
  })
  it('caps the length', () => {
    expect(scrub('x'.repeat(900))).toHaveLength(500)
    expect(scrub('x'.repeat(9000), 4000)).toHaveLength(4000)
  })
  it('property: no digit and no @ ever survives, whatever the input', () => {
    fc.assert(fc.property(fc.string(), (s) => {
      const out = scrub(s, 10_000)
      expect(out).not.toMatch(/\d/)
      expect(out).not.toContain('@')
    }), { numRuns: 500 })
  })
  it('property: emails of any shape disappear', () => {
    fc.assert(fc.property(fc.emailAddress(), (e) => { expect(scrub(`user ${e} failed`)).not.toContain(e) }))
  })
})

describe('toRow', () => {
  it('builds a scrubbed row from an Error, with the stack and a route stripped of ids and query', () => {
    const e = new TypeError('x is undefined for amount 25000')
    e.stack = 'TypeError: x is undefined for amount 25000\n    at f (http://localhost:5173/assets/a-1.js:10:20)'
    const r = toRow('error', e, ctx)!
    expect(r.message).toBe('TypeError: x is undefined for amount #####')
    expect(r.stack).not.toMatch(/\d/)
    expect(r.stack).toContain('<url>')
    expect(r).toMatchObject({ kind: 'error', route: '/money/entry/:id', app_version: '1.2.3', user_agent: 'UA' })
  })
  it('handles strings, error-like objects and unknown values', () => {
    expect(toRow('unhandledrejection', 'plain 12', ctx)!.message).toBe('plain ##')
    expect(toRow('unhandledrejection', { message: 'from supabase' }, ctx)!.message).toBe('from supabase')
    expect(toRow('error', undefined, ctx)!.message).toBe('Unknown error')
    expect(toRow('error', 42, ctx)!.stack).toBeNull()
  })
  it('drops browser noise', () => {
    for (const noise of ['ResizeObserver loop completed with undelivered notifications.', 'Script error.', 'Failed to fetch', 'Load failed', 'AbortError: aborted']) {
      expect(toRow('error', new Error(noise), ctx), noise).toBeNull()
    }
  })
  it('truncates the user agent and version', () => {
    const r = toRow('error', new Error('x'), { ...ctx, version: 'v'.repeat(80), userAgent: 'u'.repeat(900) })!
    expect(r.app_version).toHaveLength(32)
    expect(r.user_agent).toHaveLength(300)
  })
})

describe('createReporter', () => {
  const make = (over: Partial<Parameters<typeof createReporter>[0]> = {}) => {
    const sent: ErrorRow[] = []
    let t = 1_000_000
    const advance = (ms: number) => { t += ms }
    const r = createReporter({ send: async (row) => { sent.push(row) }, context: () => ctx, canSend: () => true, now: () => t, ...over })
    return { r, sent, advance }
  }
  const flush = () => new Promise((res) => setTimeout(res, 0))

  it('sends a scrubbed row', async () => {
    const { r, sent } = make()
    r.report('error', new Error('boom 1'))
    await flush()
    expect(sent).toHaveLength(1)
    expect(sent[0]!.message).toBe('Error: boom #')
  })
  it('the same error within a minute is sent once, again after the window', async () => {
    const { r, sent, advance } = make()
    for (let i = 0; i < 5; i++) r.report('error', new Error('same'))
    await flush()
    expect(sent).toHaveLength(1)
    advance(61_000)
    r.report('error', new Error('same'))
    await flush()
    expect(sent).toHaveLength(2)
  })
  it('errors that differ only in digits count as the same error', async () => {
    const { r, sent } = make()
    r.report('error', new Error('row 1 failed'))
    r.report('error', new Error('row 2 failed'))
    await flush()
    expect(sent).toHaveLength(1)
  })
  it('stops after the per-session limit', async () => {
    const { r, sent } = make({ perSession: 3 })
    for (const m of 'abcdefgh') r.report('error', new Error(`distinct ${m}`))
    await flush()
    expect(sent).toHaveLength(3)
  })
  it('noise is neither sent nor counted against the limit', async () => {
    const { r, sent } = make({ perSession: 1 })
    r.report('error', new Error('Failed to fetch'))
    r.report('error', new Error('real bug'))
    await flush()
    expect(sent.map((s) => s.message)).toEqual(['Error: real bug'])
  })
  it('nothing is sent when signed out or offline (async check), and a failing send is swallowed', async () => {
    const closed = make({ canSend: async () => false })
    closed.r.report('error', new Error('x'))
    await flush()
    expect(closed.sent).toEqual([])
    const failing = make({ send: vi.fn(async () => { throw new Error('network') }) })
    expect(() => failing.r.report('error', new Error('y'))).not.toThrow()
    await flush()
    const throwing = make({ canSend: () => { throw new Error('storage') } })
    expect(() => throwing.r.report('error', new Error('z'))).not.toThrow()
    await flush()
  })
})
