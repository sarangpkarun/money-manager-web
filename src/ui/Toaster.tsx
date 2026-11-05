import { useEffect } from 'react'
import { runToastAction, useToasts, type Toast } from './toastStore'

function Item({ t }: { t: Toast }) {
  const dismiss = useToasts((s) => s.dismiss)
  useEffect(() => {
    const id = window.setTimeout(() => dismiss(t.id), t.duration)
    return () => window.clearTimeout(id)
  }, [t.id, t.duration, dismiss])
  return (
    <div role="status" className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-fg px-4 py-3 text-sm text-bg shadow-lg">
      <span className="flex-1">{t.message}</span>
      {t.actionLabel && (
        <button onClick={() => runToastAction(t.id)} className="min-h-11 px-2 font-semibold text-accent">
          {t.actionLabel}
        </button>
      )}
    </div>
  )
}

/** Sits just above the tab bar. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col gap-2 px-4"
         style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }} aria-live="polite">
      {toasts.map((t) => <Item key={t.id} t={t} />)}
    </div>
  )
}
