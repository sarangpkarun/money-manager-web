-- Phase 7B: a profile can never hold a value the app does not understand.

create function public.is_valid_timezone(p_tz text) returns boolean
language sql stable set search_path = pg_catalog as $$ select exists (select 1 from pg_timezone_names where name = p_tz) $$;

-- bring any odd existing values back to the defaults first, so the constraints always apply cleanly
update public.profiles set number_format = 'indian' where number_format is not null and number_format not in ('indian', 'western');
update public.profiles set date_format = 'dd MMM yyyy' where date_format is not null and date_format not in ('dd MMM yyyy', 'MMM dd, yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd');
update public.profiles set week_starts_on = 1 where week_starts_on is not null and week_starts_on not in (0, 1);
update public.profiles set summary_mode = 'off' where summary_mode is not null and summary_mode not in ('off', 'daily', 'weekly');
update public.profiles set summary_weekday = null where summary_weekday is not null and summary_weekday not between 0 and 6;
update public.profiles set theme = 'system' where theme is not null and theme not in ('system', 'light', 'dark');
update public.profiles set currency = 'INR' where currency is not null and currency <> 'INR';
update public.profiles set timezone = 'Asia/Kolkata' where timezone is not null and not public.is_valid_timezone(timezone);

alter table public.profiles
  add constraint profiles_number_format_ok check (number_format in ('indian', 'western')),
  add constraint profiles_date_format_ok check (date_format in ('dd MMM yyyy', 'MMM dd, yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd')),
  add constraint profiles_week_starts_ok check (week_starts_on in (0, 1)),
  add constraint profiles_summary_mode_ok check (summary_mode in ('off', 'daily', 'weekly')),
  add constraint profiles_summary_weekday_ok check (summary_weekday between 0 and 6),
  add constraint profiles_theme_ok check (theme in ('system', 'light', 'dark')),
  add constraint profiles_currency_ok check (currency = 'INR'),
  add constraint profiles_timezone_ok check (public.is_valid_timezone(timezone)),
  add constraint profiles_name_len_ok check (name is null or char_length(name) <= 60);

revoke all on function public.is_valid_timezone(text) from public, anon;
grant execute on function public.is_valid_timezone(text) to authenticated, service_role;
