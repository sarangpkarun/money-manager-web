-- Phase 6: paying for someone else (on_behalf entries) and card tracking.
--
-- The purchase is one ordinary `expense` on the account used. Its for_other_paise always equals the sum of the principals of the
-- on_behalf entries that point at it (entries.source_txn_id), so personal spend (amount - for_other_paise) is right everywhere.
-- Friends pay back through record_payment (debt_in on the account they paid into). The purchase itself has no entry_id: it stays editable,
-- but it cannot be deleted, and its friends cannot be removed or cut below what they paid, while payments exist.
-- All functions are SECURITY INVOKER (RLS applies); plpgsql bodies are single transactions, so each is atomic.

create index entries_source_txn_idx on public.entries (source_txn_id) where source_txn_id is not null;

-- ---------------------------------------------------------------- invariant
create function public._sync_for_other(p_txn uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.transactions
     set for_other_paise = coalesce((select sum(principal_paise) from public.entries
                                     where source_txn_id = p_txn and kind = 'on_behalf' and status <> 'cancelled'), 0)
   where id = p_txn;
end $$;

-- What friends owe on a purchase: [{entry_id, person_id, person_name, amount_paise, pending_paise}]
create function public._txn_others(p_txn uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'entry_id', e.id, 'person_id', e.person_id, 'person_name', p.name, 'amount_paise', e.principal_paise,
           'pending_paise', coalesce(x.left_paise, 0)) order by p.name, e.id), '[]'::jsonb)
  from public.entries e
  left join public.people p on p.id = e.person_id
  left join lateral (select sum(s.due_paise - s.paid_paise)::bigint as left_paise from public.schedule_items s where s.entry_id = e.id) x on true
  where e.source_txn_id = p_txn and e.kind = 'on_behalf' and e.status <> 'cancelled'
$$;

drop function public.create_entry_with_plan(uuid, public.entry_kind, uuid, text, text, bigint, bigint, uuid, uuid, date, public.interest_type, int, boolean, jsonb);

create function public.create_entry_with_plan(
  p_id uuid, p_kind public.entry_kind, p_person uuid, p_party text, p_title text,
  p_principal bigint, p_down bigint, p_account uuid, p_category uuid, p_start date,
  p_interest public.interest_type, p_rate_bps int, p_no_cost boolean, p_rows jsonb, p_source uuid default null
) returns public.entries
language plpgsql security invoker set search_path = public as $$
declare
  e public.entries;
  r record;
  v_n int;
  v_due bigint; v_prin bigint; v_int bigint;
  v_prev date := null;
  v_txn uuid := gen_random_uuid();
  v_party text := nullif(trim(coalesce(p_party, '')), '');
  v_down bigint := coalesce(p_down, 0);
  v_src public.transactions;
  v_owed bigint;
  v_due_last date;
