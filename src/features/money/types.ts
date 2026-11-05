import type { DateStr } from '@/lib/dates'

export type EntryKind = 'lent' | 'borrowed' | 'emi_purchase' | 'instalment'
export type Direction = 'receive' | 'pay'

export interface Ageing { current: number; d1_30: number; d31_60: number; d61_plus: number }

/** Output of `money_stats` (also embedded in the dashboard as `people`). */
export interface MoneyStats {
  owed_to_me: number; overdue_owed_to_me: number; ageing_owed_to_me: Ageing
  i_owe: number; overdue_i_owe: number; ageing_i_owe: Ageing
  open_count: number
}

export interface OverviewEntry {
  id: string; kind: EntryKind; direction: Direction; title: string
  person_id: string | null; person_name: string | null
  principal_paise: number; total_paise: number; paid_paise: number; outstanding_paise: number
  start_date: DateStr
  /** earliest unpaid due date (null when none, or no due date) */
  due_date: DateStr | null
  /** part of `outstanding_paise` that is past its due date */
  overdue_paise: number
  rows_total: number
  rows_paid: number
}

export interface MoneyOverview { stats: MoneyStats; entries: OverviewEntry[] }

export interface HistoryRow {
  id: string; kind: EntryKind; direction: Direction; title: string
  person_id: string | null; person_name: string | null
  principal_paise: number; total_paise: number; paid_paise: number
  start_date: DateStr; due_date: DateStr | null; settled_on: DateStr
}

export interface PersonBalance {
  person_id: string; name: string; phone: string | null; email: string | null; archived: boolean | null
  owed_to_me_paise: number; i_owe_paise: number; open_count: number; entry_count: number; last_entry_date: DateStr | null
}
