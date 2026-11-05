-- Local development only (runs on `supabase db reset`, never on the cloud project): do not call the cloud function from the local cron job.
update private.settings set value = 'false' where key = 'enabled';
