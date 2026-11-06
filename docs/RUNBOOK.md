# Runbook

How to run Money Manager in production: set it up, deploy, back up, restore, and fix things. The cloud project is
`kfcnxlspvbblefntjnuu` (Supabase free plan), the code lives at `github.com/sarangpkarun/money-manager-web`, the app is hosted on Vercel.

Commands below run from the project folder with Node 22 (`nvm use`) and the Supabase CLI on the PATH.

## 1. Environment variables and secrets

| Name | Where it lives | Public? | What it is |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Vercel env (Production and Preview), `.env.local` | yes | `https://kfcnxlspvbblefntjnuu.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Vercel env, `.env.local` | yes (RLS protects data) | the project's anon / publishable key |
| `VITE_VAPID_PUBLIC_KEY` | Vercel env, `.env.local` | yes | public half of the push key (`BA8lUxJP…`) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Supabase project secrets (`supabase secrets set`) | **private key is secret** | signs push messages; never in git or in the app |
| cron secret | inside the database (`private.cron_secret`), read by the function with the service role | secret | lets only the database call `send-reminders` |
| `SUPABASE_SERVICE_ROLE_KEY` | supplied to Edge Functions by Supabase | **secret** | never set it anywhere yourself, never put it in the app or in GitHub |
| `SUPABASE_DB_PASSWORD` | your password manager; typed or exported only when running `pnpm backup` | **secret** | database password (Project Settings > Database) |
| `APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` | GitHub repository **Variables** (Settings > Secrets and variables > Actions > Variables) | no | used by the scheduled health check |

Rule of thumb: anything starting with `VITE_` ends up in the browser. Nothing secret may start with `VITE_`. CI fails if a service key or a foreign host appears in the build (`pnpm check:bundle`) or a secret is committed (`pnpm check:secrets`).

## 2. One-time production setup (dashboard)

Do these once, in order. Each ends with how to check it.

1. **Auth > URL configuration.** Site URL = your production URL (the Vercel domain). Redirect URLs = that same URL plus `http://localhost:5173` for development, nothing else.
   *Check:* sign up on the deployed app; the link in the email opens the deployed app, not localhost.
2. **Auth > Providers > Email.** Confirm email: **on**. Secure password change: on. Minimum password length **8**, password requirements **letters and digits** (the app enforces the same rule; the server is the real check).
   *Check:* `curl -s -X POST "$SUPABASE_URL/auth/v1/signup" -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"email":"x@y.test","password":"abcdefgh"}'` answers 422 (weak password).
3. **Auth > SMTP (custom).** The default Supabase mail is limited to a few emails an hour and may land in spam, so sign-up and password-reset emails need your own sender. Use a transactional provider with a free tier (Resend or Brevo). In the provider: verify your domain, add the DNS records it shows (SPF, DKIM, optional DMARC), create an SMTP user. In Supabase: enable custom SMTP and enter host, port (465 or 587), user, password, sender address (for example `no-reply@yourdomain`) and sender name "Money Manager".
   *Check:* sign up with a real address; the mail arrives within a minute, from your address, not in spam.
4. **Auth > Email templates.** Paste `supabase/templates/confirmation.html` into "Confirm signup" (subject: *Confirm your Money Manager account*) and `recovery.html` into "Reset password" (subject: *Reset your Money Manager password*). Do **not** run `supabase config push`: it would copy the local `config.toml` (localhost URLs) over the project's auth settings.
   *Check:* the confirmation mail shows the "Confirm my email" button.
5. **Auth > Rate limits.** Keep the defaults for sign-in and token refresh; set emails per hour to a number that suits your SMTP plan.
6. **Edge Functions.** `supabase functions list` shows `send-reminders`, `send-test`, `delete-account`. `send-reminders` is deployed with JWT verification off (its own shared secret is the check). `supabase secrets list` shows the three `VAPID_*` names.
   *Check:* `node scripts/healthcheck.mjs` (section 5) passes "reminder function refuses strangers".
7. **Database > Extensions.** `pg_cron` and `pg_net` enabled; **Integrations > Cron** shows the `send-reminders` (every 5 minutes) and `prune-client-errors` (daily) jobs.
8. **Vercel.** Production environment variables from section 1; the Production branch is `main`. Security headers come from `vercel.json`.
   *Check:* `curl -sI https://YOUR-APP | grep -i -E 'content-security|strict-transport|x-frame'` shows all three.