begin
  select * into e from public.entries where id = p_id;
  if found then return e; end if; -- idempotent retry

  if p_kind not in ('lent', 'borrowed', 'emi_purchase', 'instalment', 'on_behalf') then raise exception 'unsupported entry kind' using errcode = '22023'; end if;
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'title is required' using errcode = '22023'; end if;
  if p_principal is null or p_principal <= 0 then raise exception 'amount must be positive' using errcode = '22023'; end if;
  if p_start is null then raise exception 'start date is required' using errcode = '22023'; end if;
  if p_interest not in ('none', 'flat', 'simple', 'reducing') then raise exception 'invalid interest type' using errcode = '22023'; end if;
  if v_down < 0 then raise exception 'down payment cannot be negative' using errcode = '22023'; end if;
  if p_kind in ('lent', 'borrowed', 'on_behalf') and (v_down <> 0 or coalesce(p_no_cost, false)) then
    raise exception 'down payment and no-cost are for purchases only' using errcode = '22023';
  end if;
  if p_kind = 'on_behalf' then
    if p_interest <> 'none' then raise exception 'money paid for someone else carries no interest' using errcode = '22023'; end if;
    select * into v_src from public.transactions where id = p_source;
    if not found or v_src.kind <> 'expense' or v_src.entry_id is not null then raise exception 'the purchase was not found' using errcode = '22023'; end if;
    select coalesce(sum(principal_paise), 0) into v_owed from public.entries where source_txn_id = p_source and kind = 'on_behalf' and status <> 'cancelled';
    if v_owed + p_principal > v_src.amount_paise then
      raise exception 'friends cannot owe more than the purchase (% of % paise)', v_owed + p_principal, v_src.amount_paise using errcode = '22023';
    end if;
  elsif p_source is not null then
    raise exception 'only money paid for someone else has a purchase' using errcode = '22023';
  end if;
  if p_kind in ('lent', 'borrowed', 'on_behalf') then
    if p_person is null or not exists (select 1 from public.people where id = p_person) then raise exception 'person not found' using errcode = '22023'; end if;
  else
    if p_person is not null and not exists (select 1 from public.people where id = p_person) then raise exception 'person not found' using errcode = '22023'; end if;
    if p_person is null and v_party is null then raise exception 'store or person is required' using errcode = '22023'; end if;
  end if;
  if (p_kind in ('lent', 'borrowed') or v_down > 0) and not exists (select 1 from public.accounts where id = p_account) then
    raise exception 'account not found' using errcode = '22023';
  end if;
  if p_category is not null and not exists (select 1 from public.categories where id = p_category) then raise exception 'category not found' using errcode = '22023'; end if;

  -- rows
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'a plan needs at least one row' using errcode = '22023'; end if;
  v_n := jsonb_array_length(p_rows);
  if v_n > 1200 then raise exception 'too many rows' using errcode = '22023'; end if;
  v_due := 0; v_prin := 0; v_int := 0;
  for r in select (x.e->>'seq')::int as seq, (x.e->>'due_date')::date as due_date, (x.e->>'due_paise')::bigint as due,
                  (x.e->>'principal_paise')::bigint as prin, (x.e->>'interest_paise')::bigint as intr, x.ord
           from jsonb_array_elements(p_rows) with ordinality as x(e, ord) order by x.ord loop
    if r.seq <> r.ord then raise exception 'row numbers must run 1, 2, 3, ...' using errcode = '22023'; end if;
    if r.due <= 0 or r.prin < 0 or r.intr < 0 or r.prin + r.intr <> r.due then raise exception 'row % has invalid amounts', r.seq using errcode = '22023'; end if;
    if r.due_date < p_start then raise exception 'row % is dated before the start date', r.seq using errcode = '22023'; end if;
    if v_prev is not null and r.due_date <= v_prev then raise exception 'row dates must increase' using errcode = '22023'; end if;
    v_prev := r.due_date;
    v_due := v_due + r.due; v_prin := v_prin + r.prin; v_int := v_int + r.intr;
  end loop;
  if v_prin <> p_principal then raise exception 'rows do not add up to the amount (% vs %)', v_prin, p_principal using errcode = '22023'; end if;
  if (p_interest = 'none' or coalesce(p_no_cost, false)) and v_int <> 0 then raise exception 'this plan must have no interest' using errcode = '22023'; end if;
  if p_interest = 'flat' and v_int <> round(p_principal::numeric * coalesce(p_rate_bps, 0) / 10000) then raise exception 'flat interest does not match the rate' using errcode = '22023'; end if;
  if p_interest <> 'none' and not coalesce(p_no_cost, false) and coalesce(p_rate_bps, 0) <= 0 then raise exception 'interest rate must be positive' using errcode = '22023'; end if;

  v_due_last := (p_rows->(v_n - 1)->>'due_date')::date;
  if v_due_last = date '9999-12-31' then v_due_last := null; end if;

  insert into public.entries (id, kind, direction, person_id, party_name, title, principal_paise, start_date, due_date, interest, rate_bps,
                              no_cost, down_payment_paise, total_payable_paise, category_id, source_txn_id)
  values (p_id, p_kind, case when p_kind in ('lent', 'on_behalf') then 'receive' else 'pay' end::public.entry_dir, p_person, v_party, trim(p_title), p_principal, p_start,
          v_due_last, p_interest, coalesce(p_rate_bps, 0), coalesce(p_no_cost, false), v_down, v_due, p_category, p_source)
  returning * into e;

  insert into public.schedule_items (entry_id, seq, due_date, due_paise, principal_paise, interest_paise)
  select p_id, (x->>'seq')::int, (x->>'due_date')::date, (x->>'due_paise')::bigint, (x->>'principal_paise')::bigint, (x->>'interest_paise')::bigint
  from jsonb_array_elements(p_rows) x;

  if p_kind = 'on_behalf' then
    perform public._sync_for_other(p_source);
  elsif p_kind in ('lent', 'borrowed') then
    insert into public.transactions (id, kind, amount_paise, date, account_id, title, entry_id)
    values (v_txn, case when p_kind = 'lent' then 'debt_out' else 'debt_in' end::public.txn_kind, p_principal, p_start, p_account, trim(p_title), p_id);
    update public.entries set source_txn_id = v_txn where id = p_id returning * into e;
  elsif v_down > 0 then
    insert into public.transactions (id, kind, amount_paise, date, account_id, category_id, title, entry_id)
    values (v_txn, 'expense', v_down, p_start, p_account, p_category, trim(p_title) || ' (down payment)', p_id);
    update public.entries set source_txn_id = v_txn where id = p_id returning * into e;
  end if;
  return e;
end $$;

create or replace function public.record_payment(
  p_id uuid, p_entry uuid, p_amount bigint, p_paid_on date, p_account uuid,
  p_mode public.pay_mode default null, p_note text default null, p_target_seq int default null
) returns public.entries
language plpgsql security invoker set search_path = public as $$
declare
  e public.entries;
  s public.schedule_items;
  v_txn uuid := gen_random_uuid();
  v_left bigint;
  v_take bigint;
  v_first boolean := true;
  v_total_left bigint;
