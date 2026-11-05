import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function PageHeader({ title, back, backLabel, action }: { title: string; back?: string; backLabel?: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 bg-bg/95 px-4 pb-2 pt-3 backdrop-blur">
      {back && <Link to={back} className="mb-1 inline-flex min-h-11 items-center text-accent">‹ {backLabel ?? 'Back'}</Link>}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{title}</h1>
        {action}
      </div>
    </header>
  )
}
