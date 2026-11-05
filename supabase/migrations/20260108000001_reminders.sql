-- Phase 7A: reminders. All the rules (time zones, alarm time, quiet hours, opt-outs, summaries) live here so they can be tested;
-- the Edge Function only sends what claim_due_reminders returns. Every item is CLAIMED in reminder_log in the same statement that
-- selects it, so the same reminder can never be handed out twice (even by overlapping runs).
--
-- Rules, in each user's own time zone (profiles.timezone):
--   * due tomorrow / due today / overdue (the day after): one notification per kind per day for unpaid plan rows with a real due date
--     (entries.remind = false is skipped), sent at alarm_time (the first run at or after it).
--   * quiet hours: an automatic reminder that falls inside them waits until quiet_until, but only if that is still the same local day;
--     otherwise it is skipped. Quiet hours may wrap midnight.
--   * a note/task with remind_at rings at that moment (even in quiet hours); up to 6 hours late, then dropped.
--   * summary (off by default): daily or weekly at summary_time, same quiet-hours wait.
--   * an automatic reminder that was not sent by the end of its local day is dropped, never sent late.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.settings (key text primary key, value text not null);
insert into private.settings values ('enabled', 'true'), ('function_url', 'https://kfcnxlspvbblefntjnuu.supabase.co/functions/v1/send-reminders');

-- generated here, inside the database: never in git and never typed by anyone
create table private.cron_secret (id int primary key default 1 check (id = 1), secret text not null default (gen_random_uuid()::text || gen_random_uuid()::text));
insert into private.cron_secret default values;

alter table public.push_subscriptions add column user_agent text, add column last_seen timestamptz default now();

create table public.reminder_log (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (user_id, key)
);
alter table public.reminder_log enable row level security; -- no policies: only the service role reads or writes it
revoke all on public.reminder_log from anon, authenticated;

-- ---------------------------------------------------------------- helpers
-- ₹12,34,567 / ₹1,250.50
create function private.fmt_inr(p bigint) returns text language plpgsql immutable as $$
declare r bigint := abs(p) / 100; c int := (abs(p) % 100)::int; s text := r::text;
begin
  if length(s) > 3 then s := regexp_replace(left(s, length(s) - 3), '(\d)(?=(\d\d)+$)', '\1,', 'g') || ',' || right(s, 3); end if;
  return case when p < 0 then '-' else '' end || '₹' || s || case when c <> 0 then '.' || lpad(c::text, 2, '0') else '' end;
end $$;

-- When an automatic reminder wanted at `wanted` may actually be sent: now if outside quiet hours, quiet_until if that is later the
-- same day, otherwise never (null).
create function private.auto_time(wanted time, qf time, qu time) returns time language sql immutable as $$
  select case
    when qf is null or qu is null or qf = qu then wanted
    when qf < qu then case when wanted >= qf and wanted < qu then qu else wanted end
    else case when wanted >= qf then null when wanted < qu then qu else wanted end
  end
$$;