begin
  select * into e from public.entries where id = p_entry for update;
  if not found then raise exception 'entry not found' using errcode = '22023'; end if;
  if exists (select 1 from public.payments where id = p_id) then return e; end if; -- idempotent retry
  if e.status <> 'open' then raise exception 'entry is not open' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive' using errcode = '22023'; end if;
  if p_paid_on is null then raise exception 'payment date is required' using errcode = '22023'; end if;
  if not exists (select 1 from public.accounts where id = p_account) then raise exception 'account not found' using errcode = '22023'; end if;

  perform 1 from public.schedule_items where entry_id = p_entry for update;
  select coalesce(sum(due_paise - paid_paise), 0) into v_total_left from public.schedule_items where entry_id = p_entry;
  if p_amount > v_total_left then
    raise exception 'payment exceeds the amount left (% paise)', v_total_left using errcode = '22023';
  end if;
  if p_target_seq is not null then
    select * into s from public.schedule_items where entry_id = p_entry and seq = p_target_seq;
    if not found then raise exception 'row % not found', p_target_seq using errcode = '22023'; end if;
    if s.paid_paise >= s.due_paise then raise exception 'row % is already paid', p_target_seq using errcode = '22023'; end if;
  end if;

  insert into public.transactions (id, kind, amount_paise, date, account_id, category_id, title, notes, entry_id)
  values (v_txn,
          case e.kind when 'lent' then 'debt_in' when 'on_behalf' then 'debt_in' when 'borrowed' then 'debt_out' else 'expense' end::public.txn_kind,
          p_amount, p_paid_on, p_account,
          case when e.kind in ('emi_purchase', 'instalment') then e.category_id end,
          e.title, p_note, p_entry);

  v_left := p_amount;
  for s in
    select * from public.schedule_items where entry_id = p_entry and due_paise > paid_paise
    order by (seq = p_target_seq) desc nulls last, seq
  loop
    exit when v_left = 0;
    v_take := least(v_left, s.due_paise - s.paid_paise);
    update public.schedule_items
       set paid_paise = paid_paise + v_take,
           paid_on = case when paid_paise + v_take >= due_paise then p_paid_on else paid_on end
     where id = s.id;
    insert into public.payments (id, entry_id, schedule_item_id, amount_paise, paid_on, account_id, mode, note, txn_id)
    values (case when v_first then p_id else gen_random_uuid() end, p_entry, s.id, v_take, p_paid_on, p_account, p_mode, p_note, v_txn);
    v_first := false;
    v_left := v_left - v_take;
  end loop;

  if not exists (select 1 from public.schedule_items where entry_id = p_entry and due_paise > paid_paise) then
    update public.entries set status = 'settled', settled_on = p_paid_on where id = p_entry returning * into e;
  end if;
  return e;
end $$;

create or replace function public.plan_extra_payment(
  p_id uuid, p_entry uuid, p_amount bigint, p_paid_on date, p_account uuid, p_mode public.pay_mode,
  p_note text, p_base jsonb, p_rows jsonb
) returns public.entries
language plpgsql security invoker set search_path = public as $$
declare e public.entries;
begin
  select * into e from public.entries where id = p_entry for update;
  if not found then raise exception 'entry not found' using errcode = '22023'; end if;
  if exists (select 1 from public.payments where id = p_id) then return e; end if; -- idempotent retry
  if e.status <> 'open' then raise exception 'entry is not open' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive' using errcode = '22023'; end if;
  if p_paid_on is null then raise exception 'payment date is required' using errcode = '22023'; end if;
  if not exists (select 1 from public.accounts where id = p_account) then raise exception 'account not found' using errcode = '22023'; end if;
  perform 1 from public.schedule_items where entry_id = p_entry for update;
  if p_amount > (select coalesce(sum(due_paise - paid_paise), 0) from public.schedule_items where entry_id = p_entry) then
    raise exception 'payment exceeds the amount left' using errcode = '22023';
  end if;

  perform public._plan_replace(p_entry, 'extra', p_base, p_rows, p_amount);

  declare v_txn uuid := gen_random_uuid();
  begin
    insert into public.transactions (id, kind, amount_paise, date, account_id, category_id, title, notes, entry_id)
    values (v_txn, case e.kind when 'lent' then 'debt_in' when 'on_behalf' then 'debt_in' when 'borrowed' then 'debt_out' else 'expense' end::public.txn_kind, p_amount, p_paid_on, p_account,
            case when e.kind in ('emi_purchase', 'instalment') then e.category_id end, e.title || ' (extra payment)', p_note, p_entry);
    insert into public.payments (id, entry_id, schedule_item_id, amount_paise, paid_on, account_id, mode, note, txn_id)
    values (p_id, p_entry, null, p_amount, p_paid_on, p_account, p_mode, p_note, v_txn);
  end;

  update public.entries set due_date = (select max(due_date) from public.schedule_items where entry_id = p_entry) where id = p_entry returning * into e;
  if not exists (select 1 from public.schedule_items where entry_id = p_entry and due_paise > paid_paise) then
    update public.entries set status = 'settled', settled_on = p_paid_on where id = p_entry returning * into e;
  end if;
  return e;
