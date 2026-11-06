import { useMemo, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { useProfile, useUpdateProfile } from '@/features/profile/useProfile'
import { deviceTimeZone, listTimeZones, searchTimeZones } from '@/lib/timezones'
import { Chip } from '@/ui/Chip'
import { Field, inputCls, primaryBtn } from '@/ui/Field'
import { PageHeader } from '@/ui/PageHeader'
import { useToasts } from '@/ui/toastStore'

export const validateName = (name: string): string | null => {
  const n = name.trim()
  if (!n) return 'Enter your name'
  if (n.length > 60) return 'Keep it under 60 characters'
  return null
}

export default function ProfileScreen() {
  const { session } = useAuth()
  const { data: profile } = useProfile()
  const save = useUpdateProfile()
  const [name, setName] = useState<string | null>(null)
  const [tz, setTz] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const zones = useMemo(() => listTimeZones(), [])
  const device = useMemo(() => deviceTimeZone(), [])

  const shownName = name ?? profile?.name ?? ''
  const shownTz = tz ?? profile?.timezone ?? 'Asia/Kolkata'
  const matches = useMemo(() => searchTimeZones(zones, query), [zones, query])
  const dirty = (name !== null && name.trim() !== (profile?.name ?? '')) || (tz !== null && tz !== profile?.timezone)

  const submit = async () => {
    const e = validateName(shownName)
    setNameError(e)
    if (e) return
    setError(null)
    try {
      await save.mutateAsync({ name: shownName.trim(), timezone: shownTz })
      setName(null); setTz(null)
      useToasts.getState().show({ message: 'Profile saved' })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div>
      <PageHeader title="Profile" back="/settings" backLabel="Settings" />
      <div className="space-y-4 px-4 pb-8">
        <section className="space-y-3 rounded-2xl bg-surface p-4">
          <Field label="Name" error={nameError ?? undefined}><input className={inputCls} value={shownName} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
          <div>
            <div className="mb-1 text-sm text-muted">Email</div>
            <div className="min-h-12 rounded-xl bg-surface-2 px-3 py-3 text-muted" aria-label="Email">{session?.user.email ?? ''}</div>
          </div>
          <div>
            <div className="mb-1 text-sm text-muted">Currency</div>
            <div className="min-h-12 rounded-xl bg-surface-2 px-3 py-3 text-muted">INR (₹)</div>
          </div>
        </section>

        <section aria-label="Time zone" className="space-y-3 rounded-2xl bg-surface p-4">
          <h2 className="font-medium">Time zone</h2>
          <p className="text-sm text-muted">It decides what “today” is, when payments are due and when reminders arrive. Now: <span className="text-fg">{shownTz}</span></p>
          {device && device !== shownTz && <Chip onClick={() => setTz(device)}>Use this device: {device}</Chip>}
          <input type="search" aria-label="Search time zones" placeholder="Search, e.g. Kolkata or New York" className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} />
          <div role="listbox" aria-label="Time zones" className="max-h-48 overflow-y-auto rounded-xl bg-surface-2">
            {matches.length === 0 && <p className="px-3 py-3 text-muted">No match</p>}
            {matches.map((z) => (
              <button key={z} role="option" aria-selected={z === shownTz} onClick={() => setTz(z)} className={`flex min-h-11 w-full items-center justify-between px-3 text-left ${z === shownTz ? 'font-semibold text-accent' : ''}`}>
                {z}{z === shownTz ? <span aria-hidden>✓</span> : null}
              </button>
            ))}
          </div>
        </section>

        {error && <p role="alert" className="text-sm text-money-red">{error}</p>}
        <button className={primaryBtn} disabled={!dirty || save.isPending} onClick={() => void submit()}>Save</button>
      </div>
    </div>
  )
}