-- ---------------------------------------------------------------- the one function the sender calls
create function public.claim_due_reminders(p_now timestamptz default now())
returns table (user_id uuid, key text, title text, body text, url text, subscriptions jsonb)
language plpgsql volatile security invoker set search_path = public as $$
#variable_conflict use_column
begin
  return query
  with u as (
    select pr.id, (p_now at time zone pr.timezone)::date as ld, (p_now at time zone pr.timezone)::time as lt,
           private.auto_time(coalesce(pr.alarm_time, time '09:00'), pr.quiet_from, pr.quiet_until) as alarm_at,
           private.auto_time(coalesce(pr.summary_time, time '08:00'), pr.quiet_from, pr.quiet_until) as summary_at,
           pr.summary_mode, coalesce(pr.summary_weekday, 1) as summary_dow,
           (select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'keys', ps.keys)) from public.push_subscriptions ps where ps.user_id = pr.id) as subs
    from public.profiles pr
    join pg_timezone_names tz on tz.name = pr.timezone
    where exists (select 1 from public.push_subscriptions ps where ps.user_id = pr.id)
  ),
  dues as (
    select u.id as uid, k.kind, k.off, u.ld + k.off as due_on,
           count(*) as n,
           (array_agg(e.id order by s.due_paise - s.paid_paise desc, e.id))[1] as first_entry,
           (array_agg(
              case when e.direction = 'pay' then 'Pay ' || coalesce(pp.name, e.party_name, 'someone') || ' ' || private.fmt_inr(s.due_paise - s.paid_paise)
                   else coalesce(pp.name, e.party_name, 'Someone') || ' owes ' || private.fmt_inr(s.due_paise - s.paid_paise) end
              order by s.due_paise - s.paid_paise desc, e.id))[1:3] as lines,
           (array_agg(e.title order by s.due_paise - s.paid_paise desc, e.id))[1] as first_title
    from u
    cross join (values ('tomorrow', 1), ('today', 0), ('overdue', -1)) k(kind, off)
    join public.entries e on e.user_id = u.id and e.status = 'open' and e.remind
    join public.schedule_items s on s.entry_id = e.id and s.due_paise > s.paid_paise and s.due_date = u.ld + k.off
    left join public.people pp on pp.id = e.person_id
    where u.alarm_at is not null and u.lt >= u.alarm_at
    group by u.id, k.kind, k.off, u.ld
  ),
  due_cand as (
    select d.uid as user_id, 'due:' || d.kind || ':' || d.due_on as key,
           case d.kind when 'tomorrow' then 'Due tomorrow' when 'today' then 'Due today' else 'Overdue' end as title,
           case when d.n = 1 then d.lines[1] || coalesce(' · ' || d.first_title, '')
                else d.n || ' payments: ' || array_to_string(d.lines, '; ') || case when d.n > 3 then ' +' || (d.n - 3) || ' more' else '' end end as body,
           case when d.n = 1 then '/money/entry/' || d.first_entry else '/calendar?day=' || d.due_on end as url
    from dues d
  ),
  note_cand as (
    select n.user_id, 'note:' || n.id || ':' || extract(epoch from n.remind_at)::bigint as key,
           case n.kind when 'task' then 'Task' else 'Note' end as title,
           n.title as body, '/calendar?day=' || n.date as url
    from public.notes n
    where n.remind_at is not null and p_now >= n.remind_at and p_now < n.remind_at + interval '6 hours'
      and not (n.kind = 'task' and coalesce(n.done, false) and n.repeat_rule is null)
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = n.user_id)
  ),
  sum_cand as (
    select u.id as user_id,
           case when u.summary_mode = 'daily' then 'sum:day:' || u.ld else 'sum:week:' || u.ld end as key,
           case when u.summary_mode = 'daily' then 'Your day' else 'Your week' end as title,
           case when u.summary_mode = 'daily'
             then 'Yesterday you spent ' || private.fmt_inr(x.spent_prev) || '. '
               || case when x.due_n = 0 then 'Nothing due today.' else x.due_n || ' due today (' || private.fmt_inr(x.due_sum) || ').' end
               || case when x.over_n > 0 then ' ' || x.over_n || ' overdue (' || private.fmt_inr(x.over_sum) || ').' else '' end
             else 'Last 7 days: spent ' || private.fmt_inr(x.spent_week) || ', received ' || private.fmt_inr(x.recv_week) || '. '
               || case when x.week_n = 0 then 'Nothing due this week.' else x.week_n || ' due this week (' || private.fmt_inr(x.week_sum) || ').' end
               || case when x.over_n > 0 then ' ' || x.over_n || ' overdue (' || private.fmt_inr(x.over_sum) || ').' else '' end
           end as body,
           '/' as url
    from u
    cross join lateral (
      select
        coalesce((select sum(t.amount_paise - t.for_other_paise) from public.transactions t where t.user_id = u.id and t.kind = 'expense' and t.date = u.ld - 1), 0)::bigint as spent_prev,
        coalesce((select sum(t.amount_paise - t.for_other_paise) from public.transactions t where t.user_id = u.id and t.kind = 'expense' and t.date between u.ld - 7 and u.ld - 1), 0)::bigint as spent_week,
        coalesce((select sum(t.amount_paise) from public.transactions t where t.user_id = u.id and t.kind = 'income' and t.date between u.ld - 7 and u.ld - 1), 0)::bigint as recv_week,
        (select count(*) from public.schedule_items s join public.entries e on e.id = s.entry_id where e.user_id = u.id and e.status = 'open' and s.due_paise > s.paid_paise and s.due_date = u.ld)::int as due_n,
        coalesce((select sum(s.due_paise - s.paid_paise) from public.schedule_items s join public.entries e on e.id = s.entry_id where e.user_id = u.id and e.status = 'open' and s.due_paise > s.paid_paise and s.due_date = u.ld), 0)::bigint as due_sum,
        (select count(*) from public.schedule_items s join public.entries e on e.id = s.entry_id where e.user_id = u.id and e.status = 'open' and s.due_paise > s.paid_paise and s.due_date between u.ld and u.ld + 6)::int as week_n,
        coalesce((select sum(s.due_paise - s.paid_paise) from public.schedule_items s join public.entries e on e.id = s.entry_id where e.user_id = u.id and e.status = 'open' and s.due_paise > s.paid_paise and s.due_date between u.ld and u.ld + 6), 0)::bigint as week_sum,
        (select count(*) from public.schedule_items s join public.entries e on e.id = s.entry_id where e.user_id = u.id and e.status = 'open' and s.due_paise > s.paid_paise and s.due_date < u.ld and s.due_date < '9999-12-31')::int as over_n,
        coalesce((select sum(s.due_paise - s.paid_paise) from public.schedule_items s join public.entries e on e.id = s.entry_id where e.user_id = u.id and e.status = 'open' and s.due_paise > s.paid_paise and s.due_date < u.ld and s.due_date < '9999-12-31'), 0)::bigint as over_sum
    ) x
    where u.summary_mode in ('daily', 'weekly') and u.summary_at is not null and u.lt >= u.summary_at
      and (u.summary_mode = 'daily' or extract(dow from u.ld)::int = u.summary_dow)
  ),
  cand as (
    select * from due_cand union all select * from note_cand union all select * from sum_cand
  ),
  claimed as (
    insert into public.reminder_log as rl (user_id, key, claimed_at)
    select c.user_id, c.key, p_now from cand c
    on conflict (user_id, key) do update set claimed_at = excluded.claimed_at
      where rl.sent_at is null and rl.claimed_at < p_now - interval '10 minutes' -- an unsent claim older than the lease is handed out again
    returning rl.user_id, rl.key
  )
  select c.user_id, c.key, c.title, c.body, c.url,
         (select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'keys', ps.keys)) from public.push_subscriptions ps where ps.user_id = c.user_id)
  from claimed cl join cand c on c.user_id = cl.user_id and c.key = cl.key;
