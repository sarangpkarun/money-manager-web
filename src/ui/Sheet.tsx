import type { FocusEvent, ReactNode } from 'react'
import { Drawer } from 'vaul'

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  /** Hides the visible title but keeps it for screen readers. */
  hideTitle?: boolean
  /** Called when the sheet opens; preventDefault() keeps focus where the content put it (e.g. autoFocus). */
  onOpenAutoFocus?: (e: Event) => void
}

/** After the keyboard has finished appearing, scroll a newly focused field into the visible part of the sheet. */
function keepFocusVisible(e: FocusEvent<HTMLDivElement>) {
  const t = e.target
  if (!(t instanceof HTMLElement) || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
  window.setTimeout(() => t.scrollIntoView?.({ block: 'nearest' }), 250)
}

/** Bottom sheet with safe-area padding; content scrolls inside, the page behind does not. */
export function Sheet({ open, onOpenChange, title, description, children, hideTitle, onOpenAutoFocus }: SheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Drawer.Content onOpenAutoFocus={onOpenAutoFocus} className="fixed inset-x-0 z-[60] flex flex-col rounded-t-3xl bg-surface outline-none"
                        // sits on top of the keyboard and is never taller than the part of the screen the keyboard leaves free (see lib/visualViewport.ts)
                        style={{ bottom: 'var(--kb, 0px)', maxHeight: 'min(92%, calc(var(--vv-h, 100dvh) - env(safe-area-inset-top, 0px) - 12px))' }}>
          <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line" aria-hidden />
          <Drawer.Title className={hideTitle ? 'sr-only' : 'px-4 pt-3 text-lg font-semibold'}>{title}</Drawer.Title>
          <Drawer.Description className={description ? 'px-4 text-sm text-muted' : 'sr-only'}>{description ?? title}</Drawer.Description>
          <div className="sheet-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2" onFocusCapture={keepFocusVisible}>{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
