import { useSyncExternalStore } from 'react'

const subscribe = (cb: () => void): (() => void) => {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

/** Whether the browser thinks it has a network connection (live: follows the online/offline events). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}

/** Text for "Couldn't save: …": when there is no connection that is the reason, not the browser's "Failed to fetch". */
export function explain(e: unknown): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return "you're offline"
  return e instanceof Error && e.message ? e.message : 'something went wrong'
}
