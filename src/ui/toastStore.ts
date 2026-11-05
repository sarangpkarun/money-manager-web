import { create } from 'zustand'

export interface Toast {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
  /** ms before auto-dismiss */
  duration: number
}

interface ToastState {
  toasts: Toast[]
  show: (t: { message: string; actionLabel?: string; onAction?: () => void; duration?: number }) => number
  dismiss: (id: number) => void
}

let next = 1
const MAX = 3

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  show: ({ duration = 5000, ...t }) => {
    const id = next++
    set((s) => ({ toasts: [...s.toasts, { id, duration, ...t }].slice(-MAX) }))
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Runs the action once and removes the toast (used by the Undo button). */
export function runToastAction(id: number) {
  const t = useToasts.getState().toasts.find((x) => x.id === id)
  useToasts.getState().dismiss(id)
  t?.onAction?.()
}

/** Convenience: "Deleted · Undo". */
export const showUndo = (message: string, onUndo: () => void, actionLabel = 'Undo') =>
  useToasts.getState().show({ message, actionLabel, onAction: onUndo })