end $$;

create or replace function public.delete_entry(p_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare e public.entries;
begin
  select * into e from public.entries where id = p_id for update;
  if not found then raise exception 'entry not found' using errcode = '22023'; end if;
  if e.kind <> 'on_behalf' then update public.entries set source_txn_id = null where id = p_id; end if;
  delete from public.transactions where entry_id = p_id;
  delete from public.entries where id = p_id; -- payments and schedule rows cascade
  if e.kind = 'on_behalf' and e.source_txn_id is not null then perform public._sync_for_other(e.source_txn_id); end if;
end $$;

create or replace function public.update_entry(p_id uuid, p_patch jsonb) returns public.entries
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
    if (select count(*) from public.schedule_items where entry_id = p_id) <> 1 then raise exception 'use skip or change amount to move plan rows' using errcode = '22023'; end if;
    if p_patch->>'due_date' is not null and (p_patch->>'due_date')::date < e.start_date then
      raise exception 'due date is before the start date' using errcode = '22023';
    end if;
  end if;

  update public.entries set
    title = case when p_patch ? 'title' then trim(p_patch->>'title') else title end,
    notes = case when p_patch ? 'notes' then p_patch->>'notes' else notes end,
    person_id = case when p_patch ? 'person_id' then (p_patch->>'person_id')::uuid else person_id end,
    due_date = case when p_patch ? 'due_date' then (p_patch->>'due_date')::date else due_date end,
    remind = case when p_patch ? 'remind' then (p_patch->>'remind')::boolean else remind end
  where id = p_id returning * into e;

  if p_patch ? 'due_date' then
    update public.schedule_items set due_date = coalesce(e.due_date, date '9999-12-31') where entry_id = p_id;
  end if;
  return e;
end $$;

create or replace function public.filter_transactions(p_filters jsonb) returns setof public.transactions
language sql stable security invoker set search_path = public as $$
  select t.* from public.transactions t
  where (p_filters->>'from' is null or t.date >= (p_filters->>'from')::date)
    and (p_filters->>'to' is null or t.date <= (p_filters->>'to')::date)
    and (p_filters->'kinds' is null or t.kind::text in (select jsonb_array_elements_text(p_filters->'kinds')))
    and (p_filters->'accounts' is null or t.account_id::text in (select jsonb_array_elements_text(p_filters->'accounts'))
         or t.to_account_id::text in (select jsonb_array_elements_text(p_filters->'accounts')))
    and (p_filters->'categories' is null or t.category_id::text in (select jsonb_array_elements_text(p_filters->'categories')))
    and (p_filters->>'min' is null or t.amount_paise >= (p_filters->>'min')::bigint)
    and (p_filters->>'max' is null or t.amount_paise <= (p_filters->>'max')::bigint)
    and (p_filters->>'place' is null or t.place ilike '%' || (p_filters->>'place') || '%')
    and (p_filters->>'others' is distinct from 'pending' or exists (
           select 1 from public.entries oe join public.schedule_items os on os.entry_id = oe.id
           where oe.source_txn_id = t.id and oe.kind = 'on_behalf' and oe.status = 'open' and os.due_paise > os.paid_paise))
    and (p_filters->>'tag' is null or (p_filters->>'tag') = any (t.tags))
    and (p_filters->>'q' is null or
         (coalesce(t.title, '') || ' ' || coalesce(t.place, '') || ' ' || coalesce(t.notes, '')) ilike '%' || (p_filters->>'q') || '%'
         or exists (select 1 from unnest(t.tags) g where g ilike '%' || (p_filters->>'q') || '%')
         or exists (select 1 from public.accounts a where a.id in (t.account_id, t.to_account_id) and a.name ilike '%' || (p_filters->>'q') || '%')
         or exists (select 1 from public.categories c where c.id = t.category_id and c.name ilike '%' || (p_filters->>'q') || '%'))
$$;

drop function public.search_transactions(jsonb, int, jsonb);

create function public.search_transactions(p_filters jsonb default '{}', p_limit int default 50, p_cursor jsonb default null)
returns table (
  id uuid, kind public.txn_kind, amount_paise bigint, date date, account_id uuid, account_name text,
  to_account_id uuid, to_account_name text, category_id uuid, category_name text, category_icon text,
  category_color text, title text, place text, notes text, tags text[], for_other_paise bigint,
  entry_id uuid, created_at timestamptz, others jsonb
)
language sql stable security invoker set search_path = public as $$
  select t.id, t.kind, t.amount_paise, t.date, t.account_id, a.name, t.to_account_id, ta.name,
         t.category_id, c.name, c.icon, c.color, t.title, t.place, t.notes, t.tags, t.for_other_paise,
         t.entry_id, t.created_at, case when t.for_other_paise > 0 then public._txn_others(t.id) else '[]'::jsonb end
  from public.filter_transactions(coalesce(p_filters, '{}'::jsonb)) t
  left join public.accounts a on a.id = t.account_id
  left join public.accounts ta on ta.id = t.to_account_id
  left join public.categories c on c.id = t.category_id
  where p_cursor is null
     or (t.date, t.created_at, t.id) < ((p_cursor->>'date')::date, (p_cursor->>'created_at')::timestamptz, (p_cursor->>'id')::uuid)
  order by t.date desc, t.created_at desc, t.id desc
  limit least(greatest(p_limit, 1), 200)
$$;

create or replace function public.calendar_month(p_month text, p_today date, p_filters jsonb default '{}') returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_start date;
  v_end date;
  v_f jsonb;
begin
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid month %', p_month using errcode = '22023';
  end if;
  if p_today is null then raise exception 'p_today is required' using errcode = '22023'; end if;
  v_start := (p_month || '-01')::date;
  v_end := (v_start + interval '1 month' - interval '1 day')::date;
  v_f := (coalesce(p_filters, '{}'::jsonb) - 'from' - 'to') || jsonb_build_object('from', v_start, 'to', v_end);

  return (
    with t as (
      select f.id, f.kind, f.amount_paise, f.date, f.account_id, f.to_account_id, f.category_id, f.title, f.place, f.notes, f.tags,
             f.for_other_paise, f.entry_id, f.created_at
      from public.filter_transactions(v_f) f where f.kind in ('expense', 'income', 'transfer')
    ),
    d as (
      select date,
             coalesce(sum(amount_paise - for_other_paise) filter (where kind = 'expense'), 0)::bigint as spent,
             coalesce(sum(amount_paise) filter (where kind = 'income'), 0)::bigint as received,
             count(*)::int as txn_count
      from t group by date
    ),
    ranked as (
      select t.*, row_number() over (partition by t.date order by t.created_at desc, t.id desc) as rn from t
    ),
    dues as (
      select coalesce(sum(s.due_paise - s.paid_paise) filter (where s.due_paise > s.paid_paise), 0)::bigint as total,
             coalesce(sum(s.due_paise - s.paid_paise) filter (where s.due_paise > s.paid_paise and s.due_date < p_today), 0)::bigint as overdue
      from public.schedule_items s join public.entries e on e.id = s.entry_id
      where e.status <> 'cancelled' and s.due_date < '9999-12-31' and s.due_date between v_start and v_end
    )
    select jsonb_build_object(
      'month', p_month, 'start', v_start, 'end', v_end,
      'totals', jsonb_build_object(
        'spent', (select coalesce(sum(spent), 0) from d), 'received', (select coalesce(sum(received), 0) from d),
        'dues_paise', (select total from dues), 'overdue_paise', (select overdue from dues)),
      'days', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'spent', spent, 'received', received, 'txn_count', txn_count) order by date) from d), '[]'::jsonb),
      'items', public._calendar_items(v_start, v_end),
      'txns', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'kind', r.kind, 'amount_paise', r.amount_paise, 'date', r.date,
          'account_id', r.account_id, 'account_name', a.name, 'to_account_id', r.to_account_id, 'to_account_name', ta.name,
          'category_id', r.category_id, 'category_name', c.name, 'category_icon', c.icon, 'category_color', c.color,
          'title', r.title, 'place', r.place, 'notes', r.notes, 'tags', r.tags, 'for_other_paise', r.for_other_paise,
          'entry_id', r.entry_id, 'created_at', r.created_at,
          'others', case when r.for_other_paise > 0 then public._txn_others(r.id) else '[]'::jsonb end) order by r.date desc, r.created_at desc, r.id desc)
        from ranked r
        left join public.accounts a on a.id = r.account_id
        left join public.accounts ta on ta.id = r.to_account_id
        left join public.categories c on c.id = r.category_id
        where r.rn <= 25), '[]'::jsonb),
      'notes', public._calendar_notes(v_start, v_end))
  );
