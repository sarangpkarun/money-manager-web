import { describe, expect, it } from 'vitest'
import { sql } from './helpers'

/**
 * Security audit of the database itself, not of one feature: anything added later (a table, a view, a function) fails here
 * until it is protected. Run against the local stack like the other RLS tests.
 */

/** Tables with RLS on and no policy at all: only the service role (Edge Functions, cron) can touch them. */
const SERVICE_ONLY = ['reminder_log']
/** Functions in `public` that signed-in users may call directly (everything else must not be executable by them). */
const CALLABLE_HELPERS = ['is_verified', 'claim_push_subscription']
/** The only functions in `public` anyone may call without signing in: constants that touch no data. */
const ANON_CALLABLE = ['ping']

const rows = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) => (await sql(q, params)).rows as T[]

describe('database security audit', () => {
  it('every table in public has row level security on', async () => {
    const t = await rows<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`)
    expect(t.length).toBeGreaterThan(10)
    expect(t.filter((x) => !x.relrowsecurity).map((x) => x.relname)).toEqual([])
  })

  it('every table has policies for signed-in users that are scoped to their own id, or is explicitly service-only', async () => {
    const tables = (await rows<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`)).map((x) => x.relname)
    const policies = await rows<{ tablename: string; policyname: string; permissive: string; roles: string; qual: string | null; with_check: string | null }>(
      `select tablename, policyname, permissive, roles::text, qual, with_check from pg_policies where schemaname = 'public'`)
    for (const t of tables) {
      const mine = policies.filter((p) => p.tablename === t)
      if (SERVICE_ONLY.includes(t)) { expect(mine, `${t} is service-only and must have no policy`).toEqual([]); continue }
      const permissive = mine.filter((p) => p.permissive === 'PERMISSIVE')
      expect(permissive.length, `${t} needs a policy`).toBeGreaterThan(0)
      for (const p of permissive) {
        expect(p.qual ?? '', `${t}.${p.policyname} must filter on auth.uid()`).toMatch(/auth\.uid\(\)/)
        expect(p.with_check ?? '', `${t}.${p.policyname} must check auth.uid() on writes`).toMatch(/auth\.uid\(\)/)
      }
    }
  })

  it('no policy applies to anon or to everyone', async () => {
    const bad = await rows<{ tablename: string; policyname: string; roles: string }>(
      `select tablename, policyname, roles::text from pg_policies where schemaname = 'public' and (roles::text ~ '(^|[{,])(anon|public)([,}]|$)')`)
    expect(bad).toEqual([])
  })

  it('the anon role has no privileges on any table, view or sequence in public', async () => {
    const t = await rows(`select table_name, privilege_type from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'`)
    expect(t).toEqual([])
    const s = await rows(`with seqs as materialized (
                            select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'S')
                          select relname from seqs where has_sequence_privilege('anon', oid, 'usage') or has_sequence_privilege('anon', oid, 'select') or has_sequence_privilege('anon', oid, 'update')`)
    expect(s).toEqual([])
  })

  it('signed-in users cannot TRUNCATE, create triggers on or reference any table (row level security does not cover those)', async () => {
    const t = await rows(`select table_name, privilege_type from information_schema.role_table_grants
                          where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')`)
    expect(t).toEqual([])
  })

  it('views run with the caller’s rights (security_invoker)', async () => {
    const v = await rows<{ relname: string; reloptions: string[] | null }>(
      `select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'v'`)
    expect(v.length).toBeGreaterThan(0)
    expect(v.filter((x) => !(x.reloptions ?? []).includes('security_invoker=true')).map((x) => x.relname)).toEqual([])
  })

  it('the only function in public that anon can execute is the data-free ping', async () => {
    const f = await rows<{ proname: string }>(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                               where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`)
    expect(f.map((x) => x.proname)).toEqual(ANON_CALLABLE)
    const ping = (await rows<{ prosrc: string }>(`select prosrc from pg_proc where proname = 'ping' and pronamespace = 'public'::regnamespace`))[0]!
    expect(ping.prosrc.trim()).toBe("select 'ok'")
  })

  it('every SECURITY DEFINER function pins its search_path', async () => {
    const f = await rows<{ nspname: string; proname: string; proconfig: string[] | null }>(
      `select n.nspname, p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef and n.nspname in ('public', 'private')`)
    expect(f.length).toBeGreaterThan(2)
    expect(f.filter((x) => !(x.proconfig ?? []).some((c) => c.startsWith('search_path='))).map((x) => `${x.nspname}.${x.proname}`)).toEqual([])
  })

  it('SECURITY DEFINER functions callable by signed-in users are the known helpers only; the cron secret reader is service-only', async () => {
    const f = await rows<{ proname: string; auth_x: boolean; anon_x: boolean }>(
      `select p.proname, has_function_privilege('authenticated', p.oid, 'execute') auth_x, has_function_privilege('anon', p.oid, 'execute') anon_x
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.prosecdef and n.nspname = 'public'`)
    expect(f.filter((x) => x.auth_x).map((x) => x.proname).sort()).toEqual([...CALLABLE_HELPERS].sort())
    expect(f.find((x) => x.proname === 'get_cron_secret')).toMatchObject({ auth_x: false, anon_x: false })
  })

  it('the private schema (cron tick, secrets) is closed to anon and signed-in users', async () => {
    const r = await rows<{ role: string; usage: boolean }>(
      `select r as role, has_schema_privilege(r, 'private', 'usage') usage from unnest(array['anon', 'authenticated']) r`)
    expect(r).toEqual([{ role: 'anon', usage: false }, { role: 'authenticated', usage: false }])
    const t = await rows(`select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                          where n.nspname = 'private' and c.relkind in ('r', 'v') and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))`)
    expect(t).toEqual([])
  })

  it('there are no storage buckets (the app stores no files)', async () => {
    const has = (await rows<{ r: string | null }>(`select to_regclass('storage.buckets') r`))[0]?.r
    if (!has) return
    expect((await rows<{ n: number }>(`select count(*)::int n from storage.buckets`))[0]?.n).toBe(0)
  })

  it('service-only tables are closed to anon and signed-in users', async () => {
    for (const t of SERVICE_ONLY) {
      const r = await rows<{ role: string; x: boolean }>(
        `select r as role, has_table_privilege(r, $1, 'select,insert,update,delete') x from unnest(array['anon', 'authenticated']) r`, [`public.${t}`])
      // privileges may exist, but with RLS on and no policy nothing is visible: prove that by the policy count above; here only anon must be fully closed
      expect(r.find((x) => x.role === 'anon')?.x, `${t} for anon`).toBe(false)
    }
  })

  it('no function raises SQLSTATE 40001 or 40P01 (PostgREST retries those, so the request would hang instead of showing the error)', async () => {
    const f = await rows<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prosrc ~* '(errcode\\s*=\\s*''(40001|40P01)''|sqlstate\\s+''(40001|40P01)'')'`)
    expect(f.map((x) => x.proname)).toEqual([])
  })
})
