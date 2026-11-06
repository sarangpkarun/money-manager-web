import { nextCardDue } from '@/lib/cardCycle'
import { addMonths, startOfMonth, parseDate, type DateStr } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { utilisationBps } from '@/features/accounts/utilisation'

/** Output of the `insight_facts` RPC (money in whole paise). */
export interface InsightFacts {
  month: { spent_paise: number; prev_total_paise: number; days_elapsed: number; days_in_month: number }
  categories: { id: string | null; name: string; this_paise: number; prev_to_date_paise: number }[]
  people_overdue: { person_id: string | null; name: string; overdue_paise: number; days_late: number; entry_id: string }[]
  largest_outstanding: { person_id: string | null; name: string; outstanding_paise: number } | null
  cards: { id: string; name: string; outstanding_paise: number; limit_paise: number; due_day: number | null }[]
  for_others_aged: { entry_id: string; person_id?: string | null; name: string; left_paise: number; days: number }[]
  streak: { early_this_year: number; late_this_year: number; early_in_a_row: number }
  budgets: { category_id: string | null; name: string; limit_paise: number; spent_paise: number }[]
  largest_spend: { id: string; title: string | null; amount_paise: number; date: string; category_id?: string | null; category: string | null } | null
  top_account: { id: string; name: string; count: number } | null
}

export interface Insight {
  id: string
  /** higher = more important; used for ranking */
  severity: number
  text: string
  /** where a tap goes: a route and (for Activity) its filter query string */
  drill: { path: string; search?: string }
}

