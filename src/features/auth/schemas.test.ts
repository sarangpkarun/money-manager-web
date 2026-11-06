import { describe, expect, it } from 'vitest'
import { forgotSchema, loginSchema, resetSchema, signupSchema } from './schemas'

const msgs = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? [] : r.error!.issues.map((i) => i.message))

describe('password rule (same as the server: 8+ characters, letters and digits)', () => {
  const base = { email: 'a@b.co', confirm: '' }
  const check = (password: string) => msgs(signupSchema.safeParse({ ...base, password, confirm: password }))

  it('accepts letters and digits of 8 or more characters', () => {
    expect(check('abcdefg1')).toEqual([])
    expect(check('Passw0rd!long')).toEqual([])
  })
  it('rejects short, letters-only and digits-only passwords with a specific message', () => {
    expect(check('abc1')).toContain('At least 8 characters')
    expect(check('abcdefgh')).toEqual(['Include at least one number'])
    expect(check('12345678')).toEqual(['Include at least one letter'])
  })
  it('the same rule applies when resetting', () => {
    expect(msgs(resetSchema.safeParse({ password: 'abcdefgh', confirm: 'abcdefgh' }))).toEqual(['Include at least one number'])
    expect(msgs(resetSchema.safeParse({ password: 'abcdefg1', confirm: 'abcdefg2' }))).toEqual(['Passwords do not match'])
  })
})

describe('other auth forms', () => {
  it('login only needs a password to be entered (old accounts may have older passwords)', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true)
    expect(msgs(loginSchema.safeParse({ email: 'a@b.co', password: '' }))).toEqual(['Enter your password'])
  })
  it('emails are trimmed and lower-cased, and must look like emails', () => {
    expect(forgotSchema.parse({ email: '  Sarang@Example.COM ' }).email).toBe('sarang@example.com')
    expect(msgs(forgotSchema.safeParse({ email: 'nope' }))).toEqual(['Enter a valid email'])
  })
  it('signup needs matching confirmation and a short enough name', () => {
    expect(msgs(signupSchema.safeParse({ email: 'a@b.co', password: 'abcdefg1', confirm: 'abcdefg2' }))).toEqual(['Passwords do not match'])
    expect(signupSchema.safeParse({ name: 'x'.repeat(61), email: 'a@b.co', password: 'abcdefg1', confirm: 'abcdefg1' }).success).toBe(false)
  })
})
