import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ insert: vi.fn(async () => ({ error: null })), session: { data: { session: {} as object | null } } }))
vi.mock('./supabase', () => ({ supabase: { from: () => ({ insert: m.insert }), auth: { getSession: async () => m.session } } }))
vi.stubGlobal('__APP_VERSION__', '9.9.9')

import { installErrorLog, reportBoundary } from './errorLogInstall'

const flush = () => new Promise((r) => setTimeout(r, 5))
let uninstall: () => void
beforeEach(() => { m.insert.mockClear(); m.session.data.session = {}; vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true); uninstall = installErrorLog() })
afterEach(() => { uninstall(); vi.restoreAllMocks() })

describe('installErrorLog', () => {
  it('stores an uncaught error, scrubbed, with the app version', async () => {
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('crash at 10:45 for me@x.com'), message: 'crash' }))
    await flush()
    expect(m.insert).toHaveBeenCalledOnce()
    const row = (m.insert.mock.calls[0] as unknown as [Record<string, string>])[0]
    expect(row).toMatchObject({ kind: 'error', message: 'Error: crash at ##:## for <email>', app_version: '9.9.9' })
  })
  it('stores unhandled promise rejections', async () => {
    const e = new Event('unhandledrejection') as Event & { reason: unknown }
    e.reason = new Error('rejected unique-77')
    window.dispatchEvent(e)
    await flush()
    expect((m.insert.mock.calls[0] as unknown as [Record<string, string>])[0]).toMatchObject({ kind: 'unhandledrejection', message: 'Error: rejected unique-##' })
  })
  it('stores nothing when signed out or offline', async () => {
    m.session.data.session = null
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('signed out one') }))
    await flush()
    m.session.data.session = {}
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('offline one') }))
    await flush()
    expect(m.insert).not.toHaveBeenCalled()
  })
  it('boundary crashes are stored as such, and uninstalling stops listening', async () => {
    reportBoundary(new Error('render failed'))
    await flush()
    expect((m.insert.mock.calls[0] as unknown as [Record<string, string>])[0]?.kind).toBe('boundary')
    uninstall()
    const swallow = (e: Event) => e.preventDefault() // jsdom would report the uncaught error to the test runner
    window.addEventListener('error', swallow)
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('after uninstall'), cancelable: true }))
    window.removeEventListener('error', swallow)
    await flush()
    expect(m.insert).toHaveBeenCalledOnce()
    uninstall = installErrorLog()
  })
})
