import { useEffect, useState } from 'react'
import { useProfile, useUpdateProfile } from '@/features/profile/useProfile'
import { deviceStatus, disablePush, enablePush, vapidPublicKey, type DeviceStatus } from '@/lib/push'
import { alarmNote, formFromProfile, profilePatch, validateReminders, type ReminderForm } from '@/lib/reminderSettings'
import { supabase } from '@/lib/supabase'
import { Chip } from '@/ui/Chip'
import { Field, inputCls, primaryBtn, secondaryBtn } from '@/ui/Field'
import { PageHeader } from '@/ui/PageHeader'
import { useToasts } from '@/ui/toastStore'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const WHY: Record<string, string> = {
  'needs-install': 'On iPhone, notifications only work for the app installed on your Home Screen. Tap Share, then Add to Home Screen, and open Money Manager from there.',
  unsupported: "This browser can't receive push notifications.",
  denied: 'Notifications are blocked for this app. Allow them in your phone settings (Settings, Notifications, Money Manager) and try again.',
  'no-key': 'Push is not set up for this build (missing public key).',
}

export default function RemindersScreen() {
  const { data: profile } = useProfile()
  const save = useUpdateProfile()
  const [device, setDevice] = useState<DeviceStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState<ReminderForm | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const toast = useToasts.getState

  const refresh = () => void deviceStatus().then(setDevice)
  useEffect(refresh, [])
  if (profile && form === null) setForm(formFromProfile(profile))
  const set = <K extends keyof ReminderForm>(k: K, v: ReminderForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))

  const enable = async () => {
    setBusy(true); setMessage(null)
    const r = await enablePush(async (s) => {
      const { error } = await supabase.rpc('claim_push_subscription', { p_endpoint: s.endpoint, p_keys: s.keys, p_user_agent: s.userAgent })
      if (error) throw error
    })
    setBusy(false)
    if (!r.ok) setMessage(WHY[r.reason] ?? r.message ?? 'Could not turn notifications on.')
    else toast().show({ message: 'Notifications are on for this device' })
    refresh()
  }
  const disable = async () => {
    setBusy(true)
    await disablePush(async (endpoint) => { await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint) })
    setBusy(false)
    toast().show({ message: 'Notifications are off for this device' })
    refresh()
  }
  const sendTest = async () => {
    setBusy(true); setMessage(null)
    const { data, error } = await supabase.functions.invoke('send-test')
    setBusy(false)
    if (error) return setMessage(`Couldn't send the test: ${error.message}`)
    const r = data as { devices: number; sent: number; failed: number }
    setMessage(r.sent > 0 ? `Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}. It should arrive in a few seconds.` : r.devices === 0 ? 'No device is registered yet.' : "The push service didn't accept it. Turn notifications off and on again.")
  }
  const saveForm = async () => {
    if (!form) return
    const e = validateReminders(form)
    setErrors(e)
    if (Object.keys(e).length) return
    try {
      await save.mutateAsync(profilePatch(form))
      toast().show({ message: 'Reminder settings saved' })
    } catch (err) {
      setErrors({ form: (err as Error).message })
    }
  }

  const note = form ? alarmNote(form) : null
  const on = !!device?.subscribed && device.permission === 'granted'
  const blocked = device && device.support === 'ok' && device.permission === 'denied'

  return (
    <div>
      <PageHeader title="Reminders" back="/settings" backLabel="Settings" />
      <div className="space-y-4 px-4 pb-8">
        <section aria-label="This device" className="space-y-3 rounded-2xl bg-surface p-4">
          <h2 className="font-medium">This device</h2>
          {device === null ? <p className="text-muted">Checking…</p> : (
            <>
              <p className="text-sm text-muted" aria-live="polite">
                {on ? 'Notifications are on.' : device.support === 'needs-install' ? WHY['needs-install'] : device.support === 'unsupported' ? WHY.unsupported : blocked ? WHY.denied : 'Notifications are off.'}
              </p>
              {device.support === 'ok' && !vapidPublicKey() && <p className="text-sm text-money-red">{WHY['no-key']}</p>}
              {device.support === 'ok' && !on && !blocked && <button className={primaryBtn} disabled={busy} onClick={() => void enable()}>Turn on notifications</button>}
              {on && (
                <div className="grid grid-cols-2 gap-3">
                  <button className={secondaryBtn} disabled={busy} onClick={() => void sendTest()}>Send a test</button>
                  <button className={secondaryBtn} disabled={busy} onClick={() => void disable()}>Turn off</button>
                </div>
              )}
              {message && <p role="status" className="text-sm">{message}</p>}
            </>
          )}
        </section>

        {form && (
          <>
            <section aria-label="When" className="space-y-3 rounded-2xl bg-surface p-4">
              <h2 className="font-medium">When reminders arrive</h2>
              <p className="text-sm text-muted">The day before a payment is due, on the day, and the day after if it is still unpaid.</p>
              <Field label="Reminder time" error={errors.alarm}><input type="time" className={inputCls} value={form.alarm} onChange={(e) => set('alarm', e.target.value)} /></Field>
              {note && <p role="note" className="text-sm text-money-amber">{note}</p>}
            </section>

            <section aria-label="Quiet hours" className="space-y-3 rounded-2xl bg-surface p-4">
              <label className="flex min-h-11 items-center justify-between">
                <span className="font-medium">Quiet hours</span>
                <input type="checkbox" role="switch" aria-label="Quiet hours" checked={form.quietOn} onChange={(e) => set('quietOn', e.target.checked)} className="h-6 w-6" />
              </label>
              {form.quietOn && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="From" error={errors.quietFrom}><input type="time" className={inputCls} value={form.quietFrom} onChange={(e) => set('quietFrom', e.target.value)} /></Field>
                    <Field label="Until" error={errors.quietUntil}><input type="time" className={inputCls} value={form.quietUntil} onChange={(e) => set('quietUntil', e.target.value)} /></Field>
                  </div>
                  <p className="text-sm text-muted">Automatic reminders wait until quiet hours end. A reminder you set yourself on a note still rings on time.</p>
                </>
              )}
            </section>

            <section aria-label="Summary" className="space-y-3 rounded-2xl bg-surface p-4">
              <h2 className="font-medium">Summary</h2>
              <div role="group" aria-label="Summary frequency" className="flex gap-2">
                {(['off', 'daily', 'weekly'] as const).map((m) => <Chip key={m} selected={form.summary === m} onClick={() => set('summary', m)}>{m === 'off' ? 'Off' : m === 'daily' ? 'Daily' : 'Weekly'}</Chip>)}
              </div>
              {form.summary !== 'off' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Time" error={errors.summaryTime}><input type="time" className={inputCls} value={form.summaryTime} onChange={(e) => set('summaryTime', e.target.value)} /></Field>
                  {form.summary === 'weekly' && (
                    <Field label="Day" error={errors.summaryWeekday}>
                      <select className={inputCls} value={form.summaryWeekday} onChange={(e) => set('summaryWeekday', Number(e.target.value))}>
                        {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                      </select>
                    </Field>
                  )}
                </div>
              )}
            </section>

            {errors.form && <p role="alert" className="text-sm text-money-red">{errors.form}</p>}
            <button className={primaryBtn} disabled={save.isPending} onClick={() => void saveForm()}>Save</button>
          </>
        )}
      </div>
    </div>
  )
}
