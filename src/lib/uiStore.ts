import { create } from 'zustand'
import type { ActivityRow } from './db'

export interface QuickAddPrefill {
  date?: string
  kind?: 'expense' | 'income' | 'transfer'
  accountId?: string
  /** Edit this existing transaction instead of adding a new one. */
  edit?: ActivityRow
}

interface UiState {
  /** Selected month as yyyy-MM */
  month: string
  setMonth: (m: string) => void
  quickAddOpen: boolean
  quickAddPrefill: QuickAddPrefill | null
  setQuickAddOpen: (o: boolean) => void
  /** Opens Quick Add, optionally pre-filled (e.g. a calendar day, or "add another"). */
  openQuickAdd: (prefill?: QuickAddPrefill) => void
}

const now = new Date()
export const useUi = create<UiState>((set) => ({
  month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  setMonth: (month) => set({ month }),
  quickAddOpen: false,
  quickAddPrefill: null,
  setQuickAddOpen: (quickAddOpen) => set(quickAddOpen ? { quickAddOpen } : { quickAddOpen, quickAddPrefill: null }),
  openQuickAdd: (prefill) => set({ quickAddOpen: true, quickAddPrefill: prefill ?? null }),
}))
