import { describe, expect, it } from 'vitest'
import { bundleSecrets, fileSecrets, foreignHosts, hostsIn, jwtsIn } from '../../scripts/security.mjs'

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (payload: object) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signaturesignature`

describe('hosts', () => {
  it('finds distinct hosts in URLs, ignoring case and trailing dots', () => {
    expect(hostsIn('a https://Example.com/x b http://example.com. c https://cdn.evil.io:8080/y').sort()).toEqual(['cdn.evil.io', 'example.com'])
    expect(hostsIn('no urls here')).toEqual([])
  })
  it('allows documentation links and the app’s own Supabase host, flags everything else', () => {
    const text = 'https://www.w3.org/2000/svg https://react.dev/errors/1 https://abc.supabase.co/rest/v1 https://analytics.example.com/collect http://localhost:5173'
    expect(foreignHosts(text, 'https://abc.supabase.co')).toEqual(['analytics.example.com'])
    expect(foreignHosts(text)).toEqual(['abc.supabase.co', 'analytics.example.com'])
  })
  it('known trackers are never allowed', () => {
    for (const h of ['www.google-analytics.com', 'sentry.io', 'api.segment.io', 'cdn.mxpnl.com', 'connect.facebook.net']) expect(foreignHosts(`https://${h}/x`)).toEqual([h])
  })
})

describe('jwtsIn', () => {
  it('decodes the role and issuer of every JWT-looking string', () => {
    const t = `a=${jwt({ role: 'anon', iss: 'supabase' })} b=${jwt({ role: 'service_role', iss: 'supabase' })}`
    expect(jwtsIn(t).map((j) => [j.role, j.iss])).toEqual([['anon', 'supabase'], ['service_role', 'supabase']])
  })
  it('a string that only looks like a JWT is reported as unreadable, not trusted', () => {
    expect(jwtsIn('eyJhbGciOiJIUzI1NiJ9.eyJ4eHh4eHh4eHh4.sig')[0]?.role).toBe('unreadable')
  })
})

describe('bundleSecrets', () => {
  it('an anon key is fine', () => expect(bundleSecrets(`key="${jwt({ role: 'anon' })}"`)).toEqual([]))
  it('flags a service_role JWT, the word, a secret key and a private key', () => {
    expect(bundleSecrets(jwt({ role: 'service_role' }))).toEqual(['JWT with role "service_role"'])
    expect(bundleSecrets('const role = "service_role"')).toEqual(['the word service_role'])
    expect(bundleSecrets('sb_secret_abcdefghijklmnop')).toEqual(['a Supabase secret key'])
    expect(bundleSecrets('-----BEGIN PRIVATE KEY-----\nabc')).toEqual(['a private key'])
  })
  it('flags unreadable and unknown-role tokens too', () => {
    expect(bundleSecrets(jwt({ role: 'postgres' }))).toEqual(['JWT with role "postgres"'])
    expect(bundleSecrets('eyJhbGciOiJIUzI1NiJ9.eyJ4eHh4eHh4eHh4.sig')).toEqual(['JWT with role "unreadable"'])
  })
})

describe('fileSecrets', () => {
  it('the public local-stack demo service key is allowed, a real-looking one is not', () => {
    expect(fileSecrets(jwt({ role: 'service_role', iss: 'supabase-demo' }))).toEqual([])
    expect(fileSecrets(jwt({ role: 'service_role', iss: 'supabase' }))).toEqual(['a service_role JWT'])
  })
  it('flags keys, tokens and private values', () => {
    expect(fileSecrets('sb_secret_abcdefghijklmnop')).toEqual(['a Supabase secret key'])
    expect(fileSecrets('{"private_key": "-----BEGIN PRIVATE KEY-----\\nabc"}')).toContain('a service-account private_key')
    expect(fileSecrets('VAPID_PRIVATE_KEY=' + 'a'.repeat(43))).toEqual(['a VAPID private key'])
    expect(fileSecrets('AKIAABCDEFGHIJKLMNOP')).toEqual(['an AWS access key'])
    expect(fileSecrets('ghp_' + 'a'.repeat(36))).toEqual(['a GitHub token'])
    expect(fileSecrets("CRON_SECRET = 'abcdefghijklmnopqrstuvwxyz'")).toEqual(['the cron secret'])
  })
  it('names of secrets without values are fine (docs, README, config)', () => {
    expect(fileSecrets('Set VAPID_PRIVATE_KEY in the project secrets. CRON_SECRET lives in the database.')).toEqual([])
    expect(fileSecrets('VAPID_PRIVATE_KEY=')).toEqual([])
  })
})
