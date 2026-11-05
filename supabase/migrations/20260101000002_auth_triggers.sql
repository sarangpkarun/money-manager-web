-- On signup: create profile and seed default categories.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));

  insert into public.categories (user_id, name, kind, sort)
  select new.id, n, 'expense', i from unnest(array['Food','Groceries','Travel','Fuel','Bills','Rent','Shopping',
    'Health','Entertainment','Education','Gifts','Other']) with ordinality as t(n, i);

  insert into public.categories (user_id, name, kind, sort)
  select new.id, n, 'income', i from unnest(array['Salary','Business','Interest','Gift','Other']) with ordinality as t(n, i);

  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
