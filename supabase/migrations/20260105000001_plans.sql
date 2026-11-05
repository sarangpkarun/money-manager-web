-- Phase 5A: payment plans (many schedule rows per entry), EMI purchases, plan edits.
--
-- The app builds plan rows with its own tested TypeScript; the server validates and stores them. Payment allocation
-- stays on the server (race safe). Accounting: lent / borrowed move money as debt_out / debt_in (never spending);
-- emi_purchase / instalment record the down payment and every instalment as an `expense` in the entry's category.
-- Progress is derived: paid = sum of payments, left = sum of (due - paid) over rows, total = paid + left.
-- All functions are SECURITY INVOKER (RLS applies); plpgsql bodies are single transactions, so each is atomic.

alter table public.entries add column category_id uuid references public.categories;
create policy category_owned on public.entries as restrictive for all to authenticated using (true) with check (
  category_id is null or exists (select 1 from public.categories c where c.id = category_id));

-- ---------------------------------------------------------------- create
create function public.create_entry_with_plan(
  p_id uuid, p_kind public.entry_kind, p_person uuid, p_party text, p_title text,
  p_principal bigint, p_down bigint, p_account uuid, p_category uuid, p_start date,
  p_interest public.interest_type, p_rate_bps int, p_no_cost boolean, p_rows jsonb
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
begin
  select * into e from public.entries where id = p_id;
  if found then return e; end if; -- idempotent retry

  if p_kind not in ('lent', 'borrowed', 'emi_purchase', 'instalment') then raise exception 'unsupported entry kind' using errcode = '22023'; end if;
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'title is required' using errcode = '22023'; end if;
  if p_principal is null or p_principal <= 0 then raise exception 'amount must be positive' using errcode = '22023'; end if;
  if p_start is null then raise exception 'start date is required' using errcode = '22023'; end if;
  if p_interest not in ('none', 'flat', 'simple', 'reducing') then raise exception 'invalid interest type' using errcode = '22023'; end if;
  if v_down < 0 then raise exception 'down payment cannot be negative' using errcode = '22023'; end if;
  if p_kind in ('lent', 'borrowed') and (v_down <> 0 or coalesce(p_no_cost, false)) then
    raise exception 'down payment and no-cost are for purchases only' using errcode = '22023';
  end if;
  if p_kind in ('lent', 'borrowed') then
    if p_person is null or not exists (select 1 from public.people where id = p_person) then raise exception 'person not found' using errcode = '22023'; end if;
  else
    if p_person is not null and not exists (select 1 from public.people where id = p_person) then raise exception 'person not found' using errcode = '22023'; end if;
    if p_person is null and v_party is null then raise exception 'store or person is required' using errcode = '22023'; end if;
  end if;
  if (p_kind = 'lent' or v_down > 0 or p_kind = 'borrowed') and not exists (select 1 from public.accounts where id = p_account) then
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

  insert into public.entries (id, kind, direction, person_id, party_name, title, principal_paise, start_date, due_date, interest, rate_bps,
                              no_cost, down_payment_paise, total_payable_paise, category_id)
  values (p_id, p_kind, case when p_kind = 'lent' then 'receive' else 'pay' end::public.entry_dir, p_person, v_party, trim(p_title), p_principal, p_start,
          (p_rows->(v_n - 1)->>'due_date')::date, p_interest, coalesce(p_rate_bps, 0), coalesce(p_no_cost, false), v_down, v_due, p_category)
  returning * into e;

  insert into public.schedule_items (entry_id, seq, due_date, due_paise, principal_paise, interest_paise)
  select p_id, (x->>'seq')::int, (x->>'due_date')::date, (x->>'due_paise')::bigint, (x->>'principal_paise')::bigint, (x->>'interest_paise')::bigint
  from jsonb_array_elements(p_rows) x;

  if p_kind in ('lent', 'borrowed') then
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

-- ---------------------------------------------------------------- payments
drop function public.record_payment(uuid, uuid, bigint, date, uuid, public.pay_mode, text);

-- Pays p_target_seq first (if given), the rest flows to the earliest unpaid rows. One payment row per part, one transaction.
create function public.record_payment(
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
          case e.kind when 'lent' then 'debt_in' when 'borrowed' then 'debt_out' else 'expense' end::public.txn_kind,
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

-- Undoes the whole cash movement the payment belongs to (all parts sharing its transaction). Extra payments cannot be undone.
create or replace function public.delete_payment(p_id uuid) returns public.entries
language plpgsql security invoker set search_path = public as $$
declare
  p public.payments;
  q public.payments;
  e public.entries;
begin
  select * into p from public.payments where id = p_id;
  if not found then raise exception 'payment not found' using errcode = '22023'; end if;
  select * into e from public.entries where id = p.entry_id for update;
  if p.schedule_item_id is null then raise exception 'an extra payment cannot be deleted' using errcode = '22023'; end if;

  for q in select * from public.payments where entry_id = p.entry_id and (id = p.id or (p.txn_id is not null and txn_id = p.txn_id)) loop
    update public.schedule_items
       set paid_paise = paid_paise - q.amount_paise,
           paid_on = case when paid_paise - q.amount_paise >= due_paise then paid_on else null end
     where id = q.schedule_item_id;
    delete from public.payments where id = q.id;
  end loop;
  if p.txn_id is not null then delete from public.transactions where id = p.txn_id; end if;
  update public.entries set status = 'open', settled_on = null where id = p.entry_id returning * into e;
  return e;
end $$;

create or replace function public.mark_unpaid(p_entry uuid) returns public.entries
language plpgsql security invoker set search_path = public as $$
declare e public.entries;
begin
  select * into e from public.entries where id = p_entry for update;
  if not found then raise exception 'entry not found' using errcode = '22023'; end if;
  if exists (select 1 from public.payments where entry_id = p_entry and schedule_item_id is null) then
    raise exception 'this plan was shortened by an extra payment and cannot be reset' using errcode = '22023';
  end if;
  delete from public.transactions where id in (select txn_id from public.payments where entry_id = p_entry and txn_id is not null);
  delete from public.payments where entry_id = p_entry;
  update public.schedule_items set paid_paise = 0, paid_on = null where entry_id = p_entry;
  update public.entries set status = 'open', settled_on = null where id = p_entry returning * into e;
  return e;
end $$;

-- ---------------------------------------------------------------- plan edits
-- p_base = the rows the client started from, p_rows = the rows it wants. Both are arrays of
-- {seq, due_date, due_paise, principal_paise, interest_paise, paid_paise, paid_on}.
-- p_action: 'skip' (only due dates of unpaid rows change), 'change' (only amounts of unpaid rows change, total unchanged),
--           'extra' (amounts shrink by exactly p_extra, rows may disappear or complete).
create function public._plan_replace(p_entry uuid, p_action text, p_base jsonb, p_rows jsonb, p_extra bigint) returns void
language plpgsql security invoker set search_path = public as $$
declare
  c public.schedule_items;
  n jsonb;
  b jsonb;
  v_seen int[] := '{}';
  v_sum_before bigint;
  v_sum_after bigint := 0;
  v_expected bigint;
begin
  if p_base is null or p_rows is null or jsonb_typeof(p_base) <> 'array' or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'plan rows are required' using errcode = '22023';
  end if;

  -- the screen must have been looking at the current plan
  if jsonb_array_length(p_base) <> (select count(*) from public.schedule_items where entry_id = p_entry) then
    raise exception 'this plan changed, please reload' using errcode = '40001';
  end if;
  select coalesce(sum(due_paise), 0) into v_sum_before from public.schedule_items where entry_id = p_entry;
  for c in select * from public.schedule_items where entry_id = p_entry order by seq loop
    select x into b from jsonb_array_elements(p_base) x where (x->>'seq')::int = c.seq;
    if b is null or (b->>'due_date')::date <> c.due_date or (b->>'due_paise')::bigint <> c.due_paise or (b->>'paid_paise')::bigint <> c.paid_paise then
      raise exception 'this plan changed, please reload' using errcode = '40001';
    end if;
  end loop;

  for n in select * from jsonb_array_elements(p_rows) loop
    select * into c from public.schedule_items where entry_id = p_entry and seq = (n->>'seq')::int;
    if not found then raise exception 'row % does not exist', n->>'seq' using errcode = '22023'; end if;
    if (n->>'seq')::int = any (v_seen) then raise exception 'duplicate row %', n->>'seq' using errcode = '22023'; end if;
    v_seen := v_seen || (n->>'seq')::int;
    if (n->>'paid_paise')::bigint <> c.paid_paise then raise exception 'paid amounts cannot change' using errcode = '22023'; end if;
    if (n->>'due_paise')::bigint < c.paid_paise or (n->>'due_paise')::bigint <= 0 then raise exception 'row % has an invalid amount', c.seq using errcode = '22023'; end if;
    if (n->>'principal_paise')::bigint < 0 or (n->>'interest_paise')::bigint < 0
       or (n->>'principal_paise')::bigint + (n->>'interest_paise')::bigint <> (n->>'due_paise')::bigint then
      raise exception 'row % has invalid amounts', c.seq using errcode = '22023';
    end if;
    if p_action = 'skip' then
      if c.paid_paise >= c.due_paise and (n->>'due_date')::date <> c.due_date then raise exception 'a paid row cannot move' using errcode = '22023'; end if;
      if (n->>'due_paise')::bigint <> c.due_paise or (n->>'principal_paise')::bigint <> c.principal_paise then raise exception 'skipping does not change amounts' using errcode = '22023'; end if;
    else
      if (n->>'due_date')::date <> c.due_date then raise exception 'dates do not change here' using errcode = '22023'; end if;
      if p_action = 'change' and c.paid_paise >= c.due_paise and (n->>'due_paise')::bigint <> c.due_paise then raise exception 'a paid row cannot change' using errcode = '22023'; end if;
    end if;
    v_sum_after := v_sum_after + (n->>'due_paise')::bigint;
  end loop;

  -- rows left out are removed: only an extra payment may do that, and only for rows with nothing paid
  if exists (select 1 from public.schedule_items s where s.entry_id = p_entry and s.seq <> all (v_seen)) then
    if p_action <> 'extra' then raise exception 'rows cannot be removed here' using errcode = '22023'; end if;
    if exists (select 1 from public.schedule_items s where s.entry_id = p_entry and s.seq <> all (v_seen) and s.paid_paise > 0) then
      raise exception 'a row with payments cannot be removed' using errcode = '22023';
    end if;
  end if;
  v_expected := 0;
  if p_action = 'extra' then v_expected := p_extra; end if;
  if v_sum_before - v_sum_after <> v_expected then
    raise exception 'the new rows do not add up' using errcode = '22023';
  end if;

  delete from public.schedule_items where entry_id = p_entry and seq <> all (v_seen);
  update public.schedule_items s set
    due_date = (nr.x->>'due_date')::date, due_paise = (nr.x->>'due_paise')::bigint,
    principal_paise = (nr.x->>'principal_paise')::bigint, interest_paise = (nr.x->>'interest_paise')::bigint,
    paid_on = case when nr.x ? 'paid_on' then (nr.x->>'paid_on')::date else s.paid_on end
  from (select x from jsonb_array_elements(p_rows) x) nr
  where s.entry_id = p_entry and s.seq = (nr.x->>'seq')::int;
end $$;

create function public.plan_skip_month(p_entry uuid, p_base jsonb, p_rows jsonb) returns public.entries
language plpgsql security invoker set search_path = public as $$
declare e public.entries;
begin
  select * into e from public.entries where id = p_entry for update;
  if not found then raise exception 'entry not found' using errcode = '22023'; end if;
  if e.status <> 'open' then raise exception 'entry is not open' using errcode = '22023'; end if;
  perform public._plan_replace(p_entry, 'skip', p_base, p_rows, 0);
  update public.entries set due_date = (select max(due_date) from public.schedule_items where entry_id = p_entry) where id = p_entry returning * into e;
  return e;
end $$;

create function public.plan_change_amount(p_entry uuid, p_base jsonb, p_rows jsonb) returns public.entries
language plpgsql security invoker set search_path = public as $$
declare e public.entries;
begin
  select * into e from public.entries where id = p_entry for update;
  if not found then raise exception 'entry not found' using errcode = '22023'; end if;
  if e.status <> 'open' then raise exception 'entry is not open' using errcode = '22023'; end if;
  perform public._plan_replace(p_entry, 'change', p_base, p_rows, 0);
  return e;
end $$;

-- Extra payment: shortens the plan from the last row backwards and records the cash movement (no schedule row).
create function public.plan_extra_payment(
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
    values (v_txn, case e.kind when 'lent' then 'debt_in' when 'borrowed' then 'debt_out' else 'expense' end::public.txn_kind, p_amount, p_paid_on, p_account,
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

-- due date edit: only for single-row entries without simple interest
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
    due_date = case when p_patch ? 'due_date' then (p_patch->>'due_date')::date else due_date end
  where id = p_id returning * into e;

  if p_patch ? 'due_date' then
    update public.schedule_items set due_date = coalesce(e.due_date, date '9999-12-31') where entry_id = p_id;
  end if;
  return e;
end $$;

-- ---------------------------------------------------------------- reads over many rows
create or replace function public.money_stats(p_today date) returns jsonb
language sql stable security invoker set search_path = public as $$
  with o as (
    select e.id as entry_id, e.direction, (s.due_paise - s.paid_paise) as left_paise,
           case when s.due_date < '9999-12-31' and s.due_date < p_today then p_today - s.due_date else 0 end as late
    from public.entries e join public.schedule_items s on s.entry_id = e.id
    where e.status = 'open' and s.due_paise > s.paid_paise
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
    'open_count', (select count(distinct entry_id) from o))
$$;

-- Open entries (one row each): totals derived from payments and rows; due_date = earliest unpaid due date (null if none).
create or replace function public.money_overview(p_today date) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'stats', public.money_stats(p_today),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'kind', t.kind, 'direction', t.direction, 'title', t.title,
        'person_id', t.person_id, 'person_name', t.name,
        'principal_paise', t.principal_paise, 'total_paise', t.paid + t.left_paise, 'paid_paise', t.paid,
        'outstanding_paise', t.left_paise, 'start_date', t.start_date,
        'due_date', t.next_due, 'overdue_paise', t.overdue_paise, 'rows_total', t.rows_total, 'rows_paid', t.rows_paid)
        order by coalesce(t.next_due, date '9999-12-31'), t.created_at)
      from (
        select e.id, e.kind, e.direction, e.title, e.person_id, coalesce(p.name, e.party_name) as name, e.principal_paise, e.start_date, e.created_at,
               coalesce((select sum(py.amount_paise) from public.payments py where py.entry_id = e.id), 0)::bigint as paid,
               sum(s.due_paise - s.paid_paise)::bigint as left_paise,
               min(s.due_date) filter (where s.due_paise > s.paid_paise and s.due_date < '9999-12-31') as next_due,
               coalesce(sum(s.due_paise - s.paid_paise) filter (where s.due_paise > s.paid_paise and s.due_date < '9999-12-31' and s.due_date < p_today), 0)::bigint as overdue_paise,
               count(s.id)::int as rows_total,
               (count(s.id) filter (where s.paid_paise >= s.due_paise))::int as rows_paid
        from public.entries e
        join public.schedule_items s on s.entry_id = e.id
        left join public.people p on p.id = e.person_id
        where e.status = 'open'
        group by e.id, p.name) t), '[]'::jsonb))
