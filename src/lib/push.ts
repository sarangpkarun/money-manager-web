/**
 * Web Push in the browser. iPhone only allows it for an app installed to the Home Screen (iOS 16.4+), and only after a tap,
 * so "needs-install" is a normal state there, not an error.
 */
export type PushSupport = 'ok' | 'needs-install' | 'unsupported'

interface Env {
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
  ua: string
  standalone: boolean
}

export function readEnv(w: Window & typeof globalThis = window): Env {
  const nav = w.navigator as Navigator & { standalone?: boolean }
  return {
    hasServiceWorker: 'serviceWorker' in nav,
    hasPushManager: 'PushManager' in w,
    hasNotification: 'Notification' in w,
    ua: nav.userAgent ?? '',
    standalone: nav.standalone === true || (typeof w.matchMedia === 'function' && w.matchMedia('(display-mode: standalone)').matches),
  }
}

export function pushSupport(env: Env = readEnv()): PushSupport {
  const ios = /iPhone|iPad|iPod/.test(env.ua)
  if (ios && !env.standalone) return 'needs-install' // Safari tabs on iOS have no Push API at all
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return 'unsupported'
  return 'ok'
}

export const b64uToBytes = (b64: string): Uint8Array<ArrayBuffer> => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}
const bytesToB64u = (buf: ArrayBuffer | null): string => {
  if (!buf) return ''
  let s = ''
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The service worker registration, or null if none becomes ready in time (e.g. the dev server registers none). */
async function readyWorker(ms = 4000): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))])
}

export const vapidPublicKey = (): string => (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

export interface DeviceStatus {
  support: PushSupport
  permission: NotificationPermission | 'unavailable'
  /** this browser has a push subscription */
  subscribed: boolean
  endpoint: string | null
}

export async function deviceStatus(env: Env = readEnv()): Promise<DeviceStatus> {
  const support = pushSupport(env)
  if (support !== 'ok') return { support, permission: 'unavailable', subscribed: false, endpoint: null }
  let sub: PushSubscription | null = null
  try { sub = (await (await readyWorker())?.pushManager.getSubscription()) ?? null } catch { /* no service worker yet */ }
  return { support, permission: Notification.permission, subscribed: !!sub, endpoint: sub?.endpoint ?? null }
}

export type EnableResult =
  | { ok: true; endpoint: string }
  | { ok: false; reason: 'unsupported' | 'needs-install' | 'denied' | 'no-key' | 'failed'; message?: string }

/**
 * Asks for permission (must run inside a tap), subscribes this device and hands the subscription to `save` (which stores it on the
 * server). If saving fails the browser subscription is removed again so the two never disagree.
 */
export async function enablePush(save: (s: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent: string }) => Promise<void>, env: Env = readEnv()): Promise<EnableResult> {
  const support = pushSupport(env)
  if (support !== 'ok') return { ok: false, reason: support }
  const key = vapidPublicKey()
  if (!key) return { ok: false, reason: 'no-key' }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, reason: 'denied' }
    const reg = await readyWorker()
    if (!reg) return { ok: false, reason: 'failed', message: 'The app is not ready for notifications yet. Reload it and try again.' }
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) }))
    const keys = { p256dh: bytesToB64u(sub.getKey('p256dh')), auth: bytesToB64u(sub.getKey('auth')) }
    try {
      await save({ endpoint: sub.endpoint, keys, userAgent: env.ua })
    } catch (e) {
      await sub.unsubscribe().catch(() => false)
      return { ok: false, reason: 'failed', message: (e as Error).message }
    }
    return { ok: true, endpoint: sub.endpoint }
  } catch (e) {
    return { ok: false, reason: 'failed', message: (e as Error).message }
  }
}

/** Unsubscribes this browser; `remove` deletes the stored device by endpoint. Best effort: never throws (used on logout too). */
export async function disablePush(remove: (endpoint: string) => Promise<void>, env: Env = readEnv()): Promise<void> {
  if (pushSupport(env) !== 'ok') return
  try {
    const sub = (await (await readyWorker())?.pushManager.getSubscription()) ?? null
    if (!sub) return
    await remove(sub.endpoint).catch(() => undefined)
    await sub.unsubscribe().catch(() => false)
  } catch { /* nothing to undo */ }
}
