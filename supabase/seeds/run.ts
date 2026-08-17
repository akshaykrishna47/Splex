/**
 * Development seed data.
 *
 * This file is NEVER imported by a migration and must NEVER run against
 * production. It creates real auth users and real trips, and `--reset` deletes
 * them again.
 *
 *   npm run seed          populate
 *   npm run seed:reset    delete everything this script created, then populate
 *   npm run seed:clear    delete everything this script created, and stop
 *
 * Requires, in .env.local:
 *   SEED_ENABLED=true
 *   EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (service role — bypasses RLS; never in the app)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { pinExpenseToBase, buildRateTable, resolveRate } from '../../lib/fx';
import { indexCurrencies, splitEqual } from '../../lib/money';
import { computeSplits } from '../../lib/splits';
import type { Currency, FxRate } from '../../lib/types';

loadEnvFile('.env.local');

// ---------------------------------------------------------------------------
// The guard. Do not remove, do not weaken.
// ---------------------------------------------------------------------------

if (process.env.SEED_ENABLED !== 'true') {
  console.error(
    'Refusing to run: SEED_ENABLED is not "true".\n' +
      'This script creates and deletes real rows. Set SEED_ENABLED=true in .env.local\n' +
      'only for a local or development project — never for production.',
  );
  process.exit(1);
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  process.exit(1);
}

if (/\.supabase\.co/.test(SUPABASE_URL) && process.env.SEED_ALLOW_REMOTE !== 'true') {
  console.error(
    `Refusing to seed a hosted project (${SUPABASE_URL}).\n` +
      'If this really is a throwaway development project, set SEED_ALLOW_REMOTE=true.',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  // supabase-js builds a realtime client in its constructor and demands a
  // WebSocket even when, as here, nothing ever subscribes. Node only exposes
  // one globally from v22, so hand it an implementation explicitly rather than
  // making this script depend on the runtime version.
  realtime: { transport: WebSocket as unknown as never },
});

const RESET = process.argv.includes('--reset');
/** Tear down without building back up, for handing over a clean database. */
const CLEAR_ONLY = process.argv.includes('--clear');

// ---------------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------------

const SEED_TAG = '[seed]';

const PEOPLE = [
  { email: 'aditi@splex.test', password: 'splex-dev-password', name: 'Aditi' },
  { email: 'ben@splex.test', password: 'splex-dev-password', name: 'Ben' },
  { email: 'cara@splex.test', password: 'splex-dev-password', name: 'Cara' },
];

/** USD-pivot rates so the app has something to convert with offline. */
const SEED_RATES: [string, string][] = [
  ['SGD', '1.3400000000'],
  ['THB', '32.5000000000'],
  ['MYR', '4.2200000000'],
  ['JPY', '152.0000000000'],
  ['VND', '25400.0000000000'],
  ['IDR', '16200.0000000000'],
  ['EUR', '0.9200000000'],
  ['GBP', '0.7800000000'],
  ['INR', '83.5000000000'],
  ['USD', '1.0000000000'],
];

async function main() {
  if (RESET || CLEAR_ONLY) await reset();

  if (CLEAR_ONLY) {
    console.log('\nCleared. Nothing was re-seeded.');
    return;
  }

  console.log('Seeding FX rates…');
  await seedRates();

  console.log('Seeding users…');
  const users = await seedUsers();

  console.log('Seeding trip…');
  await seedTrip(users);

  console.log('\nDone. Sign in with any of:');
  for (const person of PEOPLE) console.log(`  ${person.email} / ${person.password}`);
}

// ---------------------------------------------------------------------------

/**
 * Removes everything this script created.
 *
 * Ownership is the primary signal, not the name tag. The tag only survives
 * until someone renames the trip in the app, and anything created later while
 * signed in as a seed account never carried it at all — both cases were left
 * behind by matching on the name alone, which fails silently because a query
 * that finds nothing is indistinguishable from one with nothing to find.
 *
 * Real accounts are never touched: only trips belonging to the fixed cast
 * below are in scope.
 */
