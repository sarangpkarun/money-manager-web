// "Send test notification" in Settings: sends one push to every device of the signed-in caller. Needs the caller's JWT.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { CORS, json } from '../_shared/util.ts'
import { sendPush } from '../_shared/webpush.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const auth = req.headers.get('Authorization') ?? ''
  const url = Deno.env.get('SUPABASE_URL')!
  const who = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data: { user } } = await who.auth.getUser()
  if (!user) return json({ error: 'unauthorized' }, 401)

  const vapid = {
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    subject: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  }
  if (!vapid.publicKey || !vapid.privateKey) return json({ error: 'VAPID keys are not configured' }, 500)

  const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: subs } = await sb.from('push_subscriptions').select('endpoint, keys').eq('user_id', user.id)
  let sent = 0
  let failed = 0
  for (const s of subs ?? []) {
    try {
      const r = await sendPush({ endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } }, { title: 'Money Manager', body: 'Reminders are working on this device.', url: '/settings/reminders', tag: 'test' }, vapid, { ttl: 600, urgency: 'high' })
      if (r.status >= 200 && r.status < 300) sent++
      else {
        failed++
        if (r.status === 404 || r.status === 410) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
    } catch { failed++ }
  }
  return json({ devices: (subs ?? []).length, sent, failed })
})
