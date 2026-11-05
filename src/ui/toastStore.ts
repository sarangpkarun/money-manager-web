import { create } from 'zustand'

export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: number
  message: string
  actions: ToastAction[]
  /** ms before auto-dismiss */
  duration: number
}

interface ToastState {
  toasts: Toast[]
  show: (t: { message: string; actions?: ToastAction[]; duration?: number }) => number
  dismiss: (id: number) => void
}

let next = 1
const MAX = 3

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  show: ({ duration = 5000, actions = [], message }) => {
    const id = next++
    set((s) => ({ toasts: [...s.toasts, { id, duration, actions, message }].slice(-MAX) }))
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Runs one action of a toast (at most once) and removes the toast. */
export function runToastAction(id: number, index = 0) {
  const t = useToasts.getState().toasts.find((x) => x.id === id)
  useToasts.getState().dismiss(id)
  t?.actions[index]?.run()
}

/** "Deleted · Undo". */
export const showUndo = (message: string, onUndo: () => void, label = 'Undo') =>
  useToasts.getState().show({ message, actions: [{ label, run: onUndo }] })
