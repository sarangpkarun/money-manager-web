-- Phase 2: first-run Cash account, balances view, search/summary/suggestion RPCs, quick add.

-- ---------------------------------------------------------------- first-run account
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));

  insert into public.accounts (user_id, name, type, sort) values (new.id, 'Cash', 'cash', 0);

  insert into public.categories (user_id, name, kind, sort)
  select new.id, n, 'expense', i from unnest(array['Food','Groceries','Travel','Fuel','Bills','Rent','Shopping',
    'Health','Entertainment','Education','Gifts','Other']) with ordinality as t(n, i);

  insert into public.categories (user_id, name, kind, sort)
  select new.id, n, 'income', i from unnest(array['Salary','Business','Interest','Gift','Other']) with ordinality as t(n, i);

  return new;
end $$;

-- existing users with no account get a Cash account
insert into public.accounts (user_id, name, type, sort)
select u.id, 'Cash', 'cash', 0 from auth.users u
where not exists (select 1 from public.accounts a where a.user_id = u.id);

-- ---------------------------------------------------------------- housekeeping
create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

create extension if not exists pg_trgm with schema extensions;
create index transactions_search_trgm on public.transactions using gin
  ((coalesce(title, '') || ' ' || coalesce(place, '') || ' ' || coalesce(notes, '')) extensions.gin_trgm_ops);
create index transactions_title_idx on public.transactions (user_id, lower(title));

-- ---------------------------------------------------------------- balances
-- balance = opening + income/debt_in + transfers in - expense/debt_out/transfers out (security_invoker: RLS applies)
create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id, a.user_id, a.name, a.type, a.archived, a.sort,
  a.credit_limit_paise, a.statement_day, a.due_day,
  (a.opening_balance_paise + coalesce(sum(
    case
      when t.account_id = a.id and t.kind in ('income', 'debt_in') then t.amount_paise
      when t.account_id = a.id and t.kind in ('expense', 'debt_out', 'transfer') then -t.amount_paise
      when t.to_account_id = a.id and t.kind = 'transfer' then t.amount_paise
      else 0
    end), 0))::bigint as balance_paise,
  case when a.type = 'credit_card' then greatest(-(a.opening_balance_paise + coalesce(sum(
    case
      when t.account_id = a.id and t.kind in ('income', 'debt_in') then t.amount_paise
      when t.account_id = a.id and t.kind in ('expense', 'debt_out', 'transfer') then -t.amount_paise
      when t.to_account_id = a.id and t.kind = 'transfer' then t.amount_paise
      else 0
    end), 0)), 0)::bigint end as outstanding_paise
from public.accounts a
left join public.transactions t on t.account_id = a.id or t.to_account_id = a.id
group by a.id;
revoke all on public.account_balances from anon;
grant select on public.account_balances to authenticated;

-- ---------------------------------------------------------------- filtering (shared by search and summary)
-- p_filters keys: from, to (date) · kinds (txn_kind[]) · accounts, categories (uuid[]) · min, max (paise)
--                 q (text over title/place/notes/tags/account/category) · place (text) · tag (text)
create function public.filter_transactions(p_filters jsonb) returns setof public.transactions
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
    and (p_filters->>'tag' is null or (p_filters->>'tag') = any (t.tags))
    and (p_filters->>'q' is null or
         (coalesce(t.title, '') || ' ' || coalesce(t.place, '') || ' ' || coalesce(t.notes, '')) ilike '%' || (p_filters->>'q') || '%'
         or exists (select 1 from unnest(t.tags) g where g ilike '%' || (p_filters->>'q') || '%')
         or exists (select 1 from public.accounts a where a.id in (t.account_id, t.to_account_id) and a.name ilike '%' || (p_filters->>'q') || '%')
         or exists (select 1 from public.categories c where c.id = t.category_id and c.name ilike '%' || (p_filters->>'q') || '%'))
$$;

