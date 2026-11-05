-- Phase 3: one-call dashboard summary. Built on filter_transactions so RLS and filter semantics match Activity exactly.

-- p_month 'yyyy-MM' · p_today 'yyyy-MM-dd' (client "today", never now()) · p_filters as for activity_summary
-- (any from/to in p_filters is replaced by the month window). Spending is personal spend: amount - for_other.
create function public.dashboard_summary(p_month text, p_today date, p_filters jsonb default '{}')
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_start date;
  v_end date;
  v_prev_start date;
  v_prev_end date;
  v_days int;
  v_elapsed int;
  v_base jsonb := coalesce(p_filters, '{}'::jsonb) - 'from' - 'to';
  v_cur jsonb;
  v_prev jsonb;
begin
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid month %', p_month using errcode = '22023';
  end if;
  if p_today is null then
    raise exception 'p_today is required' using errcode = '22023';
  end if;

  v_start := (p_month || '-01')::date;
  v_end := (v_start + interval '1 month' - interval '1 day')::date;
  v_prev_start := (v_start - interval '1 month')::date;
  v_prev_end := v_start - 1;
  v_days := v_end - v_start + 1;
  v_elapsed := case when p_today < v_start then 0 when p_today > v_end then v_days else p_today - v_start + 1 end;
  v_cur := v_base || jsonb_build_object('from', v_start, 'to', v_end);
  v_prev := v_base || jsonb_build_object('from', v_prev_start, 'to', v_prev_end);

  return (
    with cur as (
      select t.id, t.kind, t.date, t.account_id, t.category_id, t.place,
             case when t.kind = 'expense' then t.amount_paise - t.for_other_paise else t.amount_paise end as amt
      from public.filter_transactions(v_cur) t where t.kind in ('expense', 'income')
    ),
    prev as (
      select t.kind, case when t.kind = 'expense' then t.amount_paise - t.for_other_paise else t.amount_paise end as amt
      from public.filter_transactions(v_prev) t where t.kind in ('expense', 'income')
    ),
    tot as (
      select coalesce(sum(amt) filter (where kind = 'expense'), 0)::bigint as spent,
             coalesce(sum(amt) filter (where kind = 'income'), 0)::bigint as received,
             count(*)::int as n
      from cur
    ),
    ptot as (
      select coalesce(sum(amt) filter (where kind = 'expense'), 0)::bigint as spent,
             coalesce(sum(amt) filter (where kind = 'income'), 0)::bigint as received
      from prev
    ),
    days as (
      select d::date as date,
             coalesce(sum(c.amt) filter (where c.kind = 'expense'), 0)::bigint as spent,
             coalesce(sum(c.amt) filter (where c.kind = 'income'), 0)::bigint as received
      from generate_series(v_start, v_end, interval '1 day') d
      left join cur c on c.date = d::date
      group by d
    ),
    cat as (
      select c.category_id as id, coalesce(k.name, 'Uncategorised') as name, k.icon, k.color,
             sum(c.amt)::bigint as spent, count(*)::int as count
      from cur c left join public.categories k on k.id = c.category_id
      where c.kind = 'expense' group by c.category_id, k.name, k.icon, k.color
    ),
    acc as (
      select c.account_id as id, a.name, sum(c.amt)::bigint as spent, count(*)::int as count
      from cur c join public.accounts a on a.id = c.account_id
      where c.kind = 'expense' group by c.account_id, a.name
    ),
    plc as (
      select coalesce(min(nullif(trim(c.place), '')), 'No place') as name, lower(coalesce(nullif(trim(c.place), ''), '')) as key,
             sum(c.amt)::bigint as spent, count(*)::int as count
      from cur c where c.kind = 'expense' group by lower(coalesce(nullif(trim(c.place), ''), ''))
    )
    select jsonb_build_object(
      'month', jsonb_build_object(
        'month', p_month, 'start', v_start, 'end', v_end,
        'spent', (select spent from tot), 'received', (select received from tot),
        'saved', (select received - spent from tot),
        'prev_spent', (select spent from ptot), 'prev_received', (select received from ptot),
        'days_in_month', v_days, 'days_elapsed', v_elapsed,
        'avg_daily_spent', case when v_elapsed > 0 then (select round(spent::numeric / v_elapsed)::bigint from tot) end,
        'projected_spent', case when p_today between v_start and v_end and v_elapsed >= 3
                                then (select round(spent::numeric / v_elapsed * v_days)::bigint from tot) end,
        'count', (select n from tot)),
      'daily', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'spent', spent, 'received', received) order by date) from days), '[]'),
      'by_category', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'icon', icon, 'color', color,
                        'spent', spent, 'count', count) order by spent desc, name) from cat), '[]'),
      'by_account', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'spent', spent, 'count', count)
                        order by spent desc, name) from acc), '[]'),
      'by_place', coalesce((select jsonb_agg(jsonb_build_object('id', null, 'name', name, 'spent', spent, 'count', count)
                        order by spent desc, name) from plc), '[]'),
      'recent', coalesce((select jsonb_agg(to_jsonb(r)) from public.search_transactions(v_cur, 5, null) r), '[]'),
      'accounts', coalesce((select jsonb_agg(jsonb_build_object('id', b.account_id, 'name', b.name, 'type', b.type,
                        'balance_paise', b.balance_paise, 'outstanding_paise', b.outstanding_paise,
                        'credit_limit_paise', b.credit_limit_paise, 'statement_day', b.statement_day, 'due_day', b.due_day)
                        order by b.sort, b.name) from public.account_balances b where not b.archived), '[]'),
      'generated_at', now()
    )
  );
end $$;

revoke all on function public.dashboard_summary(text, date, jsonb) from public, anon;
grant execute on function public.dashboard_summary(text, date, jsonb) to authenticated;
