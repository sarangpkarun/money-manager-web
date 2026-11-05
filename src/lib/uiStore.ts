import { create } from 'zustand'
import type { ActivityRow } from './db'

export interface QuickAddPrefill {
  date?: string
  kind?: 'expense' | 'income' | 'transfer' | 'lent' | 'borrowed'
  /** Lent / Borrowed: pre-select this person. */
  personId?: string
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
  /** Last Activity query string (with leading ?) so the tab restores its filters when you come back. */
  activitySearch: string
  setActivitySearch: (s: string) => void
  /** Home's own filter query string (the Home tab stays mounted, so it is remembered here too). */
  homeSearch: string
  setHomeSearch: (s: string) => void
  /** Opens Quick Add, optionally pre-filled (e.g. a calendar day, or "add another"). */
  openQuickAdd: (prefill?: QuickAddPrefill) => void
}

const now = new Date()
export const useUi = create<UiState>((set) => ({
  month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  setMonth: (month) => set({ month }),
  quickAddOpen: false,
  quickAddPrefill: null,
  activitySearch: '',
  setActivitySearch: (activitySearch) => set({ activitySearch }),
  homeSearch: '',
  setHomeSearch: (homeSearch) => set({ homeSearch }),
  setQuickAddOpen: (quickAddOpen) => set(quickAddOpen ? { quickAddOpen } : { quickAddOpen, quickAddPrefill: null }),
  openQuickAdd: (prefill) => set({ quickAddOpen: true, quickAddPrefill: prefill ?? null }),
}))
