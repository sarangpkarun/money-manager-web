-- Phase 9: our own error log (no third-party service) and a harmless ping for the uptime check.

create table public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  at timestamptz not null default now(),
  app_version text not null default '' check (length(app_version) <= 32),
  route text not null default '' check (length(route) <= 200),
  kind text not null check (kind in ('error', 'unhandledrejection', 'boundary')),
  -- the app scrubs digits, emails and URLs before sending; the caps here are a second line of defence
  message text not null check (length(message) <= 500),
  stack text check (length(stack) <= 4000),
  user_agent text check (length(user_agent) <= 300)
);
create index client_errors_user_at_idx on public.client_errors (user_id, at desc);

alter table public.client_errors enable row level security;
create policy own_rows on public.client_errors for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_verified()))
  with check (user_id = (select auth.uid()) and (select public.is_verified()));
-- an error log is append-only for the app: no edits
revoke update on public.client_errors from authenticated;

-- a crash loop must not fill the table: past 30 rows in 10 minutes for one user, further rows are dropped silently
create function public._client_errors_limit() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if (select count(*) from public.client_errors where user_id = new.user_id and at > now() - interval '10 minutes') >= 30 then
    return null;
  end if;
  return new;
end $$;
revoke execute on function public._client_errors_limit() from public, anon, authenticated; -- a trigger function is never called directly
create trigger client_errors_limit before insert on public.client_errors
  for each row execute function public._client_errors_limit();

-- keep 60 days
do $$
begin
  perform cron.schedule('prune-client-errors', '17 3 * * *', $c$delete from public.client_errors where at < now() - interval '60 days'$c$);
exception when others then
  raise notice 'pg_cron is not available here (%): old errors will not be pruned', sqlerrm;
end $$;

-- Uptime check: a constant, so it needs no data and exposes none. Callable without signing in (it is the one such function).
create function public.ping() returns text language sql stable set search_path = '' as $$ select 'ok' $$;
revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
