import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  selected?: boolean
  children: ReactNode
}

/** Pill button for categories, accounts, filters. 44px tap target; press feedback via transform only. */
export function Chip({ selected = false, className = '', children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-transform active:scale-95 ${
        selected ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-fg'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
