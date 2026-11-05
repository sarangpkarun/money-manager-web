import type { ActivityRow } from '@/lib/db'

export interface BreakdownItem {
  id: string | null
  name: string
  spent: number
  count: number
  icon?: string | null
  color?: string | null
}

export interface DashboardAccount {
  id: string
  name: string
  type: string
  balance_paise: number
  outstanding_paise: number | null
  credit_limit_paise: number | null
  statement_day: number | null
  due_day: number | null
}

/** Shape of `dashboard_summary` (all money in whole paise). */
export interface Dashboard {
  month: {
    month: string; start: string; end: string
    spent: number; received: number; saved: number; prev_spent: number; prev_received: number
    days_in_month: number; days_elapsed: number
    avg_daily_spent: number | null; projected_spent: number | null; count: number
  }
  daily: { date: string; spent: number; received: number }[]
  by_category: BreakdownItem[]
  by_account: BreakdownItem[]
  by_place: BreakdownItem[]
  recent: ActivityRow[]
  accounts: DashboardAccount[]
  generated_at: string
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Cheap runtime guard (zod would add ~50 KB to the initial bundle): checks the fields every card relies on so a
 * server/client mismatch shows the error card instead of rendering NaN.
 */
export function parseDashboard(data: unknown): Dashboard {
  const d = data as Partial<Dashboard> | null
  const m = d?.month
  const ok =
    !!d && !!m && ['spent', 'received', 'saved', 'prev_spent', 'days_in_month', 'days_elapsed', 'count'].every((k) => isNum((m as unknown as Record<string, unknown>)[k])) &&
    Array.isArray(d.daily) && Array.isArray(d.by_category) && Array.isArray(d.by_account) && Array.isArray(d.by_place) &&
    Array.isArray(d.recent) && Array.isArray(d.accounts)
  if (!ok) throw new Error('Unexpected dashboard response')
  return d as Dashboard
}
