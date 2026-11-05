import { useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { disablePush } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import { ConfirmSheet } from '@/ui/ConfirmSheet'
import { Field, inputCls } from '@/ui/Field'
import { PageHeader } from '@/ui/PageHeader'

export const emailMatches = (typed: string, email: string): boolean => !!email && typed.trim().toLowerCase() === email.toLowerCase()

export default function DeleteAccountScreen() {
  const { session } = useAuth()
  const email = session?.user.email ?? ''
  const [typed, setTyped] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    setBusy(true); setError(null)
    try {
      const { error: err } = await supabase.functions.invoke('delete-account')
      if (err) throw new Error('Could not delete the account. Nothing was removed; try again.')
      // Only after the server confirms: stop pushes on this device, then drop the local session (the cache is cleared on sign-out).
      await disablePush(async () => undefined).catch(() => undefined)
      await supabase.auth.signOut({ scope: 'local' })
    } catch (e) {
      setConfirming(false)
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Delete account" back="/settings" backLabel="Settings" />
      <div className="space-y-4 px-4 pb-8">
        <section className="space-y-2 rounded-2xl bg-surface p-4">
          <h2 className="font-medium text-money-red">This cannot be undone</h2>
          <p className="text-sm text-muted">Deleting removes your sign-in and permanently erases everything stored for you:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>accounts, categories, people and every transaction</li>
            <li>loans, EMIs, instalments, schedules and payments</li>
            <li>notes, budgets, repeats and reminders</li>
            <li>your profile and settings</li>
          </ul>
          <p className="text-sm text-muted">Export your data first if you want a copy.</p>
        </section>
        <Field label={`Type ${email} to confirm`}>
          <input className={inputCls} value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" />
        </Field>
        <button className="min-h-12 w-full rounded-xl bg-money-red px-4 font-semibold text-white disabled:opacity-40" disabled={!emailMatches(typed, email) || busy} onClick={() => setConfirming(true)}>Delete my account</button>
        {error && <p role="alert" className="text-money-red">{error}</p>}
      </div>
      {confirming && <ConfirmSheet title="Delete everything?" message="Your account and all its data will be erased permanently. There is no way to get it back." confirmLabel="Delete forever" busy={busy} onConfirm={() => void remove()} onClose={() => setConfirming(false)} />}
    </div>
  )
}
