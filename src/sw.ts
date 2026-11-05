// Custom service worker: offline shell precache + Web Push (Phase 0 spike, reused by Phase 7 reminders).
// Minimal local types: the DOM lib (needed by the app) conflicts with the WebWorker lib.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

interface PushEv extends Event { data: { json(): unknown; text(): string } | null; waitUntil(p: Promise<unknown>): void }
interface ClickEv extends Event { notification: { close(): void; data?: { url?: string } }; waitUntil(p: Promise<unknown>): void }
interface WinClient { url: string; focus(): Promise<unknown>; navigate?(u: string): Promise<unknown> }
interface SwScope {
  skipWaiting(): Promise<void>
  clients: { claim(): Promise<void>; matchAll(o: object): Promise<WinClient[]>; openWindow(u: string): Promise<unknown> }
  registration: { showNotification(t: string, o: object): Promise<void> }
  addEventListener(t: string, l: (e: never) => void): void
}
const sw = self as unknown as SwScope
type Manifest = Array<string | { url: string; revision: string | null }>

cleanupOutdatedCaches()
// Workbox needs the literal `self.__WB_MANIFEST` here.
precacheAndRoute((self as unknown as { __WB_MANIFEST: Manifest }).__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

sw.addEventListener('install', () => void sw.skipWaiting())
sw.addEventListener('activate', () => void sw.clients.claim())

sw.addEventListener('push', ((e: PushEv) => {
  let p: { title?: string; body?: string; url?: string } = {}
  try { p = (e.data?.json() as typeof p) ?? {} } catch { p = { body: e.data?.text() } }
  e.waitUntil(
    sw.registration.showNotification(p.title ?? 'Money Manager', {
      body: p.body ?? '', icon: '/icon-192.png', badge: '/icon-192.png', data: { url: p.url ?? '/' },
    }),
  )
}) as (e: never) => void)

sw.addEventListener('notificationclick', ((e: ClickEv) => {
  e.notification.close()
  const url = e.notification.data?.url ?? '/'
  e.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (wins) => {
      const w = wins[0]
      if (w) { await w.focus(); return w.navigate?.(url) }
      return sw.clients.openWindow(url)
    }),
  )
}) as (e: never) => void)
