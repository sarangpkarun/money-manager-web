-- Phase 4: lending and borrowing. People, entries (lent / borrowed), part payments, Money tab and dashboard figures.
--
-- Money flow (none of it is spending or income):
--   lent      -> debt_out on the source account; each payment back is a debt_in.   direction = receive
--   borrowed  -> debt_in on the source account;  each repayment is a debt_out.      direction = pay
-- Every entry has exactly one schedule row (the single-row plan). No due date is stored as 9999-12-31.
-- All functions are SECURITY INVOKER (RLS applies) and plpgsql bodies are single transactions, so each is atomic.

alter table public.payments add column txn_id uuid references public.transactions on delete set null;
create index payments_entry_idx on public.payments (entry_id);
create index people_user_name_idx on public.people (user_id, lower(name));
create index entries_person_idx on public.entries (user_id, person_id);
create index entries_open_idx on public.entries (user_id, status);

-- ---------------------------------------------------------------- create
create function public.create_entry(
  p_id uuid, p_kind public.entry_kind, p_person uuid, p_title text, p_amount bigint, p_account uuid,
  p_start date, p_due date default null, p_interest public.interest_type default 'none',
  p_rate_bps int default 0, p_notes text default null
) returns public.entries
language plpgsql security invoker set search_path = public as $$
declare
  e public.entries;
  v_interest bigint := 0;
  v_total bigint;
  v_txn uuid := gen_random_uuid();
begin
  select * into e from public.entries where id = p_id;
  if found then return e; end if; -- idempotent retry

  if p_kind not in ('lent', 'borrowed') then raise exception 'only lent and borrowed entries are supported' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive' using errcode = '22023'; end if;
  if p_start is null then raise exception 'start date is required' using errcode = '22023'; end if;
  if p_due is not null and p_due < p_start then raise exception 'due date is before the start date' using errcode = '22023'; end if;
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'title is required' using errcode = '22023'; end if;
  if p_interest not in ('none', 'flat', 'simple') then raise exception 'interest must be none, flat or simple' using errcode = '22023'; end if;
  if p_interest <> 'none' and coalesce(p_rate_bps, 0) <= 0 then raise exception 'interest rate must be positive' using errcode = '22023'; end if;
  if p_interest = 'simple' and p_due is null then raise exception 'simple interest needs a due date' using errcode = '22023'; end if;
  if not exists (select 1 from public.people where id = p_person) then raise exception 'person not found' using errcode = '22023'; end if;
  if not exists (select 1 from public.accounts where id = p_account) then raise exception 'account not found' using errcode = '22023'; end if;

  if p_interest = 'flat' then
    v_interest := round(p_amount::numeric * p_rate_bps / 10000);
  elsif p_interest = 'simple' then
    v_interest := round(p_amount::numeric * p_rate_bps * (p_due - p_start) / (10000 * 365));
  end if;
  v_total := p_amount + v_interest;

  insert into public.entries (id, kind, direction, person_id, title, principal_paise, start_date, due_date, interest, rate_bps,
                              total_payable_paise, notes)
  values (p_id, p_kind, case when p_kind = 'lent' then 'receive' else 'pay' end::public.entry_dir, p_person, trim(p_title), p_amount,
          p_start, p_due, p_interest, coalesce(p_rate_bps, 0), v_total, p_notes)
  returning * into e;

  insert into public.transactions (id, kind, amount_paise, date, account_id, title, notes, entry_id)
  values (v_txn, case when p_kind = 'lent' then 'debt_out' else 'debt_in' end::public.txn_kind, p_amount, p_start, p_account,
          trim(p_title), p_notes, p_id);
  update public.entries set source_txn_id = v_txn where id = p_id returning * into e;

  insert into public.schedule_items (entry_id, seq, due_date, due_paise, principal_paise, interest_paise)
  values (p_id, 1, coalesce(p_due, date '9999-12-31'), v_total, p_amount, v_interest);
  return e;
end $$;

-- ---------------------------------------------------------------- payments
create function public.record_payment(
  p_id uuid, p_entry uuid, p_amount bigint, p_paid_on date, p_account uuid,
  p_mode public.pay_mode default null, p_note text default null
) returns public.entries
language plpgsql security invoker set search_path = public as $$
declare
  e public.entries;
  s public.schedule_items;
  v_txn uuid := gen_random_uuid();