async function reset() {
  console.log('Resetting seeded data…');

  const { data: existing } = await supabase.auth.admin.listUsers();
  const seedUsers = (existing?.users ?? []).filter((u) =>
    PEOPLE.some((p) => p.email === u.email),
  );
  const seedIds = seedUsers.map((u) => u.id);

  const owned = seedIds.length
    ? ((await supabase.from('trips').select('id, name').in('created_by', seedIds)).data ?? [])
    : [];
  const tagged =
    (await supabase.from('trips').select('id, name').like('name', `${SEED_TAG}%`)).data ?? [];

  const trips = [...owned, ...tagged].filter(
    (trip, i, all) => all.findIndex((t) => t.id === trip.id) === i,
  );

  for (const trip of trips) {
    console.log(`  trip: ${trip.name}`);
    // Expenses and members cascade from the trip; settlements too.
    await supabase.from('settlements').delete().eq('trip_id', trip.id);
    await supabase.from('trips').delete().eq('id', trip.id);
  }

  for (const user of seedUsers) {
    console.log(`  account: ${user.email}`);
    await supabase.auth.admin.deleteUser(user.id);
  }

  const { count } = await supabase
    .from('fx_rates')
    .delete({ count: 'exact' })
    .eq('source', 'seed');
  console.log(`  fx rates: ${count ?? 0}`);
}

