import { create } from 'zustand'

interface UiState {
  /** Selected month as yyyy-MM */
  month: string
  setMonth: (m: string) => void
  quickAddOpen: boolean
  setQuickAddOpen: (o: boolean) => void
}

const now = new Date()
export const useUi = create<UiState>((set) => ({
  month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  setMonth: (month) => set({ month }),
  quickAddOpen: false,
  setQuickAddOpen: (quickAddOpen) => set({ quickAddOpen }),
}))
