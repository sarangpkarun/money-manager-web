/** Building the files for Settings, Export. Everything runs in the browser; nothing is sent anywhere. */

export const EXPORT_TABLES = ['accounts', 'categories', 'people', 'transactions', 'entries', 'schedule_items', 'payments', 'notes', 'budgets', 'recurring'] as const
export type ExportTable = (typeof EXPORT_TABLES)[number]

/** Reads a table page by page until a short page comes back. `fetchPage(from, to)` is inclusive on both ends. */
export async function fetchAll<T>(fetchPage: (from: number, to: number) => Promise<T[]>, opts: { pageSize?: number; onProgress?: (n: number) => void; maxRows?: number } = {}): Promise<T[]> {
  const size = opts.pageSize ?? 1000
  const max = opts.maxRows ?? 2_000_000
  const rows: T[] = []
  for (let from = 0; rows.length < max; from += size) {
    const page = await fetchPage(from, from + size - 1)
    rows.push(...page)
    opts.onProgress?.(rows.length)
    if (page.length < size) break
  }
  return rows
}

export interface ExportDocument {
  app: 'money-manager'
  format_version: 1
  exported_at: string
  profile: Record<string, unknown> | null
  counts: Record<string, number>
  tables: Record<string, unknown[]>
}

/** One JSON document with every table the user owns (push subscriptions are not part of it). */
export function buildExportJson(tables: Partial<Record<ExportTable, unknown[]>>, profile: Record<string, unknown> | null, now: Date = new Date()): ExportDocument {
  const out: Record<string, unknown[]> = {}
  const counts: Record<string, number> = {}
  for (const t of EXPORT_TABLES) { out[t] = tables[t] ?? []; counts[t] = out[t]!.length }
  return { app: 'money-manager', format_version: 1, exported_at: now.toISOString(), profile, counts, tables: out }
}

/**
 * One CSV cell. Quotes cells with commas, quotes or line breaks. For free text, a leading = + - @ (or tab / carriage return) gets a
 * quote mark in front so a spreadsheet shows the text instead of running it as a formula.
 */
export function csvCell(value: unknown, opts: { text?: boolean } = {}): string {
  let s = value === null || value === undefined ? '' : String(value)
  if (opts.text && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

interface Named { id: string; name: string }
interface Txn {
  id: string; kind: string; amount_paise: number; for_other_paise: number | null; date: string; account_id: string | null; to_account_id: string | null; category_id: string | null
  title: string | null; place: string | null; notes: string | null; tags: string[] | null; created_at?: string | null
}

const KIND_NAME: Record<string, string> = { expense: 'Spent', income: 'Received', transfer: 'Transfer', debt_out: 'Lent or repaid', debt_in: 'Received back' }
const rupees = (paise: number): string => (paise / 100).toFixed(2)

export const CSV_HEADER = ['Date', 'Type', 'Amount', 'Account', 'To account', 'Category', 'Title', 'Place', 'Notes', 'Tags', 'Paid for others', 'Your share']

/** Transactions as a CSV (newest first) with account and category names instead of ids and amounts in rupees. */
export function transactionsCsv(txns: Txn[], accounts: Named[], categories: Named[]): string {
  const acc = new Map(accounts.map((a) => [a.id, a.name]))
  const cat = new Map(categories.map((c) => [c.id, c.name]))
  const sorted = [...txns].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.created_at ?? '').localeCompare(a.created_at ?? '')))
  const lines = [CSV_HEADER.join(',')]
  for (const t of sorted) {
    const other = t.for_other_paise ?? 0
    lines.push([
      csvCell(t.date), csvCell(KIND_NAME[t.kind] ?? t.kind), csvCell(rupees(t.amount_paise)),
      csvCell(t.account_id ? acc.get(t.account_id) : '', { text: true }), csvCell(t.to_account_id ? acc.get(t.to_account_id) : '', { text: true }), csvCell(t.category_id ? cat.get(t.category_id) : '', { text: true }),
      csvCell(t.title, { text: true }), csvCell(t.place, { text: true }), csvCell(t.notes, { text: true }), csvCell((t.tags ?? []).join(' '), { text: true }),
      csvCell(other ? rupees(other) : ''), csvCell(t.kind === 'expense' ? rupees(t.amount_paise - other) : ''),
    ].join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

export const exportFileName = (kind: 'json' | 'csv', today: string): string => `money-manager-${today}.${kind}`

export type SaveResult = 'shared' | 'downloaded' | 'cancelled'

/**
 * Hands the file to the user: the share sheet where the browser can share files (iPhone: Save to Files, AirDrop …), otherwise a download.
 * Must be called from a tap.
 */
export async function saveFile(name: string, content: string, mime: string, env: { navigator?: Navigator; document?: Document; URL?: typeof URL } = {}): Promise<SaveResult> {
  const nav = env.navigator ?? navigator
  const doc = env.document ?? document
  const url = env.URL ?? URL
  const file = new File([content], name, { type: mime })
  if (typeof nav.canShare === 'function' && typeof nav.share === 'function' && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // sharing failed for another reason: fall back to a plain download
    }
  }
  const href = url.createObjectURL(file)
  const a = doc.createElement('a')
  a.href = href
  a.download = name
  doc.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => url.revokeObjectURL(href), 10_000)
  return 'downloaded'
}