async function seedRates() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = SEED_RATES.map(([quote, rate]) => ({
    base_currency: 'USD',
    quote_currency: quote,
    rate,
    rate_date: today,
    source: 'seed',
    fetched_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('fx_rates')
    .upsert(rows, { onConflict: 'base_currency,quote_currency,rate_date' });

  if (error) throw error;
}

async function seedUsers() {
  const ids: Record<string, string> = {};

  const { data: existing } = await supabase.auth.admin.listUsers();

  for (const person of PEOPLE) {
    const found = existing?.users.find((u) => u.email === person.email);

    if (found) {
      ids[person.email] = found.id;
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: true,
      user_metadata: { display_name: person.name },
    });

    if (error) throw error;
    ids[person.email] = data.user.id;
  }

  return ids;
}

async function seedTrip(users: Record<string, string>) {
  const aditi = users['aditi@splex.test'] as string;
  const ben = users['ben@splex.test'] as string;
  const cara = users['cara@splex.test'] as string;

  const currencies = indexCurrencies(await fetchCurrencies());
  const rates = buildRateTable(await fetchRates());

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .insert({
      name: `${SEED_TAG} Bangkok, March`,
      base_currency: 'SGD',
      created_by: aditi,
    })
    .select('*')
    .single();

  if (tripError) throw tripError;

  // The owner member row is created by a trigger; add the rest.
  const { data: benMember } = await supabase
    .from('trip_members')
    .insert({ trip_id: trip.id, user_id: ben, display_name: 'Ben', role: 'member' })
    .select('*')
    .single();

  const { data: caraMember } = await supabase
    .from('trip_members')
    .insert({ trip_id: trip.id, user_id: cara, display_name: 'Cara', role: 'member' })
    .select('*')
    .single();

  // A bare-name member with no account — the case the schema exists for.
  const { data: devMember } = await supabase
    .from('trip_members')
    .insert({ trip_id: trip.id, display_name: 'Dev (no account)', role: 'member' })
    .select('*')
    .single();

  const { data: members } = await supabase
    .from('trip_members')
    .select('*')
    .eq('trip_id', trip.id)
    .order('id');

  const all = (members ?? []).map((m) => m.id as string);
  const aditiMember = (members ?? []).find((m) => m.user_id === aditi)?.id as string;

  const expenses: {
    title: string;
    amount: string;
    currency: string;
    category: string;
    paidBy: string;
    date: string;
    splitAcross: string[];
  }[] = [
    {
      title: 'Dinner at the night market',
      amount: '1200',
      currency: 'THB',
      category: 'food',
      paidBy: aditiMember,
      date: daysAgo(2),
      splitAcross: all,
    },
    {
      title: 'Grab to the hotel',
      amount: '340',
      currency: 'THB',
      category: 'transport',
      paidBy: benMember?.id as string,
      date: daysAgo(2),
      splitAcross: all,
    },
    {
      title: 'Two nights, riverside',
      amount: '480.00',
      currency: 'SGD',
      category: 'lodging',
      paidBy: aditiMember,
      date: daysAgo(2),
      splitAcross: all,
    },
    {
      title: 'Temple tour',
      amount: '2400',
      currency: 'THB',
      category: 'activities',
      paidBy: caraMember?.id as string,
      date: daysAgo(1),
      splitAcross: [aditiMember, caraMember?.id as string],
    },
    {
      title: 'Airport lounge, Tokyo layover',
      amount: '5500',
      currency: 'JPY',
      category: 'food',
      paidBy: benMember?.id as string,
      date: daysAgo(0),
      splitAcross: all,
    },
  ];

  for (const expense of expenses) {
    const digits = currencies[expense.currency]?.decimal_digits ?? 2;
    const amountMinor = parseSeedAmount(expense.amount, digits);

    const split = computeSplits({
      mode: 'equal',
      totalMinor: amountMinor,
      decimalDigits: digits,
      entries: all.map((id) => ({ memberId: id, included: expense.splitAcross.includes(id) })),
    });

    if (!split.ok) throw new Error(`seed split failed: ${split.error}`);

    const rate = resolveRate(expense.currency, 'SGD', rates);
    if (!rate) throw new Error(`no seeded rate for ${expense.currency} -> SGD`);

    const pinned = pinExpenseToBase({
      amountMinor,
      shareMinor: split.shares.map((s) => s.shareCents),
      currency: expense.currency,
      baseCurrency: 'SGD',
      currencies,
      rate,
    });

    const { error } = await supabase.rpc('create_expense', {
      p_trip_id: trip.id,
      p_title: expense.title,
      p_amount_cents: amountMinor,
      p_currency: expense.currency,
      p_base_amount_cents: pinned.baseAmountCents,
      p_fx_rate: pinned.fxRate,
      p_fx_rate_date: pinned.fxRateDate,
      p_fx_source: pinned.fxSource,
      p_category: expense.category,
      p_paid_by: expense.paidBy,
      p_expense_date: expense.date,
      p_splits: split.shares.map((share, i) => ({
        member_id: share.memberId,
        share_cents: share.shareCents,
        base_share_cents: pinned.baseShareCents[i],
        share_type: 'equal',
        share_value: null,
      })),
      p_notes: null,
      p_receipt_url: null,
      // service_role has no JWT user context, so auth.uid() is null here.
      p_created_by: aditi,
    });

    if (error) throw new Error(`seed expense "${expense.title}" failed: ${error.message}`);
  }

  // One payment already made, so the balances screen has history.
  await supabase.from('settlements').insert({
    trip_id: trip.id,
    from_member: benMember?.id,
    to_member: aditiMember,
    amount_cents: 2000,
    note: 'Cash at the airport',
    created_by: ben,
  });

  console.log(`  trip ${trip.name} (invite code ${trip.invite_code})`);
  console.log(`  ${all.length} members, ${expenses.length} expenses, 1 settlement`);
  if (devMember) console.log(`  including a bare-name member: ${devMember.display_name}`);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function fetchCurrencies(): Promise<Currency[]> {
  const { data, error } = await supabase.from('currencies').select('*');
  if (error) throw error;
  if (!data?.length) {
    throw new Error('currencies table is empty — run the migrations before seeding.');
  }
  return data as Currency[];
}

async function fetchRates(): Promise<FxRate[]> {
  const { data, error } = await supabase.from('fx_rates').select('*');
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, rate: String(row.rate) })) as FxRate[];
}

/** Seed amounts are authored as clean strings; no float parsing here either. */
function parseSeedAmount(input: string, digits: number): number {
  const [whole = '0', fraction = ''] = input.split('.');
  return Number(BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0') || '0'));
}

function daysAgo(n: number): string {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date.toISOString().slice(0, 10);
}

function loadEnvFile(relativePath: string): void {
  try {
    const contents = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
    for (const line of contents.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match as unknown as [string, string, string];
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  } catch {
    // No .env.local; rely on the ambient environment.
  }
}

main().catch((error) => {
  console.error('\nSeed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
