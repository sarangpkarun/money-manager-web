import { createClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it } from 'vitest'
import { ANON, URL, admin } from './helpers'

/** The server enforces the password rule itself (config.toml), whatever the client does. */
const created: string[] = []
afterAll(async () => { await Promise.all(created.map((id) => admin().auth.admin.deleteUser(id))) })

const signUp = async (password: string) => {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const r = await c.auth.signUp({ email: `pw-${crypto.randomUUID().slice(0, 8)}@policy.test`, password })
  if (r.data.user?.id) created.push(r.data.user.id)
  return r
}

describe('password policy on the server', () => {
  it('rejects passwords that are too short, without digits or without letters', async () => {
    for (const bad of ['abc1', 'abcdefgh', '12345678']) {
      const { error } = await signUp(bad)
      expect(error, bad).toBeTruthy()
      expect(error?.status).toBe(422)
    }
  })
  it('accepts a password with 8+ characters, letters and digits (and email confirmation is required before data access)', async () => {
    const { data, error } = await signUp('goodpass1')
    expect(error).toBeNull()
    expect(data.user?.email_confirmed_at ?? null).toBeNull() // unconfirmed until the link is clicked
    expect(data.session).toBeNull() // so no session, no data access
  })
})
