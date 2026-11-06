-- Phase 9: a stale plan edit must fail at once.
-- _plan_replace raised "this plan changed, please reload" with SQLSTATE 40001 (serialization_failure). PostgREST 14 treats that as
-- "retry the transaction", so the request never came back: the screen would have hung instead of showing the message. The body is
-- unchanged except for the error code (P0001); the message is what the app matches.
create or replace function public._plan_replace(p_entry uuid, p_action text, p_base jsonb, p_rows jsonb, p_extra bigint) returns void
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
    raise exception 'this plan changed, please reload' using errcode = 'P0001';
  end if;
  select coalesce(sum(due_paise), 0) into v_sum_before from public.schedule_items where entry_id = p_entry;
  for c in select * from public.schedule_items where entry_id = p_entry order by seq loop
    select x into b from jsonb_array_elements(p_base) x where (x->>'seq')::int = c.seq;
    if b is null or (b->>'due_date')::date <> c.due_date or (b->>'due_paise')::bigint <> c.due_paise or (b->>'paid_paise')::bigint <> c.paid_paise then
      raise exception 'this plan changed, please reload' using errcode = 'P0001';
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
