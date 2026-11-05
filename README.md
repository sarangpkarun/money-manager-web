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

## Push spike (Phase 0)
1. `pnpm push:test keys`, set `VITE_VAPID_PUBLIC_KEY` for the deploy.
2. Install the deployed app to the iPhone Home Screen, tap **Enable test push**, copy the JSON.
3. `VAPID_PUBLIC=… VAPID_PRIVATE=… pnpm push:test send '<json>'`

## Deploy
Vercel (SPA rewrites in `vercel.json`) + a Supabase project: `supabase link --project-ref <ref> && supabase db push`.
Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; configure auth Site URL / redirect URLs and a custom SMTP provider.
