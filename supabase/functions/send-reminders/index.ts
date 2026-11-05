// Called every 5 minutes by pg_cron (through private.tick). Sends whatever claim_due_reminders hands out.
// Secrets (set with `supabase secrets set`): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by the Edge runtime. Deployed with verify_jwt = false: the shared secret below is the check.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { runSender } from '../_shared/sender.ts'
import { safeEqual, json } from '../_shared/util.ts'
import { sendPush } from '../_shared/webpush.ts'

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // the cron secret is generated inside the database and read here with the service role: it never appears in git
  const { data: secret } = await sb.rpc('get_cron_secret')
  if (typeof secret !== 'string' || !safeEqual(req.headers.get('x-cron-secret') ?? '', secret)) return json({ error: 'unauthorized' }, 401)

  const vapid = {
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    subject: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  }
  if (!vapid.publicKey || !vapid.privateKey) return json({ error: 'VAPID keys are not configured' }, 500)

  try {
    const stats = await runSender({
      claim: async () => {
        const { data, error } = await sb.rpc('claim_due_reminders')
        if (error) throw new Error(error.message)
        return data ?? []
      },
      send: (sub, payload) => sendPush(sub, payload, vapid, { ttl: 6 * 3600 }),
      markSent: async (userId, key) => { await sb.rpc('mark_reminder_sent', { p_user: userId, p_key: key }) },
      release: async (userId, key) => { await sb.rpc('release_reminder', { p_user: userId, p_key: key }) },
      removeSubscription: async (endpoint) => { await sb.from('push_subscriptions').delete().eq('endpoint', endpoint) },
      now: () => Date.now(),
    })
    console.log(JSON.stringify({ at: new Date().toISOString(), ...stats }))
    return json(stats)
  } catch (e) {
    console.error('send-reminders failed', e)
    return json({ error: String(e) }, 500)
  }
})
