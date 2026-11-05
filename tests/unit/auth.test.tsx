import { describe, expect, it } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { deriveStatus } from '@/features/auth/AuthProvider'
import { signupSchema, loginSchema, resetSchema } from '@/features/auth/schemas'

const session = (confirmed: boolean) =>
  ({ user: { email_confirmed_at: confirmed ? '2026-01-01T00:00:00Z' : undefined } }) as unknown as Session

describe('route guard states', () => {
  it('loading until the session is read', () => expect(deriveStatus(null, false, false)).toBe('loading'))
  it('signed out without a session', () => expect(deriveStatus(null, true, false)).toBe('signedOut'))
  it('unverified when email is not confirmed', () => expect(deriveStatus(session(false), true, false)).toBe('unverified'))
  it('ready when verified', () => expect(deriveStatus(session(true), true, false)).toBe('ready'))
  it('recovery wins over ready', () => expect(deriveStatus(session(true), true, true)).toBe('recovery'))
})

describe('auth schemas', () => {
  it('normalises and validates email', () => {
    expect(loginSchema.parse({ email: '  A@B.com ', password: 'x' }).email).toBe('a@b.com')
    expect(loginSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false)
  })
  it('requires matching passwords of 8+ chars', () => {
    expect(signupSchema.safeParse({ email: 'a@b.com', password: 'short', confirm: 'short' }).success).toBe(false)
    expect(signupSchema.safeParse({ email: 'a@b.com', password: 'longenough', confirm: 'different1' }).success).toBe(false)
    expect(signupSchema.safeParse({ email: 'a@b.com', password: 'longenough', confirm: 'longenough' }).success).toBe(true)
    expect(resetSchema.safeParse({ password: 'longenough', confirm: 'longenough' }).success).toBe(true)
  })
})
