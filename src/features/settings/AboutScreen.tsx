import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/queryKeys'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/ui/PageHeader'

const host = (): string => {
  try { return new URL(import.meta.env.VITE_SUPABASE_URL as string).host } catch { return '' }
}

interface LoggedError { id: string; at: string; kind: string; message: string; route: string; app_version: string }

/** The app's own error log (scrubbed, kept 60 days, visible only to you). */
function RecentErrors() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: qk.clientErrors,
    queryFn: async (): Promise<LoggedError[]> => {
      const { data, error } = await supabase.from('client_errors').select('id, at, kind, message, route, app_version').order('at', { ascending: false }).limit(20)
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
  const clear = useMutation({
    mutationFn: async () => { const { error } = await supabase.from('client_errors').delete().gte('at', '1970-01-01'); if (error) throw new Error(error.message) },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.clientErrors }),
  })
  const rows = q.data ?? []
  return (
    <section aria-label="Recent errors" className="mx-4 mt-4 rounded-2xl bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium">Recent errors</h2>
        {rows.length > 0 && <button onClick={() => clear.mutate()} disabled={clear.isPending} className="min-h-11 px-2 text-sm font-medium text-accent">Clear</button>}
      </div>
      {q.isError ? <p className="text-sm text-muted">Couldn't load the error log.</p>
        : q.isPending ? <p className="text-sm text-muted">Loading…</p>
        : rows.length === 0 ? <p className="text-sm text-muted">None. Errors are kept for 60 days and only you can see them. Numbers, emails and links are removed before they are saved.</p>
        : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="py-2 text-sm">
                <div className="flex justify-between gap-2 text-muted"><span>{new Date(r.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span><span>{r.kind} · {r.app_version}</span></div>
                <div className="break-words">{r.message}</div>
                <div className="text-muted">{r.route}</div>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}

export default function AboutScreen() {
  const built = new Date(__BUILD_TIME__)
  return (
    <div>
      <PageHeader title="About" back="/settings" backLabel="Settings" />
      <dl className="mx-4 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
        <div className="flex min-h-14 items-center justify-between px-4"><dt>App</dt><dd className="text-muted">Money Manager</dd></div>
        <div className="flex min-h-14 items-center justify-between px-4"><dt>Version</dt><dd className="text-muted">{__APP_VERSION__}</dd></div>
        <div className="flex min-h-14 items-center justify-between px-4"><dt>Built</dt><dd className="text-muted">{Number.isNaN(built.getTime()) ? '' : built.toISOString().slice(0, 10)}</dd></div>
        <div className="flex min-h-14 items-center justify-between gap-3 px-4"><dt>Data stored at</dt><dd className="truncate text-muted">{host()}</dd></div>
      </dl>
      <RecentErrors />
    </div>
  )
}
