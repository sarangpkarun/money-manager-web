import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'

// Local-stack demo keys (public, only valid against `supabase start`).
export const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
export const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const SERVICE =
  process.env.SUPABASE_SERVICE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
export const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export const admin = () => createClient(URL, SERVICE, { auth: { persistSession: false } })

export async function sql(query: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: DB_URL })
  await c.connect()
  try {
    return await c.query(query, params)
  } finally {
    await c.end()
  }
}

export interface TestUser {
  id: string
  client: SupabaseClient
}

/** Creates a user and returns a signed-in client. Unverified users get a live JWT but email_confirmed_at = null. */
export async function makeUser(label: string, verified = true): Promise<TestUser> {
  const email = `${label}-${crypto.randomUUID()}@test.local`
  const password = 'Passw0rd!test'
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('createUser failed')
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password })
  if (e2) throw e2
  if (!verified) await sql('update auth.users set email_confirmed_at = null where id = $1', [data.user.id])
  return { id: data.user.id, client }
}

export const deleteUser = (id: string) => admin().auth.admin.deleteUser(id)