$$;

drop function public.money_history(int, jsonb);
create function public.money_history(p_limit int default 50, p_cursor jsonb default null)
returns table (
  id uuid, kind public.entry_kind, direction public.entry_dir, title text, person_id uuid, person_name text,
  principal_paise bigint, total_paise bigint, paid_paise bigint, start_date date, due_date date, settled_on date
)
language sql stable security invoker set search_path = public as $$
  select e.id, e.kind, e.direction, e.title, e.person_id, coalesce(p.name, e.party_name), e.principal_paise,
         coalesce((select sum(py.amount_paise) from public.payments py where py.entry_id = e.id), 0)::bigint,
         coalesce((select sum(py.amount_paise) from public.payments py where py.entry_id = e.id), 0)::bigint,
         e.start_date, e.due_date, e.settled_on
  from public.entries e
  left join public.people p on p.id = e.person_id
  where e.status = 'settled'
    and (p_cursor is null or (e.settled_on, e.id) < ((p_cursor->>'settled_on')::date, (p_cursor->>'id')::uuid))
  order by e.settled_on desc, e.id desc
  limit least(greatest(p_limit, 1), 200)
$$;

create or replace view public.people_balances with (security_invoker = true) as
select p.id as person_id, p.user_id, p.name, p.phone, p.email, p.archived,
       coalesce(sum(o.left_paise) filter (where e.direction = 'receive' and e.status = 'open'), 0)::bigint as owed_to_me_paise,
       coalesce(sum(o.left_paise) filter (where e.direction = 'pay' and e.status = 'open'), 0)::bigint as i_owe_paise,
       count(e.id) filter (where e.status = 'open')::int as open_count,
       count(e.id)::int as entry_count,
       max(e.start_date) as last_entry_date
from public.people p
left join public.entries e on e.person_id = p.id
left join lateral (select coalesce(sum(s.due_paise - s.paid_paise), 0) as left_paise from public.schedule_items s where s.entry_id = e.id) o on true
group by p.id;

-- ---------------------------------------------------------------- dashboard: due soon and EMI / loan load (same single call)
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

-- only signed-in users may call these
do $$
declare f text;
begin
  foreach f in array array[
    'create_entry_with_plan(uuid,entry_kind,uuid,text,text,bigint,bigint,uuid,uuid,date,interest_type,int,boolean,jsonb)',
    'record_payment(uuid,uuid,bigint,date,uuid,pay_mode,text,int)', 'delete_payment(uuid)', 'mark_unpaid(uuid)',
    '_plan_replace(uuid,text,jsonb,jsonb,bigint)', 'plan_skip_month(uuid,jsonb,jsonb)', 'plan_change_amount(uuid,jsonb,jsonb)',
    'plan_extra_payment(uuid,uuid,bigint,date,uuid,pay_mode,text,jsonb,jsonb)', 'update_entry(uuid,jsonb)',
    'money_stats(date)', 'money_overview(date)', 'money_history(int,jsonb)', 'dashboard_summary(text,date,jsonb)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
