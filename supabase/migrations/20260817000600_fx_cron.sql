-- Schedule sync-fx-rates every 6 hours.
--
-- One-time setup before this does anything (run once, in the SQL editor):
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service-role-key>', 'service_role_key');
--
-- The service role key lives in Vault, never in a migration and never in the
-- client bundle. If the secrets are absent the scheduled job simply fails and
-- the last good cached rates keep being served, which is the intended
-- degradation.

-- Guarded, for the same reason the scheduling below is. An unguarded
-- `create extension` aborts the entire script when the database cannot host
-- it — pg_cron in particular refuses to install anywhere but the database
-- named in cron.database_name. Applying this file top to bottom would then
-- stop here, leaving every later migration unapplied: no create_trip RPC, no
-- usernames, no categories. A missing scheduler costs periodic FX refreshes;
-- a half-applied schema costs the app.
do $$
begin
  execute 'create extension if not exists pg_cron with schema extensions';
  execute 'create extension if not exists pg_net with schema extensions';
exception
  when others then
    raise notice 'FX cron extensions unavailable: %. Rates will sync on demand from the client instead.', sqlerrm;
end;
$$;

do $$
begin
  -- Re-running this migration should not stack duplicate jobs.
  perform cron.unschedule('sync-fx-rates-6h');
exception
  when others then null;
end;
$$;

do $$
begin
  perform cron.schedule(
    'sync-fx-rates-6h',
    '0 */6 * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
             || '/functions/v1/sync-fx-rates?force=true',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' ||
          (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb
    );
    $job$
  );
exception
  when others then
    -- pg_cron unavailable (e.g. a local stack without it). Not fatal: the
    -- client still triggers an on-demand sync when the cache goes stale.
    raise notice 'Could not schedule sync-fx-rates: %. Schedule it from the dashboard instead.', sqlerrm;
end;
$$;
