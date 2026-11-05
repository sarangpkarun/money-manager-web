import type { ReactNode } from 'react'
import { Drawer } from 'vaul'

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  /** Hides the visible title but keeps it for screen readers. */
  hideTitle?: boolean
}

/** Bottom sheet with safe-area padding; content scrolls inside, the page behind does not. */
export function Sheet({ open, onOpenChange, title, description, children, hideTitle }: SheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[92%] flex-col rounded-t-3xl bg-surface outline-none">
          <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line" aria-hidden />
          <Drawer.Title className={hideTitle ? 'sr-only' : 'px-4 pt-3 text-lg font-semibold'}>{title}</Drawer.Title>
          <Drawer.Description className={description ? 'px-4 text-sm text-muted' : 'sr-only'}>{description ?? title}</Drawer.Description>
          <div className="pb-safe min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-2">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
