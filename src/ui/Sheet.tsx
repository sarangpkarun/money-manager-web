import type { FocusEvent, ReactNode } from 'react'
import { Drawer } from 'vaul'
import { dismissKeyboard } from '@/lib/visualViewport'

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
  /**
   * "auto" (default): a bottom sheet as tall as its content, at most 92% of the screen.
   * "full": a form sheet from just below the status bar to the bottom edge. Its size never changes when the keyboard opens:
   * the keyboard simply covers the lower part (Save lives there), the body scrolls, and pulling down closes it.
   */
  size?: 'auto' | 'full'
}

/** After the keyboard has finished appearing, scroll a newly focused field into the visible part of the sheet. */
function keepFocusVisible(e: FocusEvent<HTMLDivElement>) {
  const t = e.target
  if (!(t instanceof HTMLElement) || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
  window.setTimeout(() => t.scrollIntoView?.({ block: 'nearest' }), 250)
}

/** Bottom sheet with safe-area padding; content scrolls inside, the page behind does not. */
export function Sheet({ open, onOpenChange, title, description, children, hideTitle, onOpenAutoFocus, size = 'auto' }: SheetProps) {
  const full = size === 'full'
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false} onDrag={() => dismissKeyboard()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Drawer.Content onOpenAutoFocus={onOpenAutoFocus} data-size={size}
                        className={`fixed inset-x-0 bottom-0 z-[60] flex flex-col rounded-t-3xl bg-surface outline-none ${full ? '' : 'max-h-[92%]'}`}
                        style={full ? { top: 'calc(env(safe-area-inset-top, 0px) + 12px)' } : undefined}>
          <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line" aria-hidden />
          <div className="flex shrink-0 items-start justify-between gap-2 pr-2">
            <Drawer.Title className={hideTitle ? 'sr-only' : 'px-4 pt-3 text-lg font-semibold'}>{title}</Drawer.Title>
            {full && (
              <Drawer.Close asChild>
                <button type="button" aria-label="Close" className="-mt-1 ml-auto flex h-11 w-11 items-center justify-center rounded-full text-xl text-muted"><span aria-hidden>✕</span></button>
              </Drawer.Close>
            )}
          </div>
          <Drawer.Description className={description ? 'px-4 text-sm text-muted' : 'sr-only'}>{description ?? title}</Drawer.Description>
          <div className={`sheet-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 ${full ? 'sheet-body-full flex flex-col' : ''}`} onFocusCapture={keepFocusVisible}>{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
