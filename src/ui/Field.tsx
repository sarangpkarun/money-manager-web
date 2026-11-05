import type { ReactNode } from 'react'

export const inputCls = 'h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-fg outline-none focus:border-accent'
export const primaryBtn = 'h-12 w-full rounded-xl bg-accent font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60'
export const secondaryBtn = 'h-12 w-full rounded-xl bg-surface-2 font-semibold text-fg transition-transform active:scale-[0.98] disabled:opacity-60'

/** Label + control + error (the error sits outside the label so the accessible name stays clean). */
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-sm text-muted">{label}</span>
        {children}
      </label>
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-sm text-money-red">{error}</span>}
    </div>
  )
}
