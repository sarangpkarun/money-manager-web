-- Money Manager v2: schema, RLS, verified-email gate.

create type account_type  as enum ('cash','bank','upi','credit_card','wallet');
create type txn_kind      as enum ('expense','income','transfer','debt_out','debt_in');
create type entry_kind    as enum ('lent','on_behalf','borrowed','emi_purchase','instalment');
create type entry_dir     as enum ('receive','pay');
create type entry_status  as enum ('open','settled','cancelled');
create type interest_type as enum ('none','flat','simple','reducing');
create type pay_mode      as enum ('cash','upi','bank','card','other');

-- Email-verified gate used by every policy (cached per statement via initplan).
create function public.is_verified() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
$$;
revoke all on function public.is_verified() from public, anon;
grant execute on function public.is_verified() to authenticated;

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text, currency text default 'INR', timezone text default 'Asia/Kolkata',
  number_format text default 'indian',
  date_format text default 'dd MMM yyyy',
  theme text default 'system',
  week_starts_on smallint default 1,
  alarm_time time default '09:00',
  quiet_from time, quiet_until time,
  summary_mode text default 'off',
  summary_time time default '08:00', summary_weekday smallint,
  dashboard_layout jsonb,
  created_at timestamptz default now()
);

create table accounts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, type account_type not null,
  opening_balance_paise bigint not null default 0,
  credit_limit_paise bigint,
  statement_day smallint, due_day smallint,
  color text, sort int default 0, archived boolean default false
);

create table categories (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, icon text, color text,
  kind text not null check (kind in ('expense','income')),
  sort int default 0, archived boolean default false
);

create table people (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, phone text, email text, notes text, archived boolean default false
);

create table transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind txn_kind not null,
  amount_paise bigint not null check (amount_paise > 0),
  date date not null,
  account_id uuid references accounts,
  to_account_id uuid references accounts,
  category_id uuid references categories,
  title text, place text, notes text, tags text[] default '{}',
  for_other_paise bigint not null default 0 check (for_other_paise >= 0 and for_other_paise <= amount_paise),
  entry_id uuid,
  payment_id uuid,
  receipt_path text,
  recurring_id uuid,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index on transactions (user_id, date desc);
create index on transactions (user_id, account_id, date);
create index on transactions (user_id, category_id, date);

create table entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind entry_kind not null, direction entry_dir not null,
  person_id uuid references people,
  party_name text,
  title text not null,
  principal_paise bigint not null check (principal_paise > 0),
  start_date date not null,
  due_date date,
  interest interest_type not null default 'none',
  rate_bps int default 0,
  no_cost boolean default false,
  down_payment_paise bigint default 0,
  total_payable_paise bigint not null,
  status entry_status not null default 'open',
  settled_on date,
  source_txn_id uuid references transactions,
  remind boolean not null default true,
  notes text, created_at timestamptz default now()
);
alter table transactions add constraint fk_txn_entry foreign key (entry_id) references entries;

create table schedule_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  entry_id uuid not null references entries on delete cascade,
  seq int not null, due_date date not null,
  due_paise bigint not null, principal_paise bigint not null default 0, interest_paise bigint not null default 0,
  paid_paise bigint not null default 0,
  paid_on date,
  unique (entry_id, seq)
);
create index on schedule_items (user_id, due_date);

create table payments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  entry_id uuid not null references entries on delete cascade,
  schedule_item_id uuid references schedule_items on delete set null,
  amount_paise bigint not null check (amount_paise > 0),
  paid_on date not null,
  account_id uuid references accounts, mode pay_mode, note text,
  created_at timestamptz default now()
);
create index on payments (user_id, paid_on);

create table notes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('note','task')),
  title text not null, body text,
  date date not null, remind_at timestamptz,
  repeat_rule text,
  done boolean default false, entry_id uuid references entries
);

create table budgets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  category_id uuid references categories,
  limit_paise bigint not null, unique (user_id, category_id)
);
create table recurring (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  template jsonb not null, rule text not null, next_date date not null, active boolean default true
);
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text unique not null, keys jsonb not null, created_at timestamptz default now()
);

-- ROW LEVEL SECURITY: every table, same migration.
alter table profiles enable row level security;
create policy own_profile on profiles for all to authenticated
  using (id = (select auth.uid()) and (select public.is_verified()))
  with check (id = (select auth.uid()) and (select public.is_verified()));

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','people','transactions','entries','schedule_items',
                           'payments','notes','budgets','recurring','push_subscriptions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy own_rows on %I for all to authenticated
      using (user_id = (select auth.uid()) and (select public.is_verified()))
      with check (user_id = (select auth.uid()) and (select public.is_verified()))$p$, t);
  end loop;
end $$;

-- Restrictive policies: a row may only reference parents the user owns (the subselect is itself RLS-filtered).
create policy parents_owned on transactions as restrictive for all to authenticated using (true) with check (
  (account_id is null or exists (select 1 from accounts a where a.id = account_id)) and
  (to_account_id is null or exists (select 1 from accounts a where a.id = to_account_id)) and
  (category_id is null or exists (select 1 from categories c where c.id = category_id)) and
  (entry_id is null or exists (select 1 from entries e where e.id = entry_id)));
create policy parents_owned on entries as restrictive for all to authenticated using (true) with check (
  (person_id is null or exists (select 1 from people p where p.id = person_id)) and
  (source_txn_id is null or exists (select 1 from transactions t where t.id = source_txn_id)));
create policy parents_owned on schedule_items as restrictive for all to authenticated using (true) with check (
  exists (select 1 from entries e where e.id = entry_id));
create policy parents_owned on payments as restrictive for all to authenticated using (true) with check (
  exists (select 1 from entries e where e.id = entry_id) and
  (schedule_item_id is null or exists (select 1 from schedule_items s where s.id = schedule_item_id)) and
  (account_id is null or exists (select 1 from accounts a where a.id = account_id)));
create policy parents_owned on notes as restrictive for all to authenticated using (true) with check (
  entry_id is null or exists (select 1 from entries e where e.id = entry_id));
create policy parents_owned on budgets as restrictive for all to authenticated using (true) with check (
  category_id is null or exists (select 1 from categories c where c.id = category_id));