end $$;

create or replace function public.dashboard_summary(p_month text, p_today date, p_filters jsonb default '{}')
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
        'i_owe', (public.money_stats(p_today)->>'i_owe')::bigint),
    'friends', (
      with f as (
        select tx.account_id, sum(s.due_paise - s.paid_paise)::bigint as left_paise
        from public.entries e
        join public.transactions tx on tx.id = e.source_txn_id
        join public.schedule_items s on s.entry_id = e.id
        where e.kind = 'on_behalf' and e.status = 'open' and s.due_paise > s.paid_paise
        group by tx.account_id)
      select jsonb_build_object(
        'pending_paise', coalesce((select sum(left_paise) from f), 0)::bigint,
        'by_account', coalesce((select jsonb_agg(jsonb_build_object('account_id', account_id, 'pending_paise', left_paise)) from f), '[]'::jsonb))),
    'due_soon', (
      with d as (
        select e.id as entry_id, s.seq, e.kind, e.direction, e.title, coalesce(p.name, e.party_name) as name, s.due_date,
               (s.due_paise - s.paid_paise) as left_paise, count(*) over () as total
        from public.entries e
        join public.schedule_items s on s.entry_id = e.id
        left join public.people p on p.id = e.person_id
        where e.status = 'open' and s.due_paise > s.paid_paise and s.due_date < '9999-12-31' and s.due_date <= p_today + 7
        order by s.due_date, e.id, s.seq
        limit 5)
      select jsonb_build_object(
        'items', coalesce(jsonb_agg(jsonb_build_object('entry_id', entry_id, 'seq', seq, 'kind', kind, 'direction', direction, 'title', title,
                 'name', name, 'due_date', due_date, 'remaining_paise', left_paise) order by due_date, entry_id, seq), '[]'::jsonb),
        'total_count', coalesce(max(total), 0))
      from d),
    'emi_load', (
      with r as (
        select s.due_date, (s.due_paise - s.paid_paise) as left_paise
        from public.entries e join public.schedule_items s on s.entry_id = e.id
        where e.status = 'open' and e.direction = 'pay' and s.due_paise > s.paid_paise
      ),
      m as (select (date_trunc('month', p_today::timestamp) + (g::text || ' month')::interval)::date as start from generate_series(0, 11) g)
      select jsonb_build_object(
        'months', (select jsonb_agg(jsonb_build_object('month', to_char(m.start, 'YYYY-MM'),
                     'due_paise', coalesce((select sum(left_paise) from r where r.due_date >= m.start and r.due_date < (m.start + interval '1 month') and r.due_date < '9999-12-31'), 0)::bigint)
                   order by m.start) from m),
        'overdue_paise', coalesce((select sum(left_paise) from r where r.due_date < date_trunc('month', p_today::timestamp)::date), 0)::bigint,
        'outstanding_paise', coalesce((select sum(left_paise) from r), 0)::bigint,
        'debt_free_date', (select max(due_date) from r where due_date < '9999-12-31'),
        'open_count', (select count(distinct e.id) from public.entries e join public.schedule_items s on s.entry_id = e.id
                       where e.status = 'open' and e.direction = 'pay' and s.due_paise > s.paid_paise))))