/** Thresholds, in one place. */
export const T = {
  MAX_SHOWN: 5,
  /** category and projection rules wait until this day of the month so a few early purchases do not swing the percentages */
  MIN_DAY: 5,
  CATEGORY_CHANGE_PCT: 20,
  /** ... and the change must be at least ₹500 */
  CATEGORY_MIN_CHANGE_PAISE: 50_000,
  MAX_CATEGORY_INSIGHTS: 2,
  PROJECTION_DIFF_PCT: 15,
  OVERDUE_DAYS: 7,
  MAX_PEOPLE_INSIGHTS: 2,
  UTILISATION_BPS: 5000,
  BILL_DAYS: 5,
  FOR_OTHERS_DAYS: 30,
  MAX_FOR_OTHERS_INSIGHTS: 2,
  EARLY_STREAK: 3,
  EARLY_THIS_YEAR: 2,
  BUDGET_NEAR_PCT: 80,
  TOP_ACCOUNT_MIN: 3,
} as const

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthName = (d: DateStr): string => MONTH_NAMES[parseDate(d).m - 1] as string
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`
const pct = (part: number, whole: number): number => Math.round((part * 100) / whole)

const activity = (params: Record<string, string>): Insight['drill'] => ({ path: '/activity', search: `?${new URLSearchParams(params).toString()}` })
const entryPath = (id: string): Insight['drill'] => ({ path: `/money/entry/${id}` })

function categoryInsights(f: InsightFacts, today: DateStr): Insight[] {
  if (f.month.days_elapsed < T.MIN_DAY) return []
  const prev = monthName(startOfMonth(addMonths(today, -1)))
  return f.categories
    .filter((c) => c.prev_to_date_paise > 0 && Math.abs(c.this_paise - c.prev_to_date_paise) >= T.CATEGORY_MIN_CHANGE_PAISE)
    .map((c) => ({ c, change: pct(c.this_paise - c.prev_to_date_paise, c.prev_to_date_paise) }))
    .filter(({ change }) => Math.abs(change) > T.CATEGORY_CHANGE_PCT)
    .sort((x, y) => Math.abs(y.c.this_paise - y.c.prev_to_date_paise) - Math.abs(x.c.this_paise - x.c.prev_to_date_paise) || x.c.name.localeCompare(y.c.name))
    .slice(0, T.MAX_CATEGORY_INSIGHTS)
    .map(({ c, change }) => ({
      id: `category:${c.id ?? 'none'}`,
      // spending more is worth a look; spending less is good news and ranks low
      severity: change > 0 ? 60 + Math.min(change, 100) / 10 : 20,
      text: `${c.name} spend ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% vs ${prev} so far`,
      drill: activity({ ...(c.id ? { cat: c.id } : {}), d: 'month', type: 'spend' }),
    }))
}

function projectionInsight(f: InsightFacts, today: DateStr): Insight[] {
  const m = f.month
  if (m.days_elapsed < T.MIN_DAY || m.prev_total_paise <= 0 || m.spent_paise <= 0) return []
  const projected = Math.round((m.spent_paise / m.days_elapsed) * m.days_in_month)
  const diff = pct(projected - m.prev_total_paise, m.prev_total_paise)
  if (Math.abs(diff) < T.PROJECTION_DIFF_PCT) return []
  const prev = monthName(startOfMonth(addMonths(today, -1)))
  return [{
    id: 'projection',
    severity: diff > 0 ? 55 : 15,
    text: `On track to spend ${formatMoney(projected)} this month, ${Math.abs(diff)}% ${diff > 0 ? 'more' : 'less'} than ${prev} (${formatMoney(m.prev_total_paise)})`,
    drill: activity({ d: 'month', type: 'spend' }),
  }]
}

function peopleInsights(f: InsightFacts): Insight[] {
  const out: Insight[] = f.people_overdue
    .filter((p) => p.days_late > T.OVERDUE_DAYS)
    .slice(0, T.MAX_PEOPLE_INSIGHTS)
    .map((p) => ({
      id: `overdue:${p.person_id ?? p.name}`,
      severity: 90 + Math.min(p.days_late, 90) / 10,
      text: `${p.name} is ${plural(p.days_late, 'day')} late on ${formatMoney(p.overdue_paise)}`,
      drill: entryPath(p.entry_id),
    }))
  const big = f.largest_outstanding
  const alreadyNamed = big && f.people_overdue.some((p) => p.days_late > T.OVERDUE_DAYS && (p.person_id ?? p.name) === (big.person_id ?? big.name))
  if (big && big.outstanding_paise > 0 && !alreadyNamed) {
    out.push({ id: `largest:${big.person_id ?? big.name}`, severity: 25, text: `${big.name} owes you the most: ${formatMoney(big.outstanding_paise)}`, drill: { path: '/money' } })
  }
  return out
}

function cardInsights(f: InsightFacts, today: DateStr): Insight[] {
  const out: Insight[] = []
  for (const c of f.cards) {
    const drill = activity({ acc: c.id })
    const bps = utilisationBps(c.outstanding_paise, c.limit_paise)
    if (bps !== null && bps > T.UTILISATION_BPS) {
      out.push({ id: `utilisation:${c.id}`, severity: 70 + Math.min(Math.round((bps - T.UTILISATION_BPS) / 500), 10), text: `${c.name} is ${Math.round(bps / 100)}% used (${formatMoney(c.outstanding_paise)} of ${formatMoney(c.limit_paise)})`, drill })
    }
    const due = nextCardDue(c.due_day, today)
    if (due && due.days <= T.BILL_DAYS && c.outstanding_paise > 0) {
      const when = due.days === 0 ? 'today' : due.days === 1 ? 'tomorrow' : `in ${due.days} days`
      out.push({ id: `bill:${c.id}`, severity: 85 - due.days, text: `${c.name} bill of ${formatMoney(c.outstanding_paise)} is due ${when}`, drill })
    }
  }
  return out
}

function forOthersInsights(f: InsightFacts): Insight[] {
  return f.for_others_aged
    .filter((g) => g.days > T.FOR_OTHERS_DAYS && g.left_paise > 0)
    .slice(0, T.MAX_FOR_OTHERS_INSIGHTS)
    .map((g) => ({
      id: `for-others:${g.entry_id}`,
      severity: 75 + Math.min(g.days, 120) / 20,
      text: `${g.name} still owes ${formatMoney(g.left_paise)} for what you paid, ${plural(g.days, 'day')} ago`,
      drill: entryPath(g.entry_id),
    }))
}

function streakInsights(f: InsightFacts): Insight[] {
  const s = f.streak
  const out: Insight[] = []
  if (s.late_this_year > 0) out.push({ id: 'late-payments', severity: 50, text: `${plural(s.late_this_year, 'payment')} paid late this year`, drill: { path: '/money' } })
  if (s.early_in_a_row >= T.EARLY_STREAK) out.push({ id: 'early-streak', severity: 18, text: `${s.early_in_a_row} payments in a row paid early`, drill: { path: '/money' } })
  else if (s.early_this_year >= T.EARLY_THIS_YEAR) out.push({ id: 'early-payments', severity: 15, text: `${plural(s.early_this_year, 'payment')} paid early this year`, drill: { path: '/money' } })
  return out
}

function budgetInsights(f: InsightFacts): Insight[] {
  return f.budgets
    .filter((b) => b.limit_paise > 0 && pct(b.spent_paise, b.limit_paise) >= T.BUDGET_NEAR_PCT)
    .map((b) => {
      const used = pct(b.spent_paise, b.limit_paise)
      const over = b.spent_paise > b.limit_paise
      return {
        id: `budget:${b.category_id ?? 'overall'}`,
        severity: over ? 95 : 65,
        text: over
          ? `${b.name} budget is over by ${formatMoney(b.spent_paise - b.limit_paise)} (${formatMoney(b.spent_paise)} of ${formatMoney(b.limit_paise)})`
          : `${b.name} budget is ${used}% used (${formatMoney(b.spent_paise)} of ${formatMoney(b.limit_paise)})`,
        drill: activity({ ...(b.category_id ? { cat: b.category_id } : {}), d: 'month', type: 'spend' }),
      }
    })
}

function highlightInsights(f: InsightFacts): Insight[] {
  const out: Insight[] = []
  const big = f.largest_spend
  if (big && big.amount_paise > 0) {
    out.push({
      id: 'largest-spend', severity: 10,
      text: `Biggest spend this month: ${formatMoney(big.amount_paise)}${big.category ? ` on ${big.category}` : big.title ? ` (${big.title})` : ''}`,
      drill: activity({ d: 'month', type: 'spend', ...(big.category_id ? { cat: big.category_id } : {}) }),
    })
  }
  const top = f.top_account
  if (top && top.count >= T.TOP_ACCOUNT_MIN) {
    out.push({ id: 'top-account', severity: 5, text: `Most used account this month: ${top.name} (${plural(top.count, 'payment')})`, drill: activity({ acc: top.id, d: 'month' }) })
  }
  return out
}

/** Turns the facts into at most five insights, most important first (ties by id so the order never jumps around). */
export function buildInsights(f: InsightFacts, today: DateStr): Insight[] {
  return [
    ...peopleInsights(f), ...cardInsights(f, today), ...forOthersInsights(f), ...budgetInsights(f),
    ...categoryInsights(f, today), ...projectionInsight(f, today), ...streakInsights(f), ...highlightInsights(f),
  ]
    .sort((a, b) => b.severity - a.severity || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, T.MAX_SHOWN)
}

/** Facts for an account with nothing in it (also what an old cached result without a field falls back to). */
export const EMPTY_FACTS: InsightFacts = {
  month: { spent_paise: 0, prev_total_paise: 0, days_elapsed: 1, days_in_month: 30 },
  categories: [], people_overdue: [], largest_outstanding: null, cards: [], for_others_aged: [],
  streak: { early_this_year: 0, late_this_year: 0, early_in_a_row: 0 }, budgets: [], largest_spend: null, top_account: null,
}

/** Reads the RPC result defensively: missing or malformed parts become empty, so one bad field never hides the whole card. */
export function parseFacts(raw: unknown): InsightFacts {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  const obj = <T,>(v: unknown, fallback: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? { ...fallback, ...(v as object) } as T : fallback)
  return {
    month: obj(o.month, EMPTY_FACTS.month),
    categories: arr(o.categories), people_overdue: arr(o.people_overdue),
    largest_outstanding: o.largest_outstanding && typeof o.largest_outstanding === 'object' ? (o.largest_outstanding as InsightFacts['largest_outstanding']) : null,
    cards: arr(o.cards), for_others_aged: arr(o.for_others_aged),
    streak: obj(o.streak, EMPTY_FACTS.streak), budgets: arr(o.budgets),
    largest_spend: o.largest_spend && typeof o.largest_spend === 'object' ? (o.largest_spend as InsightFacts['largest_spend']) : null,
    top_account: o.top_account && typeof o.top_account === 'object' ? (o.top_account as InsightFacts['top_account']) : null,
  }
}