end $$;

create function public.mark_reminder_sent(p_user uuid, p_key text, p_at timestamptz default now()) returns void
language sql security invoker set search_path = public as $$
  update public.reminder_log set sent_at = p_at where user_id = p_user and key = p_key
$$;

-- a failed send gives the claim back so the next run retries it
create function public.release_reminder(p_user uuid, p_key text) returns void
language sql security invoker set search_path = public as $$
  delete from public.reminder_log where user_id = p_user and key = p_key and sent_at is null
$$;

create function public.get_cron_secret() returns text
language sql security definer set search_path = public, private as $$ select secret from private.cron_secret where id = 1 $$;

-- ---------------------------------------------------------------- devices
-- A device (endpoint) belongs to whoever signed in on it last.
create function public.claim_push_subscription(p_endpoint text, p_keys jsonb, p_user_agent text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_verified() then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_endpoint is null or length(p_endpoint) < 10 or p_keys is null or not (p_keys ? 'p256dh' and p_keys ? 'auth') then
    raise exception 'invalid subscription' using errcode = '22023';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, keys, user_agent) values (auth.uid(), p_endpoint, p_keys, left(p_user_agent, 300));
end $$;

-- ---------------------------------------------------------------- scheduler (cloud only: the local seed switches it off)
create function private.tick() returns void language plpgsql security definer set search_path = public, private as $$
declare v_url text; v_secret text;
begin
  if coalesce((select value from private.settings where key = 'enabled'), 'false') <> 'true' then return; end if;
  select value into v_url from private.settings where key = 'function_url';
  select secret into v_secret from private.cron_secret where id = 1;
  perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret), body := '{}'::jsonb);
end $$;

do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('send-reminders', '*/5 * * * *', 'select private.tick()');
exception when others then
  raise notice 'pg_cron / pg_net are not available here (%): reminders will not be scheduled', sqlerrm;
end $$;

-- ---------------------------------------------------------------- who may call what
-- claim_due_reminders runs as the service role, which needs to reach the two text/time helpers in the private schema
grant usage on schema private to service_role;
grant execute on function private.fmt_inr(bigint), private.auto_time(time, time, time) to service_role;

do $$
declare f text;
begin
  foreach f in array array['claim_due_reminders(timestamptz)', 'mark_reminder_sent(uuid,text,timestamptz)', 'release_reminder(uuid,text)', 'get_cron_secret()']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  revoke all on function public.claim_push_subscription(text, jsonb, text) from public, anon;
  grant execute on function public.claim_push_subscription(text, jsonb, text) to authenticated;
end $$;
