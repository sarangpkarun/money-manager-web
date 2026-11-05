import { afterEach, describe, expect, it, vi } from 'vitest'
import { b64uToBytes, disablePush, enablePush, pushSupport, readEnv } from './push'

const env = (o: Partial<ReturnType<typeof readEnv>> = {}) => ({
  hasServiceWorker: true, hasPushManager: true, hasNotification: true, ua: 'Mozilla/5.0 (Macintosh)', standalone: false, ...o,
})
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)'

describe('pushSupport', () => {
  it('ok on a capable browser', () => expect(pushSupport(env())).toBe('ok'))
  it('iPhone in a Safari tab needs the app installed first, even though it lacks the Push API', () => {
    expect(pushSupport(env({ ua: IPHONE, hasPushManager: false }))).toBe('needs-install')
    expect(pushSupport(env({ ua: IPHONE.replace('iPhone', 'iPad') }))).toBe('needs-install')
  })
  it('iPhone from the Home Screen is fine when the API is there', () => {
    expect(pushSupport(env({ ua: IPHONE, standalone: true }))).toBe('ok')
    expect(pushSupport(env({ ua: IPHONE, standalone: true, hasPushManager: false }))).toBe('unsupported')
  })
  it('unsupported without a service worker, push manager or notifications', () => {
    for (const o of [{ hasServiceWorker: false }, { hasPushManager: false }, { hasNotification: false }]) expect(pushSupport(env(o))).toBe('unsupported')
  })
})

describe('readEnv', () => {
  it('reads the browser', () => {
    const e = readEnv()
    expect(typeof e.ua).toBe('string')
    expect(e.standalone).toBe(false)
  })
})

describe('b64uToBytes', () => {
  it('decodes url-safe base64 with or without padding', () => {
    expect([...b64uToBytes('AQID')]).toEqual([1, 2, 3])
    expect([...b64uToBytes('-_8')]).toEqual([251, 255])
  })
})

/** A fake service worker registration with a controllable subscription. */
function fakePush(opts: { existing?: boolean; permission?: NotificationPermission } = {}) {
  const sub = {
    endpoint: 'https://push.example/abc',
    getKey: (n: string) => new Uint8Array(n === 'p256dh' ? [1, 2, 3, 4] : [9, 9]).buffer,
    unsubscribe: vi.fn(async () => true),
  }
  const pushManager = { getSubscription: vi.fn(async () => (opts.existing ? sub : null)), subscribe: vi.fn(async () => sub) }
  vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ pushManager }) }, userAgent: 'TestBrowser' })
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn(async () => opts.permission ?? 'granted') })
  return { sub, pushManager }
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('enablePush', () => {
  it('refuses where push cannot work, without asking for permission', async () => {
    expect(await enablePush(vi.fn(), env({ ua: IPHONE }))).toEqual({ ok: false, reason: 'needs-install' })
    expect(await enablePush(vi.fn(), env({ hasPushManager: false }))).toEqual({ ok: false, reason: 'unsupported' })
  })
  it('needs the public key', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')
    expect(await enablePush(vi.fn(), env())).toEqual({ ok: false, reason: 'no-key' })
  })
  it('stops when permission is not granted', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQID')
    fakePush({ permission: 'denied' })
    const save = vi.fn()
    expect(await enablePush(save, env())).toEqual({ ok: false, reason: 'denied' })
    expect(save).not.toHaveBeenCalled()
  })
  it('subscribes, saves the endpoint and keys, and reports success', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQID')
    const { pushManager } = fakePush()
    const save = vi.fn(async () => undefined)
    expect(await enablePush(save, env({ ua: 'TestBrowser' }))).toEqual({ ok: true, endpoint: 'https://push.example/abc' })
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })
    expect(save).toHaveBeenCalledWith({ endpoint: 'https://push.example/abc', keys: { p256dh: 'AQIDBA', auth: 'CQk' }, userAgent: 'TestBrowser' })
  })
  it('reuses an existing browser subscription', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQID')
    const { pushManager } = fakePush({ existing: true })
    expect((await enablePush(async () => undefined, env())).ok).toBe(true)
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })
  it('undoes the browser subscription when the server refuses it', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQID')
    const { sub } = fakePush()
    const r = await enablePush(async () => { throw new Error('not signed in') }, env())
    expect(r).toEqual({ ok: false, reason: 'failed', message: 'not signed in' })
    expect(sub.unsubscribe).toHaveBeenCalled()
  })
  it('reports unexpected browser errors', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQID')
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.reject(new Error('no worker')) } })
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: async () => 'granted' })
    expect(await enablePush(vi.fn(), env())).toEqual({ ok: false, reason: 'failed', message: 'no worker' })
  })
})

describe('disablePush', () => {
  it('removes the stored device and unsubscribes the browser', async () => {
    const { sub } = fakePush({ existing: true })
    const remove = vi.fn(async () => undefined)
    await disablePush(remove, env())
    expect(remove).toHaveBeenCalledWith('https://push.example/abc')
    expect(sub.unsubscribe).toHaveBeenCalled()
  })
  it('never throws, even when the server call fails; does nothing without a subscription or support', async () => {
    const { sub } = fakePush({ existing: true })
    await expect(disablePush(async () => { throw new Error('offline') }, env())).resolves.toBeUndefined()
    expect(sub.unsubscribe).toHaveBeenCalled()
    fakePush({ existing: false })
    const remove = vi.fn()
    await disablePush(remove, env())
    expect(remove).not.toHaveBeenCalled()
    await disablePush(remove, env({ hasPushManager: false }))
    expect(remove).not.toHaveBeenCalled()
  })
})
