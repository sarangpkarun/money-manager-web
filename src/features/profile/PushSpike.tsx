import { useState } from 'react'

const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Phase 0 spike: subscribe this device and show the subscription JSON so scripts/push-test.mjs can send one push. */
export default function PushSpike() {
  const [out, setOut] = useState('')
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (!key) return null

  const enable = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window))
        return setOut('Push not supported here. On iPhone, install to Home Screen first (iOS 16.4+).')
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return setOut(`Permission: ${perm}`)
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) })
      setOut(JSON.stringify(sub))
    } catch (e) {
      setOut(String(e))
    }
  }
  return (
    <div className="mx-4 mt-3 space-y-2 rounded-2xl bg-surface p-4">
      <button onClick={enable} className="h-11 w-full rounded-lg bg-surface-2">Enable test push (spike)</button>
      {out && <textarea readOnly value={out} onFocus={(e) => e.currentTarget.select()} className="h-28 w-full rounded-lg border border-line bg-surface-2 p-2 text-xs" />}
    </div>
  )
}
