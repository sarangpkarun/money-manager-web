import type { ReactNode } from 'react'

/** A horizontal bar behind a row's content; `fraction` is 0..1 of the widest row. */
export function BarRow({ fraction, color, children }: { fraction: number; color: string; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-lg">
      <div aria-hidden className="absolute inset-y-0 left-0 rounded-lg opacity-15" style={{ width: `${Math.max(fraction, 0) * 100}%`, background: color }} />
      <div className="relative">{children}</div>
    </div>
  )
}
