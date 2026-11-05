-- Phase 5B: Calendar. One payload per month (totals, per-day spend, plan rows due or paid in the month, spending rows, notes/tasks)
-- and a windowed agenda. Markers (red/amber/green/blue ticks) are derived by the client from the row data, not here.
-- Both functions are SECURITY INVOKER (RLS applies). Business dates come from the client's p_today, never now().

create index schedule_items_paid_on_idx on public.schedule_items (user_id, paid_on) where paid_on is not null;
create index notes_user_date_idx on public.notes (user_id, date);

-- Plan rows whose due date or paid date falls in [p_from, p_to]. Rows without a due date are left out.
create function public._calendar_items(p_from date, p_to date) returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'entry_id', e.id, 'seq', s.seq, 'kind', e.kind, 'direction', e.direction, 'title', e.title,
    'name', coalesce(p.name, e.party_name), 'due_date', s.due_date, 'due_paise', s.due_paise,
    'paid_paise', s.paid_paise, 'paid_on', s.paid_on, 'remaining_paise', s.due_paise - s.paid_paise)
    order by s.due_date, e.id, s.seq), '[]'::jsonb)
  from public.schedule_items s
  join public.entries e on e.id = s.entry_id
  left join public.people p on p.id = e.person_id
  where e.status <> 'cancelled' and s.due_date < '9999-12-31'
    and ((s.due_date between p_from and p_to) or (s.paid_on between p_from and p_to))
$$;

-- One-off notes/tasks dated in the window, plus every repeating one dated on or before the window end (the client expands them).
create function public._calendar_notes(p_from date, p_to date) returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'date', n.date,
    'repeat_rule', n.repeat_rule, 'done', coalesce(n.done, false), 'entry_id', n.entry_id)
    order by n.date, n.title, n.id), '[]'::jsonb)
  from public.notes n
  where (n.repeat_rule is null and n.date between p_from and p_to) or (n.repeat_rule is not null and n.date <= p_to)
$$;

create function public.calendar_month(p_month text, p_today date, p_filters jsonb default '{}') returns jsonb
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
          'entry_id', r.entry_id, 'created_at', r.created_at) order by r.date desc, r.created_at desc, r.id desc)
        from ranked r
        left join public.accounts a on a.id = r.account_id
        left join public.accounts ta on ta.id = r.to_account_id
        left join public.categories c on c.id = r.category_id
        where r.rn <= 25), '[]'::jsonb),
      'notes', public._calendar_notes(v_start, v_end))
  );
end $$;

-- Dated items for any window of up to 120 days (the Agenda loads 30-day windows as you scroll).
create function public.calendar_agenda(p_from date, p_to date, p_today date) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if p_from is null or p_to is null or p_today is null then raise exception 'dates are required' using errcode = '22023'; end if;
  if p_to < p_from then raise exception 'the window ends before it starts' using errcode = '22023'; end if;
  if p_to - p_from > 120 then raise exception 'the window is too long' using errcode = '22023'; end if;
  return jsonb_build_object('from', p_from, 'to', p_to, 'items', public._calendar_items(p_from, p_to), 'notes', public._calendar_notes(p_from, p_to));
end $$;

do $$
declare f text;
begin
  foreach f in array array['_calendar_items(date,date)', '_calendar_notes(date,date)', 'calendar_month(text,date,jsonb)', 'calendar_agenda(date,date,date)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