-- ---------------------------------------------------------------- search (keyset pagination)
-- p_cursor = {"date": "...", "created_at": "...", "id": "..."} of the last row seen.
create function public.search_transactions(p_filters jsonb default '{}', p_limit int default 50, p_cursor jsonb default null)
returns table (
  id uuid, kind public.txn_kind, amount_paise bigint, date date, account_id uuid, account_name text,
  to_account_id uuid, to_account_name text, category_id uuid, category_name text, category_icon text,
  category_color text, title text, place text, notes text, tags text[], for_other_paise bigint,
  entry_id uuid, created_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  select t.id, t.kind, t.amount_paise, t.date, t.account_id, a.name, t.to_account_id, ta.name,
         t.category_id, c.name, c.icon, c.color, t.title, t.place, t.notes, t.tags, t.for_other_paise,
         t.entry_id, t.created_at
  from public.filter_transactions(coalesce(p_filters, '{}'::jsonb)) t
  left join public.accounts a on a.id = t.account_id
  left join public.accounts ta on ta.id = t.to_account_id
  left join public.categories c on c.id = t.category_id
  where p_cursor is null
     or (t.date, t.created_at, t.id) < ((p_cursor->>'date')::date, (p_cursor->>'created_at')::timestamptz, (p_cursor->>'id')::uuid)
  order by t.date desc, t.created_at desc, t.id desc
  limit least(greatest(p_limit, 1), 200)
$$;

-- ---------------------------------------------------------------- summary
-- spent = personal spend: amount minus the part paid for others. Transfers and debts are not spending.
create function public.activity_summary(p_filters jsonb default '{}') returns jsonb
language sql stable security invoker set search_path = public as $$
  with f as (select * from public.filter_transactions(coalesce(p_filters, '{}'::jsonb))),
  per as (
    select account_id,
           coalesce(sum(amount_paise - for_other_paise) filter (where kind = 'expense'), 0)::bigint as spent,
           coalesce(sum(amount_paise) filter (where kind = 'income'), 0)::bigint as received
    from f where kind in ('expense', 'income') group by account_id
  )
  select jsonb_build_object(
    'spent', coalesce((select sum(spent) from per), 0),
    'received', coalesce((select sum(received) from per), 0),
    'net', coalesce((select sum(received - spent) from per), 0),
    'by_account', coalesce((select jsonb_agg(jsonb_build_object('account_id', p.account_id, 'name', a.name,
                    'spent', p.spent, 'received', p.received) order by a.sort, a.name)
                  from per p join public.accounts a on a.id = p.account_id), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------- title suggestions
create function public.title_suggestions(p_prefix text, p_limit int default 5)
returns table (title text, category_id uuid, account_id uuid, place text, last_date date, uses bigint)
language sql stable security invoker set search_path = public as $$
  select s.title, s.category_id, s.account_id, s.place, s.last_date, s.uses from (
    select distinct on (lower(t.title)) t.title, t.category_id, t.account_id, t.place, t.date as last_date,
           count(*) over (partition by lower(t.title)) as uses
    from public.transactions t
    where t.kind in ('expense', 'income') and t.title is not null and length(trim(p_prefix)) > 0
      and t.title ilike replace(replace(replace(trim(p_prefix), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by lower(t.title), t.date desc, t.created_at desc
  ) s
  order by s.uses desc, s.last_date desc
  limit least(greatest(p_limit, 1), 20)
$$;

-- ---------------------------------------------------------------- quick add (idempotent on the client-supplied id)
create function public.quick_add_transaction(
  p_id uuid, p_kind public.txn_kind, p_amount bigint, p_date date, p_account uuid,
  p_to_account uuid default null, p_category uuid default null, p_title text default null,
  p_place text default null, p_notes text default null, p_tags text[] default '{}'
) returns public.transactions
language plpgsql security invoker set search_path = public as $$
declare
  result public.transactions;
  cat_kind text;
begin
  if p_kind not in ('expense', 'income', 'transfer') then
    raise exception 'Unsupported transaction kind: %', p_kind using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;
  if not exists (select 1 from public.accounts where id = p_account) then
    raise exception 'Account not found' using errcode = '22023';
  end if;

  if p_kind = 'transfer' then
    if p_to_account is null or p_to_account = p_account then
      raise exception 'A transfer needs two different accounts' using errcode = '22023';
    end if;
    if not exists (select 1 from public.accounts where id = p_to_account) then
      raise exception 'Destination account not found' using errcode = '22023';
    end if;
    p_category := null;
  else
    p_to_account := null;
    if p_category is not null then
      select kind into cat_kind from public.categories where id = p_category;
      if cat_kind is null then raise exception 'Category not found' using errcode = '22023'; end if;
      if cat_kind <> p_kind::text then
        raise exception 'Category kind does not match the transaction' using errcode = '22023';
      end if;
    end if;
  end if;

  insert into public.transactions (id, kind, amount_paise, date, account_id, to_account_id, category_id, title, place, notes, tags)
  values (p_id, p_kind, p_amount, p_date, p_account, p_to_account, p_category, nullif(trim(p_title), ''),
          nullif(trim(p_place), ''), nullif(trim(p_notes), ''), coalesce(p_tags, '{}'))
  on conflict (id) do nothing;

  select * into result from public.transactions where id = p_id;
  if result.id is null then
    raise exception 'Transaction id is already in use' using errcode = '23505';
  end if;
  return result;
end $$;

-- only signed-in users may call these
do $$
declare f text;
begin
  foreach f in array array[
    'filter_transactions(jsonb)', 'search_transactions(jsonb,int,jsonb)', 'activity_summary(jsonb)',
    'title_suggestions(text,int)',
    'quick_add_transaction(uuid,txn_kind,bigint,date,uuid,uuid,uuid,text,text,text,text[])']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
