-- Phase 9: defence in depth on grants. Row level security already hides every row from other users, but it does not govern
-- TRUNCATE, TRIGGER or REFERENCES, and Supabase's defaults hand anon and authenticated all of them. The app never uses them.

-- anon (not signed in) needs nothing in public: every API call that matters is made by a signed-in user
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

-- signed-in users keep select/insert/update/delete (behind RLS) but lose the privileges RLS cannot see
revoke truncate, trigger, references on all tables in schema public from authenticated;

-- trigger functions never need to be callable as API functions
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- the same for everything created later (migrations run as postgres)
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from authenticated;