begin
  select * into e from public.entries where id = p_entry for update;
  if not found then raise exception 'entry not found' using errcode = '22023'; end if;
  if exists (select 1 from public.payments where id = p_id) then return e; end if; -- idempotent retry
  if e.status <> 'open' then raise exception 'entry is not open' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive' using errcode = '22023'; end if;
  if p_paid_on is null then raise exception 'payment date is required' using errcode = '22023'; end if;
  if not exists (select 1 from public.accounts where id = p_account) then raise exception 'account not found' using errcode = '22023'; end if;

  select * into s from public.schedule_items where entry_id = p_entry and seq = 1 for update;
  if p_amount > s.due_paise - s.paid_paise then
    raise exception 'payment exceeds the amount left (% paise)', s.due_paise - s.paid_paise using errcode = '22023';
  end if;

  insert into public.transactions (id, kind, amount_paise, date, account_id, title, notes, entry_id)
  values (v_txn, case when e.kind = 'lent' then 'debt_in' else 'debt_out' end::public.txn_kind, p_amount, p_paid_on, p_account,
          e.title, p_note, p_entry);
  insert into public.payments (id, entry_id, schedule_item_id, amount_paise, paid_on, account_id, mode, note, txn_id)
  values (p_id, p_entry, s.id, p_amount, p_paid_on, p_account, p_mode, p_note, v_txn);

  update public.schedule_items
     set paid_paise = paid_paise + p_amount,
         paid_on = case when paid_paise + p_amount >= due_paise then p_paid_on else paid_on end
   where id = s.id;
  if s.paid_paise + p_amount >= s.due_paise then
    update public.entries set status = 'settled', settled_on = p_paid_on where id = p_entry returning * into e;
  end if;
  return e;
end $$;

create function public.delete_payment(p_id uuid) returns public.entries
language plpgsql security invoker set search_path = public as $$
declare
  p public.payments;
  e public.entries;
begin
  select * into p from public.payments where id = p_id;
  if not found then raise exception 'payment not found' using errcode = '22023'; end if;
  select * into e from public.entries where id = p.entry_id for update;

  delete from public.payments where id = p_id;
  if p.txn_id is not null then delete from public.transactions where id = p.txn_id; end if;
  update public.schedule_items set paid_paise = paid_paise - p.amount_paise, paid_on = null where entry_id = p.entry_id and seq = 1;
  update public.entries set status = 'open', settled_on = null where id = p.entry_id returning * into e;
  return e;
end $$;

create function public.mark_unpaid(p_entry uuid) returns public.entries
language plpgsql security invoker set search_path = public as $$
declare e public.entries;
begin
  select * into e from public.entries where id = p_entry for update;
  if not found then raise exception 'entry not found' using errcode = '22023'; end if;
  delete from public.transactions where id in (select txn_id from public.payments where entry_id = p_entry and txn_id is not null);
  delete from public.payments where entry_id = p_entry;
  update public.schedule_items set paid_paise = 0, paid_on = null where entry_id = p_entry;
  update public.entries set status = 'open', settled_on = null where id = p_entry returning * into e;
  return e;
end $$;

-- ---------------------------------------------------------------- edit / delete
-- p_patch keys: title, notes, person_id, due_date (null clears it). Money fields cannot change.
create function public.update_entry(p_id uuid, p_patch jsonb) returns public.entries
language plpgsql security invoker set search_path = public as $$
declare e public.entries;
begin
  select * into e from public.entries where id = p_id for update;
  if not found then raise exception 'entry not found' using errcode = '22023'; end if;

  if p_patch ? 'title' and (p_patch->>'title' is null or length(trim(p_patch->>'title')) = 0) then
    raise exception 'title is required' using errcode = '22023';
  end if;
  if p_patch ? 'person_id' and not exists (select 1 from public.people where id = (p_patch->>'person_id')::uuid) then
    raise exception 'person not found' using errcode = '22023';
  end if;
  if p_patch ? 'due_date' then
    if e.interest = 'simple' then raise exception 'the due date of a simple-interest entry cannot change' using errcode = '22023'; end if;
    if p_patch->>'due_date' is not null and (p_patch->>'due_date')::date < e.start_date then
      raise exception 'due date is before the start date' using errcode = '22023';
    end if;
  end if;

  update public.entries set
    title = case when p_patch ? 'title' then trim(p_patch->>'title') else title end,
    notes = case when p_patch ? 'notes' then p_patch->>'notes' else notes end,
    person_id = case when p_patch ? 'person_id' then (p_patch->>'person_id')::uuid else person_id end,
    due_date = case when p_patch ? 'due_date' then (p_patch->>'due_date')::date else due_date end
  where id = p_id returning * into e;

  if p_patch ? 'due_date' then
    update public.schedule_items set due_date = coalesce(e.due_date, date '9999-12-31') where entry_id = p_id and seq = 1;
  end if;
  return e;
