import { PageHeader } from '@/ui/PageHeader'

const host = (): string => {
  try { return new URL(import.meta.env.VITE_SUPABASE_URL as string).host } catch { return '' }
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
    </div>
  )
}
