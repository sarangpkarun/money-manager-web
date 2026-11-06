-- Phase 8: facts for the Home "Insights" card.
-- Only aggregates are computed here; the rules that turn them into sentences live in TypeScript (src/features/insights/rules.ts).
-- Personal spend is amount - for_other_paise (Q6: money spent for friends is not your spend). Read-only, RLS applies (security invoker).

create function public.insight_facts(p_today date) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_start date;
  v_end date;
  v_prev_start date;
  v_elapsed int;
  v_prev_days int;
  v_prev_to date;
  v_year_start date;
begin
  if p_today is null then raise exception 'p_today is required' using errcode = '22023'; end if;
  v_start := date_trunc('month', p_today)::date;
  v_end := (v_start + interval '1 month' - interval '1 day')::date;
  v_prev_start := (v_start - interval '1 month')::date;
  v_elapsed := p_today - v_start + 1;
  v_prev_days := v_start - v_prev_start;
  -- same stretch of last month (1st to the same day number, clamped to its length), so a half month is compared with a half month
  v_prev_to := v_prev_start + least(v_elapsed, v_prev_days) - 1;
  v_year_start := date_trunc('year', p_today)::date;

  return (
    with spend as (
      select t.id, t.date, t.account_id, t.category_id, t.title, (t.amount_paise - t.for_other_paise) as amt
      from public.transactions t
      where t.kind = 'expense' and t.date >= v_prev_start and t.date <= v_end and t.amount_paise - t.for_other_paise > 0
    ),
    cat as (
      select s.category_id as id, coalesce(k.name, 'Uncategorised') as name,
             coalesce(sum(s.amt) filter (where s.date >= v_start), 0)::bigint as this_paise,
             coalesce(sum(s.amt) filter (where s.date between v_prev_start and v_prev_to), 0)::bigint as prev_to_date_paise
      from spend s left join public.categories k on k.id = s.category_id
      group by s.category_id, k.name
    ),
    rows as (
      select e.id as entry_id, e.person_id, coalesce(p.name, e.party_name, 'Someone') as who, e.kind, e.direction, e.status, e.start_date,
             s.due_date, (s.due_paise - s.paid_paise) as left_paise, s.paid_paise, s.due_paise, s.paid_on
      from public.entries e
      join public.schedule_items s on s.entry_id = e.id
      left join public.people p on p.id = e.person_id
      where e.status <> 'cancelled'
    ),
    late as (
      select coalesce(person_id::text, who) as k, min(who) as who, (array_agg(person_id))[1] as person_id,
             sum(left_paise)::bigint as overdue_paise, (p_today - min(due_date))::int as days_late,
             (array_agg(entry_id order by due_date, entry_id))[1] as entry_id
      from rows
      where status = 'open' and direction = 'receive' and left_paise > 0 and due_date < '9999-12-31' and due_date < p_today
      group by coalesce(person_id::text, who)
    ),
    owed as (
      select coalesce(person_id::text, who) as k, min(who) as who, (array_agg(person_id))[1] as person_id,
             sum(left_paise)::bigint as outstanding_paise
      from rows
      where status = 'open' and direction = 'receive' and left_paise > 0
      group by coalesce(person_id::text, who)
    ),
    aged as (
      select entry_id, min(who) as who, (array_agg(person_id))[1] as person_id, sum(left_paise)::bigint as left_paise,
             (p_today - min(start_date))::int as days
      from rows
      where status = 'open' and kind = 'on_behalf' and left_paise > 0 and start_date <= p_today - 30
      group by entry_id
    ),
    paid as (
      select due_date, paid_on,
             case when paid_on < due_date then 'early' when paid_on > due_date then 'late' else 'on_time' end as timing
      from rows
      where direction = 'pay' and paid_on is not null and paid_paise >= due_paise and due_date < '9999-12-31'
        and paid_on >= v_year_start and paid_on <= p_today
    ),
    ordered as (
      select timing, row_number() over (order by paid_on desc, due_date desc) as rn from paid
    ),
    bud as (
      select b.category_id as id, coalesce(k.name, 'Overall') as name, b.limit_paise,
             coalesce((select sum(s.amt) from spend s where s.date >= v_start and (b.category_id is null or s.category_id = b.category_id)), 0)::bigint as spent_paise
      from public.budgets b left join public.categories k on k.id = b.category_id
    ),
    topacc as (
      select a.id, a.name, count(*)::int as n
      from spend s join public.accounts a on a.id = s.account_id
      where s.date >= v_start
      group by a.id, a.name order by n desc, a.name limit 1
    )
    select jsonb_build_object(
      'month', jsonb_build_object(
        'spent_paise', coalesce((select sum(amt) from spend where date >= v_start), 0)::bigint,
        'prev_total_paise', coalesce((select sum(amt) from spend where date < v_start), 0)::bigint,
        'days_elapsed', v_elapsed,
        'days_in_month', v_end - v_start + 1),
      'categories', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'this_paise', this_paise, 'prev_to_date_paise', prev_to_date_paise)
                                               order by this_paise desc, name) from cat where this_paise > 0 or prev_to_date_paise > 0), '[]'),
      'people_overdue', coalesce((select jsonb_agg(jsonb_build_object('person_id', person_id, 'name', who, 'overdue_paise', overdue_paise, 'days_late', days_late, 'entry_id', entry_id)
                                                   order by days_late desc, overdue_paise desc) from (select * from late order by days_late desc, overdue_paise desc limit 5) l), '[]'),
      'largest_outstanding', (select jsonb_build_object('person_id', person_id, 'name', who, 'outstanding_paise', outstanding_paise)
                              from owed order by outstanding_paise desc, who limit 1),
      'cards', coalesce((select jsonb_agg(jsonb_build_object('id', b.account_id, 'name', b.name, 'outstanding_paise', coalesce(b.outstanding_paise, 0),
                                                              'limit_paise', b.credit_limit_paise, 'due_day', b.due_day) order by b.sort, b.name)
                         from public.account_balances b
                         where b.type = 'credit_card' and not coalesce(b.archived, false) and coalesce(b.credit_limit_paise, 0) > 0), '[]'),
      'for_others_aged', coalesce((select jsonb_agg(jsonb_build_object('entry_id', entry_id, 'person_id', person_id, 'name', who, 'left_paise', left_paise, 'days', days)
                                                    order by days desc, left_paise desc) from (select * from aged order by days desc, left_paise desc limit 5) g), '[]'),
      'streak', jsonb_build_object(
        'early_this_year', (select count(*) from paid where timing = 'early')::int,
        'late_this_year', (select count(*) from paid where timing = 'late')::int,
        'early_in_a_row', coalesce((select min(rn) - 1 from ordered where timing <> 'early'), (select count(*) from ordered))::int),
      'budgets', coalesce((select jsonb_agg(jsonb_build_object('category_id', id, 'name', name, 'limit_paise', limit_paise, 'spent_paise', spent_paise)
                                            order by name) from bud), '[]'),
      'largest_spend', (select jsonb_build_object('id', s.id, 'title', s.title, 'amount_paise', s.amt, 'date', s.date,
                                                  'category_id', s.category_id, 'category', k.name)
                        from spend s left join public.categories k on k.id = s.category_id
                        where s.date >= v_start order by s.amt desc, s.date desc, s.id limit 1),
      'top_account', (select jsonb_build_object('id', id, 'name', name, 'count', n) from topacc)
    )
  );
end $$;

revoke all on function public.insight_facts(date) from public, anon;
grant execute on function public.insight_facts(date) to authenticated;