end $$;

create function public.delete_entry(p_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from public.entries where id = p_id for update;
  if not found then raise exception 'entry not found' using errcode = '22023'; end if;
  update public.entries set source_txn_id = null where id = p_id;
  delete from public.transactions where entry_id = p_id;
  delete from public.entries where id = p_id; -- payments and schedule rows cascade
end $$;

-- ---------------------------------------------------------------- people
create function public.merge_people(p_keep uuid, p_drop uuid) returns public.people
language plpgsql security invoker set search_path = public as $$
declare k public.people; d public.people;
begin
  if p_keep = p_drop then raise exception 'choose two different people' using errcode = '22023'; end if;
  select * into k from public.people where id = p_keep for update;
  if not found then raise exception 'person not found' using errcode = '22023'; end if;
  select * into d from public.people where id = p_drop for update;
  if not found then raise exception 'person not found' using errcode = '22023'; end if;

  update public.entries set person_id = p_keep where person_id = p_drop;
  update public.people set
    phone = coalesce(k.phone, d.phone), email = coalesce(k.email, d.email),
    notes = nullif(concat_ws(E'\n', k.notes, d.notes), '')
  where id = p_keep returning * into k;
  delete from public.people where id = p_drop;
  return k;
end $$;

-- net per person: positive = they owe me
create view public.people_balances with (security_invoker = true) as
select p.id as person_id, p.user_id, p.name, p.phone, p.email, p.archived,
       coalesce(sum(s.due_paise - s.paid_paise) filter (where e.direction = 'receive' and e.status = 'open'), 0)::bigint as owed_to_me_paise,
       coalesce(sum(s.due_paise - s.paid_paise) filter (where e.direction = 'pay' and e.status = 'open'), 0)::bigint as i_owe_paise,
       count(e.id) filter (where e.status = 'open')::int as open_count,
       count(e.id)::int as entry_count,
       max(e.start_date) as last_entry_date
from public.people p
left join public.entries e on e.person_id = p.id
left join public.schedule_items s on s.entry_id = e.id and s.seq = 1
group by p.id;
revoke all on public.people_balances from anon;
grant select on public.people_balances to authenticated;

-- ---------------------------------------------------------------- overview
-- Totals, overdue amounts and ageing (days overdue) of open entries. Shared by the Money tab and the dashboard.
create function public.money_stats(p_today date) returns jsonb
language sql stable security invoker set search_path = public as $$
  with o as (
    select e.direction, (s.due_paise - s.paid_paise) as left_paise,
           case when s.due_date < '9999-12-31' and s.due_date < p_today then p_today - s.due_date else 0 end as late
    from public.entries e join public.schedule_items s on s.entry_id = e.id and s.seq = 1
    where e.status = 'open'
  ),
  agg as (
    select d.direction,
      coalesce(sum(left_paise), 0)::bigint as total,
      coalesce(sum(left_paise) filter (where late > 0), 0)::bigint as overdue,
      jsonb_build_object(
        'current', coalesce(sum(left_paise) filter (where late = 0), 0)::bigint,
        'd1_30', coalesce(sum(left_paise) filter (where late between 1 and 30), 0)::bigint,
        'd31_60', coalesce(sum(left_paise) filter (where late between 31 and 60), 0)::bigint,
        'd61_plus', coalesce(sum(left_paise) filter (where late > 60), 0)::bigint) as ageing
    from (values ('receive'::public.entry_dir), ('pay'::public.entry_dir)) d(direction)
    left join o on o.direction = d.direction
    group by d.direction
  )
  select jsonb_build_object(
    'owed_to_me', (select total from agg where direction = 'receive'),
    'overdue_owed_to_me', (select overdue from agg where direction = 'receive'),
    'ageing_owed_to_me', (select ageing from agg where direction = 'receive'),
    'i_owe', (select total from agg where direction = 'pay'),
    'overdue_i_owe', (select overdue from agg where direction = 'pay'),
    'ageing_i_owe', (select ageing from agg where direction = 'pay'),
    'open_count', (select count(*) from o))
$$;

-- Open entries (one row each) plus the totals. The client derives Pending / Partial / Overdue / Paid from the numbers.
create function public.money_overview(p_today date) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'stats', public.money_stats(p_today),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'kind', e.kind, 'direction', e.direction, 'title', e.title,
        'person_id', e.person_id, 'person_name', p.name,
        'principal_paise', e.principal_paise, 'total_paise', s.due_paise, 'paid_paise', s.paid_paise,
        'outstanding_paise', s.due_paise - s.paid_paise,
        'start_date', e.start_date, 'due_date', e.due_date) order by coalesce(e.due_date, date '9999-12-31'), e.created_at)
      from public.entries e
      join public.schedule_items s on s.entry_id = e.id and s.seq = 1
      left join public.people p on p.id = e.person_id
      where e.status = 'open'), '[]'::jsonb))
