/**
 * sync-fx-rates — the only thing in this system that talks to an FX provider.
 *
 * Runs on a 6-hourly cron, and on demand when the newest cached row is more
 * than 12 hours old. The client never calls a provider directly: that keeps us
 * inside free-tier limits regardless of user count, makes rates identical for
 * every member of a trip at a given moment, and means the app still works when
 * the provider is down or the user is offline.
 *
 * Sources, both keyless:
 *   primary   fawazahmed0/currency-api via jsDelivr  (200+ currencies inc. VND/KHR/LAK)
 *   fallback  Frankfurter (api.frankfurter.app)      (ECB daily, ~30 currencies)
 *
 * On total failure it writes nothing and returns 200 with ok:false, so the last
 * good cached rows keep being served rather than the app erroring.
 *
 * Deploy:  supabase functions deploy sync-fx-rates
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const PIVOT = 'USD';

/** Rates are published against USD; cross-rates are derived from that. */
type RateSet = {
  date: string;
  source: string;
  /** quote currency (uppercase) -> units per 1 USD */
  rates: Record<string, number>;
};

const PRIMARY_URLS = [
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
  'https://latest.currency-api.pages.dev/v1/currencies/usd.json',
];

const FALLBACK_URL = 'https://api.frankfurter.app/latest?from=USD';