9. **GitHub Actions variables** `APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, then Actions > Health check > Run workflow once.
10. **Free plan facts.** No automatic backups and no point-in-time recovery; a project with no activity for 7 days is paused (the health check's database ping every 6 hours counts as activity). If it is ever paused: Dashboard > Restore project, then run `node scripts/healthcheck.mjs`.

## 3. Deploy

1. `pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls && pnpm build && VITE_SUPABASE_URL=… pnpm check:bundle` (CI runs the same on every push).
2. **If there are new migrations: back up first** (section 4), then `supabase db push` and read the list it shows before saying yes.
3. If an Edge Function changed: `supabase functions deploy <name>` (`send-reminders` keeps its `config.toml` setting).
4. Push to `main`; Vercel builds and promotes it. Open the app, check Settings > About shows the new version.
5. Run `node scripts/healthcheck.mjs` against production.

## 4. Backups (free plan: you are the backup)

- **Weekly, and before every `supabase db push`:** `export SUPABASE_DB_PASSWORD=…; pnpm backup`. It writes `backups/<UTC time>/schema.sql`, `data.sql` (all users and data) and `SHA256SUMS`. The folder is git-ignored. Copy it somewhere that is not this computer (cloud drive, external disk). Verify later with `cd backups/<time> && sha256sum -c SHA256SUMS`.
- `pnpm backup:local` does the same for the local stack.
- The dump holds personal financial data and password hashes: store it like a password file (encrypted disk or an encrypted archive), never in the repository.
- **Prove restores work, any time:** `pnpm restore:drill` (local only) seeds an account, backs up, wipes the local database to "migrations only", loads the dump and compares every table, balances, schedule totals and password hashes, then signs in. It must end with `✓ restore matches`.

## 5. Checks you can run

- `pnpm health` with `APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` set: page, security headers, service worker, manifest, SPA routes, Supabase auth, database ping, reminder function. Also runs every 6 hours in GitHub Actions; a failure emails you.
- **Data health:** paste `scripts/health.sql` into the Supabase SQL editor (read-only). Every "problem" row must be 0 (see section 8).
- **Reminders** (the Q1 test): the duplicate check in the README, plus the health report's "reminders claimed but never confirmed" row (should stay 0).

## 6. Restore from a backup

Use when data is lost or damaged. Everything after the backup time is lost, so pick the newest good backup.

1. Stop using the app. Download the backup folder; check `sha256sum -c SHA256SUMS`.
2. **New empty project (or the same project reset):** create it, `supabase link --project-ref <ref>`, `supabase db push` (replays all migrations: tables, policies, functions, cron job), set the three `VAPID_*` secrets and redeploy the functions (section 2, step 6).
3. Load the data with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backups/<time>/data.sql`, using the project's connection string (Project Settings > Database > Connection string). The SQL editor cannot load this file (it uses COPY). The file turns triggers off while loading, so profiles and passwords come back exactly as dumped.
4. Run `scripts/health.sql`: all problem rows 0. Sign in; check balances against a recent screenshot or bank statement.
5. Re-point the app if the project URL or anon key changed (Vercel env vars, GitHub variables, Auth URL settings), and re-enable push on your phone (Settings > Reminders).
6. Practise this on the local stack with `pnpm restore:drill` before you ever need it.

## 7. Rollback

- **App:** Vercel > Deployments > pick the previous good one > Promote to Production (instant, no data touched).
- **Edge Function:** check out the previous commit and `supabase functions deploy <name>`.
- **Database:** there are no down migrations; schema changes are forward-only. If a migration was wrong, write a new migration that fixes it, or restore the pre-migration backup (section 6) if data was damaged. That is why section 3 says "back up first".

## 8. When the numbers look wrong

1. Run `scripts/health.sql`. A row above 0 names the broken rule: "instalment rows paid more than due", "entries whose rows do not add up", "payments differ from rows", "for others amount differs", "transactions with no account", and so on. Look at the entry or transaction named in the app (Money tab, Activity), compare with your records.
2. Do not edit rows by hand in the dashboard. Fix it in the app (delete the wrong payment, which reopens the entry, then record it again) so the totals stay consistent.
3. Take a backup before any manual repair and write the problem in `docs/ISSUES.md` with the steps that caused it.

## 9. When reminders stop

1. Settings > Reminders: is this device "on"? "Send a test notification" works?
2. Supabase > Integrations > Cron > `send-reminders` > run history: running every 5 minutes without errors? If the project was paused, restore it first.
3. Edge Functions > `send-reminders` > Logs: 401 means the cron secret changed; 500 "VAPID keys are not configured" means the secrets are missing (`supabase secrets list`).
4. SQL editor: `select * from net._http_response order by created desc limit 10;` shows what the cron call got back.
5. iPhone: the app must be installed to the Home Screen, notifications allowed, and Focus modes not hiding them.

## 10. Rotating keys

- **Anon key:** Project Settings > API; update Vercel and GitHub variables and redeploy.
- **VAPID keys:** generate a new pair (`pnpm push:test keys`), `supabase secrets set …`, update `VITE_VAPID_PUBLIC_KEY` in Vercel, redeploy; every device must turn reminders off and on again.
- **Cron secret:** `update private.cron_secret set secret = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where id = 1;` in the SQL editor; no redeploy needed.
- **Database password:** Project Settings > Database > Reset password; update your password manager.

## 11. Deleting a test account

Settings > Delete account in the app (removes the sign-in and every row), or Authentication > Users > delete (every table cascades from the user).
