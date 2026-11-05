import { parseDate } from '@/lib/dates'
import type { EmiLoad } from './dashboardTypes'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-12" -> "Dec". */
export const monthShort = (ym: string): string => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym

export interface LoadBar { month: string; label: string; paise: number; fraction: number; first: boolean }

/** 12 monthly bars (fractions of the largest month). The first bar is the current month. */
export function loadBars(load: EmiLoad): LoadBar[] {
  const max = Math.max(0, ...load.months.map((m) => m.due_paise))
  return load.months.map((m, i) => ({ month: m.month, label: monthShort(m.month), paise: m.due_paise, fraction: max > 0 ? m.due_paise / max : 0, first: i === 0 }))
}

/** "Debt-free by Sep 2027 (10 months)"; null when nothing is owed or there is no real due date. */
export function debtFreeText(date: string | null, today: string): string | null {
  if (!date) return null
  const t = parseDate(today), d = parseDate(date)
  const months = Math.max((d.y - t.y) * 12 + (d.m - t.m), 0)
  return `Debt-free by ${MONTHS[d.m - 1]} ${d.y} (${months === 0 ? 'this month' : `${months} month${months === 1 ? '' : 's'}`})`
}
