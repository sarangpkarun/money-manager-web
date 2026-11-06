-- Data health report. Read-only: paste into the Supabase SQL editor (or run `node scripts/health.mjs` locally).
-- "problem" rows must all say 0. "info" rows are for you to eyeball during dogfooding.
-- To look at one user only, put their id in the first line of the query instead of null, like: select 'their-user-id'::uuid as uid
with scope as (select null::uuid as uid),
checks as (
  select 'problem' as kind, 'expenses, income or transfers with no account' as check_name, count(*) as n
  from public.transactions t where t.kind in ('expense', 'income', 'transfer') and t.account_id is null
    and ((select uid from scope) is null or t.user_id = (select uid from scope))
  union all
  select 'problem', 'transfers from an account to itself', count(*)
  from public.transactions t where t.kind = 'transfer' and t.account_id = t.to_account_id
    and ((select uid from scope) is null or t.user_id = (select uid from scope))
  union all
  select 'problem', 'instalment rows paid more than they are due', count(*)
  from public.schedule_items s where s.paid_paise > s.due_paise
    and ((select uid from scope) is null or s.user_id = (select uid from scope))
  union all
  select 'problem', 'entries whose rows do not add up to the total payable', count(*)
  from public.entries e
  where e.status <> 'cancelled'
    and e.total_payable_paise <> (select coalesce(sum(s.due_paise), 0) from public.schedule_items s where s.entry_id = e.id)
    and ((select uid from scope) is null or e.user_id = (select uid from scope))
  union all
  select 'problem', 'settled entries that still have an unpaid row', count(*)
  from public.entries e
  where e.status = 'settled' and exists (select 1 from public.schedule_items s where s.entry_id = e.id and s.paid_paise < s.due_paise)
    and ((select uid from scope) is null or e.user_id = (select uid from scope))
  union all
  select 'problem', 'open entries where every row is already paid', count(*)
  from public.entries e
  where e.status = 'open' and exists (select 1 from public.schedule_items s where s.entry_id = e.id)
    and not exists (select 1 from public.schedule_items s where s.entry_id = e.id and s.paid_paise < s.due_paise)
    and ((select uid from scope) is null or e.user_id = (select uid from scope))
  union all
  select 'problem', 'entries whose recorded payments differ from what the rows say was paid', count(*)
  from public.entries e
  where e.status <> 'cancelled'
    and (select coalesce(sum(p.amount_paise), 0) from public.payments p where p.entry_id = e.id)
        <> (select coalesce(sum(s.paid_paise), 0) from public.schedule_items s where s.entry_id = e.id)
    and ((select uid from scope) is null or e.user_id = (select uid from scope))
  union all
  select 'problem', 'purchases paid for friends whose "for others" amount differs from the friends'' entries', count(*)
  from public.transactions t
  where t.for_other_paise <> coalesce((select sum(e.principal_paise) from public.entries e where e.source_txn_id = t.id and e.kind = 'on_behalf' and e.status <> 'cancelled'), 0)
    and ((select uid from scope) is null or t.user_id = (select uid from scope))
  union all
  select 'problem', 'rows owned by someone other than their parent''s owner (transactions to accounts)', count(*)
  from public.transactions t join public.accounts a on a.id = t.account_id
  where a.user_id <> t.user_id and ((select uid from scope) is null or t.user_id = (select uid from scope))
  union all
  select 'info', 'cash, bank, UPI and wallet accounts below zero', count(*)
  from public.account_balances b where b.type <> 'credit_card' and b.balance_paise < 0
    and ((select uid from scope) is null or b.user_id = (select uid from scope))
  union all
  select 'info', 'reminders sent in the last 7 days', count(*)
  from public.reminder_log r where r.sent_at > now() - interval '7 days'
    and ((select uid from scope) is null or r.user_id = (select uid from scope))
  union all
  select 'info', 'reminders claimed but never confirmed (older than 1 hour)', count(*)
  from public.reminder_log r where r.sent_at is null and r.claimed_at < now() - interval '1 hour'
    and ((select uid from scope) is null or r.user_id = (select uid from scope))
  union all
  select 'info', 'app errors logged in the last 7 days', count(*)
  from public.client_errors c where c.at > now() - interval '7 days'
    and ((select uid from scope) is null or c.user_id = (select uid from scope))
)
select kind, check_name, n,
       case when kind = 'problem' and n > 0 then 'LOOK AT THIS' else 'ok' end as status
from checks
order by (kind = 'problem') desc, check_name;
