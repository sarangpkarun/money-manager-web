import { Drawer } from 'vaul'
import { useUi } from '@/lib/uiStore'

/** Placeholder; the real Quick Add arrives in Phase 2. Lazy-loaded so vaul/radix stay out of the initial bundle. */
export default function QuickAddSheet() {
  const { quickAddOpen, setQuickAddOpen } = useUi()
  return (
    <Drawer.Root open={quickAddOpen} onOpenChange={setQuickAddOpen}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-20 bg-black/40" />
        <Drawer.Content className="pb-safe fixed inset-x-0 bottom-0 z-30 rounded-t-3xl bg-surface p-4 outline-none">
          <Drawer.Title className="text-lg font-semibold">Quick add</Drawer.Title>
          <Drawer.Description className="mt-1 text-muted">Coming in Phase 2.</Drawer.Description>
          <div className="h-32" />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