async function fetchJson(url: string, timeoutMs = 10_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${url} responded ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPrimary(): Promise<RateSet> {
  let lastError: unknown;

  for (const url of PRIMARY_URLS) {
    try {
      const json = (await fetchJson(url)) as { date?: string; usd?: Record<string, number> };
      if (!json?.usd || typeof json.usd !== 'object') {
        throw new Error('unexpected payload shape');
      }

      const rates: Record<string, number> = {};
      for (const [code, value] of Object.entries(json.usd)) {
        // The feed includes crypto and metals with long lowercase keys; ISO
        // 4217 codes are exactly three letters.
        if (code.length !== 3) continue;
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
        rates[code.toUpperCase()] = value;
      }

      if (Object.keys(rates).length < 50) throw new Error('implausibly small rate set');

      return {
        date: json.date ?? new Date().toISOString().slice(0, 10),
        source: 'fawazahmed0/currency-api',
        rates,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('primary source failed');
}

async function fetchFallback(): Promise<RateSet> {
  const json = (await fetchJson(FALLBACK_URL)) as {
    date?: string;
    rates?: Record<string, number>;
  };
  if (!json?.rates) throw new Error('unexpected Frankfurter payload');

  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(json.rates)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      rates[code.toUpperCase()] = value;
    }
  }
  rates[PIVOT] = 1;

  return {
    date: json.date ?? new Date().toISOString().slice(0, 10),
    source: 'frankfurter.app',
    rates,
  };
}

/**
 * The column is numeric(20,10): ten digits of scale leaves ten for the integer
 * part, so anything at or above 1e10 cannot be stored at all.
 */
const MAX_RATE = 1e10;

/** numeric(20,10) — format without scientific notation, which Postgres rejects. */
function toRateString(value: number): string {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`bad rate ${value}`);
  return value.toFixed(10);
}

/** Storable at all? See MAX_RATE. */
function fits(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < MAX_RATE;
}

/**
 * The codes the app actually offers.
 *
 * The feed returns 288 three-letter codes against our 172. The surplus is
 * defunct units (VEB, VEF, TRL) and crypto that happens to be three letters
 * (BTT, NFT) — none of it selectable in the app, so none of it worth storing.
 */
async function supportedCurrencies(
  supabase: ReturnType<typeof createClient>,
): Promise<Set<string>> {
  const { data, error } = await supabase.from('currencies').select('code');
  if (error) throw new Error(`could not read currencies: ${error.message}`);
  return new Set((data ?? []).map((row) => String((row as { code: string }).code)));
}

type RateRow = {
  base_currency: string;
  quote_currency: string;
  rate: string;
  rate_date: string;
  source: string;
  fetched_at: string;
};

Deno.serve(async (req: Request) => {
  const startedAt = new Date().toISOString();

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: 'function is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }

  // Service role: this is the only writer to fx_rates, and RLS blocks
  // everyone else from writing it at all.
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const force = new URL(req.url).searchParams.get('force') === 'true';

  // On-demand path: skip the fetch entirely if the cache is still fresh.
  if (!force) {
    const { data: newest } = await supabase
      .from('fx_rates')
      .select('fetched_at')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (newest?.fetched_at) {
      const ageHours = (Date.now() - new Date(newest.fetched_at).getTime()) / 3_600_000;
      if (ageHours < 12) {
        return json({ ok: true, skipped: true, reason: 'cache is fresh', age_hours: round(ageHours) });
      }
    }
  }

  let rateSet: RateSet;
  let usedFallback = false;

  try {
    rateSet = await fetchPrimary();
  } catch (primaryError) {
    try {
      rateSet = await fetchFallback();
      usedFallback = true;
    } catch (fallbackError) {
      // Both sources are down. Write nothing; the last good rows keep serving.
      return json({
        ok: false,
        wrote: 0,
        served_from_cache: true,
        primary_error: String(primaryError),
        fallback_error: String(fallbackError),
      });
    }
  }

  const fetchedAt = new Date().toISOString();
  const rows: RateRow[] = [];

  // 1. The pivot rows: USD -> every currency the app offers.
  //
  //    Filtered and range-checked, and the range check is the important half.
  //    A single unstorable value fails the whole upsert, so one defunct
  //    currency takes every other rate down with it and the app is left with
  //    nothing — which is exactly what VEB did at 7.7e10 on the first run.
  const supported = await supportedCurrencies(supabase);
  const unstorable: string[] = [];

  for (const [code, value] of Object.entries(rateSet.rates)) {
    if (!supported.has(code)) continue;
    if (!fits(value)) {
      unstorable.push(code);
      continue;
    }

    rows.push({
      base_currency: PIVOT,
      quote_currency: code,
      rate: toRateString(value),
      rate_date: rateSet.date,
      source: rateSet.source,
      fetched_at: fetchedAt,
    });
  }

  // 2. Cross-rates, derived arithmetically rather than fetched.
  //
  //    Storing every pair would be ~40,000 rows per day for no benefit; the
  //    client derives any missing pair from the pivot rows above. So we
  //    materialise only the pairs actually in use: trip base currencies
  //    against the currencies people are really spending in.
  const active = await activeCurrencies(supabase);
  for (const base of active.bases) {
    const baseRate = rateSet.rates[base];
    if (!baseRate) continue;

    for (const quote of active.quotes) {
      if (quote === base) continue;
      const quoteRate = rateSet.rates[quote];
      if (!quoteRate) continue;

      // Same guard as the pivot rows. A cross-rate divides, so it can exceed
      // the column even when both of its inputs fit comfortably.
      const cross = quoteRate / baseRate;
      if (!fits(cross)) {
        unstorable.push(`${base}/${quote}`);
        continue;
      }

      rows.push({
        base_currency: base,
        quote_currency: quote,
        rate: toRateString(cross),
        rate_date: rateSet.date,
        source: rateSet.source,
        fetched_at: fetchedAt,
      });
    }
  }

  // Upsert on the (base, quote, date) unique key so re-running within a day
  // refreshes rather than duplicating.
  let wrote = 0;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('fx_rates')
      .upsert(chunk, { onConflict: 'base_currency,quote_currency,rate_date' });

    if (error) {
      return json({ ok: false, wrote, error: error.message, served_from_cache: true }, 500);
    }
    wrote += chunk.length;
  }

  return json({
    ok: true,
    wrote,
    pivot: PIVOT,
    rate_date: rateSet.date,
    source: rateSet.source,
    used_fallback: usedFallback,
    // Reported rather than swallowed: a currency turning up here means the app
    // silently cannot convert it, which is worth noticing before a user does.
    unstorable: unstorable.length ? unstorable : undefined,
    started_at: startedAt,
  });
});

/**
 * The currencies worth materialising cross-rates for: every trip's base
 * currency, and every currency anyone has actually spent in or chosen to
 * display. Small by construction.
 */
async function activeCurrencies(
  supabase: ReturnType<typeof createClient>,
): Promise<{ bases: string[]; quotes: string[] }> {
  const bases = new Set<string>();
  const quotes = new Set<string>();

  const [trips, expenses, profiles] = await Promise.all([
    supabase.from('trips').select('base_currency').limit(5000),
    supabase.from('expenses').select('currency').limit(5000),
    supabase.from('users').select('display_currency').limit(5000),
  ]);

  for (const row of trips.data ?? []) {
    const code = (row as { base_currency?: string }).base_currency;
    if (code) {
      bases.add(code.toUpperCase());
      quotes.add(code.toUpperCase());
    }
  }
  for (const row of expenses.data ?? []) {
    const code = (row as { currency?: string }).currency;
    if (code) quotes.add(code.toUpperCase());
  }
  for (const row of profiles.data ?? []) {
    const code = (row as { display_currency?: string | null }).display_currency;
    if (code) {
      bases.add(code.toUpperCase());
      quotes.add(code.toUpperCase());
    }
  }

  return { bases: [...bases], quotes: [...quotes] };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
