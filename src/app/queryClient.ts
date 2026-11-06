import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'

const DAY = 1000 * 60 * 60 * 24

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 7 * DAY, retry: 1, refetchOnWindowFocus: true },
    // Offline writes must fail right away (and say so) instead of waiting silently for a connection that may never come
    // while the app is open: a paused save is lost if the app is closed. An offline write queue is a v1.1 item.
    mutations: { networkMode: 'always' },
  },
})

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: async (k) => (await get<string>(k)) ?? null,
    setItem: (k, v) => set(k, v),
    removeItem: (k) => del(k),
  },
  key: 'mm-query-cache',
  throttleTime: 1000,
})

/** Bump when persisted shapes change so old caches are discarded. */
export const CACHE_BUSTER = 'v0'

export async function clearCache() {
  queryClient.clear()
  await persister.removeClient()
}
