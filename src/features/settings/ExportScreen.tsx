import { useState } from 'react'
import { useProfile } from '@/features/profile/useProfile'
import { useToday } from '@/features/profile/useToday'
import { EXPORT_TABLES, buildExportJson, exportFileName, fetchAll, saveFile, transactionsCsv, type ExportTable } from '@/lib/exportData'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/ui/PageHeader'
import { primaryBtn } from '@/ui/Field'
import { useToasts } from '@/ui/toastStore'

type Row = Record<string, unknown>

async function readTable(table: ExportTable, onProgress: (n: number) => void): Promise<Row[]> {
  return fetchAll<Row>(async (from, to) => {
    const { data, error } = await supabase.from(table).select('*').order('id').range(from, to)
    if (error) throw new Error(error.message)
    return (data ?? []) as Row[]
  }, { onProgress })
}

export default function ExportScreen() {
  const today = useToday()
  const { data: profile } = useProfile()
  const [busy, setBusy] = useState<'json' | 'csv' | null>(null)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = async (kind: 'json' | 'csv') => {
    setBusy(kind); setError(null); setProgress('')
    try {
      let content: string
      if (kind === 'json') {
        const tables: Partial<Record<ExportTable, Row[]>> = {}
        for (const t of EXPORT_TABLES) {
          setProgress(`Reading ${t.replace('_', ' ')}…`)
          tables[t] = await readTable(t, (n) => setProgress(`Reading ${t.replace('_', ' ')}… ${n}`))
        }
        const own = profile ? ({ ...profile } as Row) : null
        if (own) delete own.id
        content = JSON.stringify(buildExportJson(tables, own), null, 2)
      } else {
        setProgress('Reading transactions…')
        const txns = await readTable('transactions', (n) => setProgress(`Reading transactions… ${n}`))
        const accounts = await readTable('accounts', () => undefined)
        const categories = await readTable('categories', () => undefined)
        content = transactionsCsv(txns as never, accounts as never, categories as never)
      }
      const result = await saveFile(exportFileName(kind, today), content, kind === 'json' ? 'application/json' : 'text/csv')
      if (result !== 'cancelled') useToasts.getState().show({ message: result === 'shared' ? 'Export ready' : 'Export downloaded' })
    } catch (e) {
      setError((e as Error).message || 'Export failed')
    } finally {
      setBusy(null); setProgress('')
    }
  }

  return (
    <div>
      <PageHeader title="Export" back="/settings" backLabel="Settings" />
      <div className="space-y-4 px-4 pb-8">
        <p className="text-muted">Files are built on this device and never uploaded anywhere.</p>
        <section className="space-y-2 rounded-2xl bg-surface p-4">
          <h2 className="font-medium">Everything (JSON)</h2>
          <p className="text-sm text-muted">Accounts, categories, people, transactions, loans and EMIs with their schedules and payments, notes, budgets, repeats and your profile.</p>
          <button className={primaryBtn} disabled={busy !== null} onClick={() => void run('json')}>{busy === 'json' ? 'Preparing…' : 'Export everything'}</button>
        </section>
        <section className="space-y-2 rounded-2xl bg-surface p-4">
          <h2 className="font-medium">Transactions (CSV)</h2>
          <p className="text-sm text-muted">One row per transaction with names and rupee amounts, for a spreadsheet.</p>
          <button className={primaryBtn} disabled={busy !== null} onClick={() => void run('csv')}>{busy === 'csv' ? 'Preparing…' : 'Export transactions'}</button>
        </section>
        <p role="status" aria-live="polite" className="text-sm text-muted">{progress}</p>
        {error && <p role="alert" className="text-money-red">{error}</p>}
      </div>
    </div>
  )
}
