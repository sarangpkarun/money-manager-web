import { useOnline } from '@/lib/online'

/** A slim notice under the status bar while offline; the app keeps showing what it has saved. */
export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" className="pt-safe pointer-events-none fixed inset-x-0 top-0 z-[60]">
      <div className="mx-auto w-fit rounded-b-xl bg-fg px-3 py-1 text-xs font-medium text-bg shadow">You're offline. Showing saved data.</div>
    </div>
  )
}
