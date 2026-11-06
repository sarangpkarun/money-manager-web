# Money Manager v2

iPhone-first PWA on React + Supabase. See [ROADMAP.md](ROADMAP.md) for the plan.

## Setup
```bash
nvm use                 # Node 22
pnpm install
supabase start -x logflare,vector,imgproxy,edge-runtime,studio,realtime,storage-api
cp .env.example .env.local   # paste the anon/publishable key from `supabase status`
pnpm dev                # http://localhost:5173  (auth emails: http://127.0.0.1:54324)
```

## Checks
`pnpm typecheck && pnpm lint && pnpm test` · `pnpm test:rls` (needs local Supabase) · `pnpm e2e` (Playwright, needs local Supabase; starts its own dev server on :5173) · `pnpm build && pnpm check:bundle` (200 KB gz budget)

Try the list at scale: `pnpm seed:perf` (local only) creates `perf@test.local` / `Passw0rd!perf` with 5,000 transactions.

## Reminders (Phase 7)
Rules (due tomorrow / today / overdue, quiet hours, manual note reminders, summaries) live in SQL (`claim_due_reminders`); the Edge Function `send-reminders` only sends what that returns, and `pg_cron` calls it every 5 minutes. Each reminder is claimed in `reminder_log` first, so it can only be sent once.
1. Make VAPID keys: `pnpm push:test keys`. Put the **public** key in `VITE_VAPID_PUBLIC_KEY` (Vercel and `.env.local`).
2. Give the functions the keys: `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:you@example.com`.
3. `supabase db push` then `supabase functions deploy send-reminders send-test` (`send-reminders` is deployed without JWT verification; it checks a secret that the database generates for itself, see `supabase/config.toml`).
4. On the iPhone: install the app to the Home Screen, open it from there, Settings, Reminders, **Turn on notifications**, then **Send a test**.
5. Local development: the local cron tick is switched off by `supabase/seed.sql`, so nothing calls the cloud function from your machine.
6. Watching it: unsent claims older than the 10-minute lease mean a failed send, `select * from reminder_log where sent_at is null and claimed_at < now() - interval '15 minutes'`; the Edge Function logs one JSON line per run (claimed, sent, failed, pruned, released). If `pg_cron`/`pg_net` are unavailable on your plan, call `send-reminders` from any external scheduler with the header `x-cron-secret` (read it with `select secret from private.cron_secret` as the database owner).

## Settings, export and account deletion (Phase 7B)

- Display choices (number format, date format, week start, Home cards) live in `profiles`; `lib/display.ts` holds the active number and date format and the Shell syncs it from the profile.
- Export builds files in the browser (`lib/exportData.ts`); nothing is uploaded.
- Delete account calls the `delete-account` Edge Function (`supabase functions deploy delete-account`). It needs no extra secrets: the Edge runtime supplies the service role.

## Insights (Phase 8)

Home's Insights card shows up to five rule-based lines. `insight_facts(p_today)` (SQL) only aggregates; the rules, wording and thresholds are in `src/features/insights/rules.ts` (constants in `T`). Tapping a line opens the filtered Activity list or the entry it is about.

## Quality checks (Phase 8)

- `pnpm check:contrast` fails if any text/background pair in `src/app/theme.css` is under 4.5:1 in light or dark.
- `e2e/a11y.spec.ts` runs axe on every main screen in both themes; `tests/unit/animation.test.ts` keeps animations to transform, opacity and colour.
- `pnpm build`, then `node scripts/lighthouse.mjs` (local Supabase running) measures the signed-in Home with Lighthouse's mobile profile and prints the scores; the full report goes to `lighthouse-report/`.
- Acceptance scenarios from the spec: A `e2e/others.spec.ts` (scenario A), B `e2e/plans.spec.ts` and `e2e/calendar.spec.ts` (scenario B), C `e2e/plans.spec.ts` (scenario C), D `e2e/plans.spec.ts` and `e2e/calendar.spec.ts` (scenario D), E `e2e/quick-add.spec.ts` (scenario E).

## Deploy and operate
Vercel (SPA rewrites and security headers in `vercel.json`) + a Supabase project: `supabase link --project-ref <ref> && supabase db push`.

- **[docs/RUNBOOK.md](docs/RUNBOOK.md):** environment variables and secrets, one-time production setup (auth URLs, SMTP, templates, password policy), deploy, backups and restore, rollback, "numbers look wrong", "reminders stopped", key rotation.
- **[docs/GOING-LIVE.md](docs/GOING-LIVE.md):** entering your real accounts, loans and balances, the weekly reconcile routine, what counts as success.
- **[docs/ISSUES.md](docs/ISSUES.md):** the dogfood issue list (P0/P1/P2).
- Commands: `pnpm backup` (weekly, and before every migration push), `pnpm restore:drill` (proves a backup restores), `pnpm health` (is the deployed app up), `pnpm health:data` / `scripts/health.sql` (are the numbers consistent), `pnpm check:secrets`, `pnpm e2e:prod` (production build with the real security headers).
