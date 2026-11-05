import type { ReactNode } from 'react'

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      {hint && <p className="max-w-xs text-muted">{hint}</p>}
      {action}
    </div>
  )
}