$$;

-- Settled entries, newest first. p_cursor = {"settled_on": "...", "id": "..."} of the last row seen.
create function public.money_history(p_limit int default 50, p_cursor jsonb default null)
returns table (
  id uuid, kind public.entry_kind, direction public.entry_dir, title text, person_id uuid, person_name text,
  principal_paise bigint, total_paise bigint, paid_paise bigint, start_date date, due_date date, settled_on date
)
language sql stable security invoker set search_path = public as $$
  select e.id, e.kind, e.direction, e.title, e.person_id, p.name, e.principal_paise, s.due_paise, s.paid_paise,
         e.start_date, e.due_date, e.settled_on
  from public.entries e
  join public.schedule_items s on s.entry_id = e.id and s.seq = 1
  left join public.people p on p.id = e.person_id
  where e.status = 'settled'
    and (p_cursor is null or (e.settled_on, e.id) < ((p_cursor->>'settled_on')::date, (p_cursor->>'id')::uuid))
  order by e.settled_on desc, e.id desc
  limit least(greatest(p_limit, 1), 200)
$$;

-- ---------------------------------------------------------------- dashboard: same call, two more keys
alter function public.dashboard_summary(text, date, jsonb) rename to dashboard_core;
revoke all on function public.dashboard_core(text, date, jsonb) from public, anon;
grant execute on function public.dashboard_core(text, date, jsonb) to authenticated;

create function public.dashboard_summary(p_month text, p_today date, p_filters jsonb default '{}')
returns jsonb
language sql stable security invoker set search_path = public as $$
  select public.dashboard_core(p_month, p_today, p_filters) || jsonb_build_object(
    'people', public.money_stats(p_today),
    'net_position', (
      select jsonb_build_object(
        'assets', coalesce(sum(b.balance_paise) filter (where b.type <> 'credit_card'), 0)::bigint,
        'card_outstanding', coalesce(sum(b.outstanding_paise) filter (where b.type = 'credit_card'), 0)::bigint)
      from public.account_balances b where not b.archived) || jsonb_build_object(
        'owed_to_me', (public.money_stats(p_today)->>'owed_to_me')::bigint,
        'i_owe', (public.money_stats(p_today)->>'i_owe')::bigint))
$$;

-- only signed-in users may call these
do $$
declare f text;
begin
  foreach f in array array[
    'create_entry(uuid,entry_kind,uuid,text,bigint,uuid,date,date,interest_type,int,text)',
    'record_payment(uuid,uuid,bigint,date,uuid,pay_mode,text)', 'delete_payment(uuid)', 'mark_unpaid(uuid)',
    'update_entry(uuid,jsonb)', 'delete_entry(uuid)', 'merge_people(uuid,uuid)',
    'money_stats(date)', 'money_overview(date)', 'money_history(int,jsonb)', 'dashboard_summary(text,date,jsonb)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
