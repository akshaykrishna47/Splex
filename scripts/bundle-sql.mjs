/**
 * Regenerates supabase/apply-all.sql from supabase/migrations/.
 *
 * The bundle is a convenience for setting up a fresh HOSTED project in one
 * paste, for people who aren't using the Supabase CLI. `supabase/migrations/`
 * remains the source of truth — run this whenever a migration changes, or the
 * bundle silently drifts out of date.
 *
 *   node scripts/bundle-sql.mjs
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = 'supabase/migrations';
const OUTPUT = 'supabase/apply-all.sql';

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.error(`bundle-sql: no .sql files in ${MIGRATIONS}`);
  process.exit(1);
}

const header = `-- ============================================================================
-- Splex — one-shot setup for a FRESH database.
--
-- GENERATED FILE. Do not edit by hand; edit supabase/migrations/ and re-run:
--   node scripts/bundle-sql.mjs
--
-- The migrations below appear in filename order, followed by two setup steps
-- that are not migrations (a public.users backfill and starter FX rates).
--
-- Paste the whole thing into the Supabase SQL editor and run it once.
--
-- NOT idempotent: CREATE TABLE / POLICY / TRIGGER error on a second run. That
-- is deliberate — it fails loudly rather than half-applying. For repeat runs
-- use the CLI: npx supabase db push
-- ============================================================================
`;

const footer = `

-- ############################################################################
-- # POST-MIGRATION SETUP (not part of supabase/migrations/)
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 1. Backfill public.users for accounts that already existed.
--
-- handle_new_user() is an AFTER INSERT trigger on auth.users, so it never fired
-- for any account created before these migrations were applied. Without a
-- public.users row, creating a trip fails the trips.created_by foreign key.
-- ----------------------------------------------------------------------------

insert into public.users (id, email, display_name)
select
  u.id,
  u.email,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    split_part(u.email, '@', 1)
  )
from auth.users u
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Starter FX rates, so foreign-currency expenses can be saved today.
--
-- The app refuses to save an expense it cannot convert rather than inventing a
-- rate, so an empty fx_rates table blocks any expense not in the trip's base
-- currency. These are USD-pivot rows; lib/fx.ts derives every other pair from
-- them arithmetically. Approximate values — deploying sync-fx-rates replaces
-- them with live data on its next run.
-- ----------------------------------------------------------------------------

insert into public.fx_rates (base_currency, quote_currency, rate, rate_date, source)
values
  ('USD', 'USD', '1.0000000000',     current_date, 'manual'),
  ('USD', 'SGD', '1.3400000000',     current_date, 'manual'),
  ('USD', 'THB', '32.5000000000',    current_date, 'manual'),
  ('USD', 'MYR', '4.2200000000',     current_date, 'manual'),
  ('USD', 'JPY', '152.0000000000',   current_date, 'manual'),
  ('USD', 'VND', '25400.0000000000', current_date, 'manual'),
  ('USD', 'IDR', '16200.0000000000', current_date, 'manual'),
  ('USD', 'KHR', '4100.0000000000',  current_date, 'manual'),
  ('USD', 'LAK', '21500.0000000000', current_date, 'manual'),
  ('USD', 'INR', '83.5000000000',    current_date, 'manual'),
  ('USD', 'EUR', '0.9200000000',     current_date, 'manual'),
  ('USD', 'GBP', '0.7800000000',     current_date, 'manual'),
  ('USD', 'AUD', '1.5100000000',     current_date, 'manual'),
  ('USD', 'KRW', '1330.0000000000',  current_date, 'manual'),
  ('USD', 'KWD', '0.3070000000',     current_date, 'manual')
on conflict (base_currency, quote_currency, rate_date) do nothing;

-- ----------------------------------------------------------------------------
-- Sanity check. Expect: currencies 172, users >= 1, fx_rates 15.
-- ----------------------------------------------------------------------------

select
  (select count(*) from public.currencies) as currencies,
  (select count(*) from public.users)      as users,
  (select count(*) from public.fx_rates)   as fx_rates,
  (select count(*) from pg_policies where schemaname = 'public') as rls_policies;
`;

const body = files
  .map((file) => {
    const banner = [
      '',
      '',
      '-- ############################################################################',
      `-- # ${file}`,
      '-- ############################################################################',
      '',
    ].join('\n');
    return banner + readFileSync(join(MIGRATIONS, file), 'utf8');
  })
  .join('\n');

writeFileSync(OUTPUT, header + body + footer, 'utf8');

console.log(`bundle-sql: wrote ${OUTPUT} from ${files.length} migrations`);
for (const file of files) console.log(`  ${file}`);
