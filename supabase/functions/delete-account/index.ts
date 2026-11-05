// "Delete account" in Settings: removes the caller's auth user; every table cascades from it. Needs the caller's JWT.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleDelete } from '../_shared/deleteAccount.ts'
import { CORS, json } from '../_shared/util.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const r = await handleDelete(req.method, req.headers.get('Authorization'), {
    getUser: async (authorization) => {
      const who = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
      const { data: { user } } = await who.auth.getUser()
      return user ? { id: user.id } : null
    },
    deleteUser: async (id) => {
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) throw error
    },
  })
  return json(r.body, r.status)
})
