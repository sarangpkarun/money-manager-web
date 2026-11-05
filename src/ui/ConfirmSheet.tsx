import { primaryBtn, secondaryBtn } from './Field'
import { Sheet } from './Sheet'

/** "Are you sure?" bottom sheet for destructive actions; the message says exactly what will happen. */
export function ConfirmSheet({ title, message, confirmLabel, busy = false, onConfirm, onClose }: {
  title: string; message: string; confirmLabel: string; busy?: boolean; onConfirm: () => void; onClose: () => void
}) {
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={title} description={message}>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <button className={secondaryBtn} onClick={onClose}>Cancel</button>
        <button className={`${primaryBtn} !bg-money-red`} disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Sheet>
  )
}