$$;


-- ---------------------------------------------------------------- add a purchase together with what friends owe (atomic, idempotent on p_id)
-- p_others: [{person_id, amount_paise, due_date?, rows?}]; rows (a plan) replace the single due date. Returns {txn, entries}.
create function public.quick_add_with_others(
  p_id uuid, p_amount bigint, p_date date, p_account uuid, p_category uuid default null, p_title text default null,
  p_place text default null, p_notes text default null, p_tags text[] default '{}', p_others jsonb default '[]'
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  t public.transactions;
  o jsonb;
  v_sum bigint := 0;
  v_amt bigint;
  v_name text;
  v_rows jsonb;
begin
  select * into t from public.transactions where id = p_id;
  if found then -- idempotent retry
    return jsonb_build_object('txn', to_jsonb(t), 'entries', coalesce((select jsonb_agg(id) from public.entries where source_txn_id = p_id), '[]'::jsonb));
  end if;

  if p_others is null or jsonb_typeof(p_others) <> 'array' or jsonb_array_length(p_others) = 0 then
    raise exception 'choose who this was paid for' using errcode = '22023';
  end if;
  for o in select * from jsonb_array_elements(p_others) loop
    v_amt := (o->>'amount_paise')::bigint;
    if v_amt is null or v_amt <= 0 then raise exception 'each friend needs an amount above zero' using errcode = '22023'; end if;
    v_sum := v_sum + v_amt;
  end loop;
  if p_amount is null or v_sum > p_amount then
    raise exception 'friends cannot owe more than the purchase (% of % paise)', v_sum, p_amount using errcode = '22023';
  end if;

  perform public.quick_add_transaction(p_id, 'expense', p_amount, p_date, p_account, null, p_category, p_title, p_place, p_notes, p_tags);

  for o in select * from jsonb_array_elements(p_others) loop
    v_amt := (o->>'amount_paise')::bigint;
    select name into v_name from public.people where id = (o->>'person_id')::uuid;
    if v_name is null then raise exception 'person not found' using errcode = '22023'; end if;
    if o ? 'rows' and jsonb_typeof(o->'rows') = 'array' and jsonb_array_length(o->'rows') > 0 then
      v_rows := o->'rows';
    else
      v_rows := jsonb_build_array(jsonb_build_object('seq', 1, 'due_date', coalesce(nullif(o->>'due_date', ''), '9999-12-31'),
                                                     'due_paise', v_amt, 'principal_paise', v_amt, 'interest_paise', 0));
    end if;
    perform public.create_entry_with_plan(gen_random_uuid(), 'on_behalf', (o->>'person_id')::uuid, null,
      coalesce(nullif(trim(p_title), ''), 'Paid for ' || v_name), v_amt, 0, p_account, null, p_date, 'none', 0, false, v_rows, p_id);
  end loop;

  select * into t from public.transactions where id = p_id;
  return jsonb_build_object('txn', to_jsonb(t), 'entries', coalesce((select jsonb_agg(id order by created_at, id) from public.entries where source_txn_id = p_id), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- delete a purchase
-- Blocked while any friend has paid. Otherwise removes the friends' entries with it and returns a snapshot so the app can Undo.
create function public.delete_transaction(p_id uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  t public.transactions;
  e record;
  v_paid bigint;
  v_snapshot jsonb;
begin
  select * into t from public.transactions where id = p_id for update;
  if not found then raise exception 'transaction not found' using errcode = '22023'; end if;
  if t.entry_id is not null then raise exception 'this belongs to a loan or EMI: change or delete it from there' using errcode = '22023'; end if;

  for e in select en.id, en.principal_paise, en.person_id, en.due_date, p.name from public.entries en left join public.people p on p.id = en.person_id
           where en.source_txn_id = p_id and en.kind = 'on_behalf' and en.status <> 'cancelled' loop
    select coalesce(sum(amount_paise), 0) into v_paid from public.payments where entry_id = e.id;
    if v_paid > 0 then
      raise exception '% has already paid ₹%. Delete those payments first.', coalesce(e.name, 'Someone'), trim(to_char(v_paid / 100.0, 'FM999999990.##')) using errcode = '22023';
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('person_id', en.person_id, 'amount_paise', en.principal_paise, 'due_date', en.due_date,
           'rows', (select coalesce(jsonb_agg(jsonb_build_object('seq', s.seq, 'due_date', s.due_date, 'due_paise', s.due_paise,
                      'principal_paise', s.principal_paise, 'interest_paise', s.interest_paise) order by s.seq), '[]'::jsonb)
                    from public.schedule_items s where s.entry_id = en.id)) order by en.created_at, en.id), '[]'::jsonb)
    into v_snapshot from public.entries en where en.source_txn_id = p_id and en.kind = 'on_behalf' and en.status <> 'cancelled';

  delete from public.entries where source_txn_id = p_id; -- rows cascade
  delete from public.transactions where id = p_id;
  return jsonb_build_object('txn', to_jsonb(t), 'others', v_snapshot);
end $$;

-- ---------------------------------------------------------------- edit a purchase that friends owe money on
-- p_patch keys (all optional): title, place, notes, tags, category_id, date, account_id, amount_paise.
-- p_others: null = leave the friends as they are; otherwise the full new list [{entry_id?, person_id, amount_paise, due_date?}].
--   an existing friend (entry_id) can change amount (single-row entries, never below what they paid) and due date;
--   a friend left out is removed only if they have paid nothing; a new one is added.
create function public.update_expense_for_others(p_id uuid, p_patch jsonb, p_others jsonb default null) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  t public.transactions;
  v_amount bigint;
  v_owed bigint;
  o jsonb;
  e public.entries;
  v_paid bigint;
  v_sum bigint := 0;
  v_keep uuid[] := '{}';
  v_amt bigint;
  v_rows int;
begin
  select * into t from public.transactions where id = p_id for update;
  if not found then raise exception 'transaction not found' using errcode = '22023'; end if;
  if t.kind <> 'expense' or t.entry_id is not null then raise exception 'only a purchase can be edited here' using errcode = '22023'; end if;
  v_amount := coalesce((p_patch->>'amount_paise')::bigint, t.amount_paise);
  if v_amount <= 0 then raise exception 'amount must be positive' using errcode = '22023'; end if;
  if p_patch ? 'account_id' and not exists (select 1 from public.accounts where id = (p_patch->>'account_id')::uuid) then raise exception 'account not found' using errcode = '22023'; end if;
  if p_patch->>'category_id' is not null and not exists (select 1 from public.categories where id = (p_patch->>'category_id')::uuid and kind = 'expense') then raise exception 'category not found' using errcode = '22023'; end if;

  select coalesce(sum(principal_paise), 0) into v_owed from public.entries where source_txn_id = p_id and kind = 'on_behalf' and status <> 'cancelled';
  if p_others is null then
    if v_amount < v_owed then raise exception 'the amount cannot be less than what friends owe (% paise)', v_owed using errcode = '22023'; end if;
  else
    if jsonb_typeof(p_others) <> 'array' then raise exception 'invalid list of friends' using errcode = '22023'; end if;
    for o in select * from jsonb_array_elements(p_others) loop v_sum := v_sum + coalesce((o->>'amount_paise')::bigint, 0); end loop;
    if v_sum > v_amount then raise exception 'friends cannot owe more than the purchase (% of % paise)', v_sum, v_amount using errcode = '22023'; end if;
  end if;

  update public.transactions set
    title = case when p_patch ? 'title' then nullif(trim(p_patch->>'title'), '') else title end,
    place = case when p_patch ? 'place' then nullif(trim(p_patch->>'place'), '') else place end,
    notes = case when p_patch ? 'notes' then nullif(trim(p_patch->>'notes'), '') else notes end,
    tags = case when p_patch ? 'tags' then coalesce(array(select jsonb_array_elements_text(p_patch->'tags')), '{}') else tags end,
    category_id = case when p_patch ? 'category_id' then (p_patch->>'category_id')::uuid else category_id end,
    date = case when p_patch ? 'date' then (p_patch->>'date')::date else date end,
    account_id = case when p_patch ? 'account_id' then (p_patch->>'account_id')::uuid else account_id end,
    amount_paise = v_amount,
    for_other_paise = 0
  where id = p_id;

  if p_others is not null then
    -- existing friends: update or keep
    for o in select * from jsonb_array_elements(p_others) loop
      if o->>'entry_id' is null then continue; end if;
      select * into e from public.entries where id = (o->>'entry_id')::uuid and source_txn_id = p_id and kind = 'on_behalf' for update;
      if not found then raise exception 'that friend is not part of this purchase' using errcode = '22023'; end if;
      v_keep := v_keep || e.id;
      v_amt := (o->>'amount_paise')::bigint;
      select coalesce(sum(amount_paise), 0) into v_paid from public.payments where entry_id = e.id;
      if v_amt < v_paid then raise exception 'they have already paid ₹% so this cannot go below that', trim(to_char(v_paid / 100.0, 'FM999999990.##')) using errcode = '22023'; end if;
      if v_amt <> e.principal_paise then
        select count(*) into v_rows from public.schedule_items where entry_id = e.id;
        if v_rows <> 1 then raise exception 'this friend pays in instalments: change the amount from their entry' using errcode = '22023'; end if;
        update public.entries set principal_paise = v_amt, total_payable_paise = v_amt where id = e.id;
        update public.schedule_items set due_paise = v_amt, principal_paise = v_amt where entry_id = e.id;
        if v_paid >= v_amt then update public.entries set status = 'settled', settled_on = coalesce(settled_on, current_date) where id = e.id; end if;
      end if;
    end loop;
    -- friends left out: only if they paid nothing
    for e in select * from public.entries where source_txn_id = p_id and kind = 'on_behalf' and status <> 'cancelled' and id <> all (v_keep) loop
      select coalesce(sum(amount_paise), 0) into v_paid from public.payments where entry_id = e.id;
      if v_paid > 0 then raise exception 'someone who has already paid cannot be removed' using errcode = '22023'; end if;
      delete from public.entries where id = e.id;
    end loop;
    -- new friends
    for o in select * from jsonb_array_elements(p_others) loop
      if o->>'entry_id' is not null then continue; end if;
      v_amt := (o->>'amount_paise')::bigint;
      perform public.create_entry_with_plan(gen_random_uuid(), 'on_behalf', (o->>'person_id')::uuid, null,
        coalesce((select nullif(trim(title), '') from public.transactions where id = p_id), 'Paid for ' || (select name from public.people where id = (o->>'person_id')::uuid)),
        v_amt, 0, (select account_id from public.transactions where id = p_id), null, (select date from public.transactions where id = p_id), 'none', 0, false,
        jsonb_build_array(jsonb_build_object('seq', 1, 'due_date', coalesce(nullif(o->>'due_date', ''), '9999-12-31'), 'due_paise', v_amt, 'principal_paise', v_amt, 'interest_paise', 0)), p_id);
    end loop;
  end if;
  perform public._sync_for_other(p_id);

  select * into t from public.transactions where id = p_id;
  return jsonb_build_object('txn', to_jsonb(t), 'others', public._txn_others(p_id));
end $$;

-- only signed-in users may call these
do $$
declare f text;
begin
  foreach f in array array[
    '_sync_for_other(uuid)', '_txn_others(uuid)',
    'create_entry_with_plan(uuid,entry_kind,uuid,text,text,bigint,bigint,uuid,uuid,date,interest_type,int,boolean,jsonb,uuid)',
    'record_payment(uuid,uuid,bigint,date,uuid,pay_mode,text,int)', 'plan_extra_payment(uuid,uuid,bigint,date,uuid,pay_mode,text,jsonb,jsonb)',
    'delete_entry(uuid)', 'update_entry(uuid,jsonb)', 'filter_transactions(jsonb)', 'search_transactions(jsonb,int,jsonb)',
    'calendar_month(text,date,jsonb)', 'dashboard_summary(text,date,jsonb)',
    'quick_add_with_others(uuid,bigint,date,uuid,uuid,text,text,text,text[],jsonb)', 'delete_transaction(uuid)', 'update_expense_for_others(uuid,jsonb,jsonb)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
