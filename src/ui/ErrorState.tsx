import { useOnline } from '@/lib/online'

/** "Couldn't load X" with a Retry button; says so when the real cause is no connection. */
export function ErrorState({ what, onRetry, className = 'mx-4' }: { what: string; onRetry: () => void; className?: string }) {
  const online = useOnline()
  return (
    <div role="alert" className={`${className} rounded-2xl bg-surface p-4 text-center`}>
      <p className="mb-3">Couldn't load {what}.{!online && <span className="block text-sm text-muted">You're offline. Reconnect and try again.</span>}</p>
      <button onClick={onRetry} className="min-h-11 rounded-full bg-accent px-5 text-on-accent">Retry</button>
    </div>
  )
}
