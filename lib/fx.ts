/**
 * FX rate resolution and expense pinning.
 *
 * The client never talks to an FX provider. It reads the `fx_rates` cache that
 * the `sync-fx-rates` edge function fills, and does cross-rate arithmetic here
 * when the exact pair is missing.
 *
 * Two conversions live in this app and they must not be confused:
 *
 *   Ledger conversion  — PINNED at save time, stored, never recomputed.
 *                        `pinExpenseToBase` below.
 *   Display conversion — LIVE, cosmetic, applied at render time only.
 *                        `convertForDisplay` below. Nothing is persisted.
 */

import { convertMinor, decimalDigitsFor, MoneyError, parseRate, pinSharesToBase } from './money';
import type { CurrencyLookup } from './money';
import type { CurrencyCode, FxRate, IsoDate } from './types';

/** Rates are published against this pivot; cross-rates are derived from it. */
export const PIVOT_CURRENCY = 'USD';

/** Older than this and the UI says so. Also triggers an on-demand resync. */
export const STALE_AFTER_HOURS = 12;

const RATE_DECIMALS = 10;
const RATE_SCALE = 10n ** BigInt(RATE_DECIMALS);

export type ResolvedRate = {
  rate: string;
  rate_date: IsoDate;
  source: string;
  fetched_at: string;
  /** True when derived from two pivot rates rather than read directly. */
  derived: boolean;
};

export type RateTable = Map<string, FxRate>;

function key(base: CurrencyCode, quote: CurrencyCode): string {
  return `${base.toUpperCase()}>${quote.toUpperCase()}`;
}

export function buildRateTable(rows: FxRate[]): RateTable {
  const table: RateTable = new Map();
  for (const row of rows) {
    const k = key(row.base_currency, row.quote_currency);
    const existing = table.get(k);
    // Keep the newest row per pair.
    if (!existing || row.rate_date > existing.rate_date) table.set(k, row);
  }
  return table;
}

/** Format a scaled BigInt back into a numeric(20,10) string. */
function formatScaled(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = abs / RATE_SCALE;
  const frac = (abs % RATE_SCALE).toString().padStart(RATE_DECIMALS, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

/** 1 / rate, at 10 decimal places. */
export function invertRate(rate: string | number): string {
  const scaled = parseRate(rate);
  if (scaled === 0n) throw new MoneyError('Cannot invert a zero rate.');
  return formatScaled((RATE_SCALE * RATE_SCALE) / scaled);
}

/** a / b, at 10 decimal places. Used to derive cross-rates from the pivot. */
export function divideRates(a: string | number, b: string | number): string {
  const scaledA = parseRate(a);
  const scaledB = parseRate(b);
  if (scaledB === 0n) throw new MoneyError('Cannot divide by a zero rate.');
  return formatScaled((scaledA * RATE_SCALE) / scaledB);
}

/**
 * Find the rate to convert `from` -> `to`.
 *
 * Tries the direct pair, then the inverse, then a cross-rate through the pivot
 * currency. Returns null when the cache has nothing usable, which the caller
 * must treat as "cannot save this expense yet" rather than falling back to 1.
 */
export function resolveRate(
  from: CurrencyCode,
  to: CurrencyCode,
  table: RateTable,
): ResolvedRate | null {
  const a = from.toUpperCase();
  const b = to.toUpperCase();

  if (a === b) {
    const today = new Date().toISOString().slice(0, 10);
    return { rate: '1.0000000000', rate_date: today, source: 'identity', fetched_at: new Date().toISOString(), derived: false };
  }

  const direct = table.get(key(a, b));
  if (direct) {
    return {
      rate: direct.rate,
      rate_date: direct.rate_date,
      source: direct.source,
      fetched_at: direct.fetched_at,
      derived: false,
    };
  }

  const inverse = table.get(key(b, a));
  if (inverse) {
    return {
      rate: invertRate(inverse.rate),
      rate_date: inverse.rate_date,
      source: inverse.source,
      fetched_at: inverse.fetched_at,
      derived: true,
    };
  }

  // Cross-rate: (PIVOT -> b) / (PIVOT -> a)
  const pivotToA = table.get(key(PIVOT_CURRENCY, a));
  const pivotToB = table.get(key(PIVOT_CURRENCY, b));
  if (pivotToA && pivotToB) {
    return {
      rate: divideRates(pivotToB.rate, pivotToA.rate),
      // The pair is only as fresh as its staler leg.
      rate_date: pivotToA.rate_date < pivotToB.rate_date ? pivotToA.rate_date : pivotToB.rate_date,
      source: pivotToB.source,
      fetched_at: pivotToA.fetched_at < pivotToB.fetched_at ? pivotToA.fetched_at : pivotToB.fetched_at,
      derived: true,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Ledger conversion — pinned
// ---------------------------------------------------------------------------

export type PinnedExpense = {
  baseAmountCents: number;
  baseShareCents: number[];
  fxRate: string;
  fxRateDate: IsoDate;
  fxSource: string;
};

/**
 * Convert an expense and its splits into the trip's base currency, once, at
 * save time.
 *
 * The total is converted first, then each share is converted individually and
 * the difference is distributed — so sum(baseShareCents) === baseAmountCents
 * exactly. Converting the total and the shares independently would leave them
 * disagreeing by a minor unit, which the database would then reject.
 */
export function pinExpenseToBase(params: {
  amountMinor: number;
  shareMinor: number[];
  currency: CurrencyCode;
  baseCurrency: CurrencyCode;
  currencies: CurrencyLookup;
  rate: ResolvedRate;
}): PinnedExpense {
  const { amountMinor, shareMinor, currency, baseCurrency, currencies, rate } = params;

  const fromDigits = decimalDigitsFor(currency, currencies);
  const toDigits = decimalDigitsFor(baseCurrency, currencies);

  if (currency.toUpperCase() === baseCurrency.toUpperCase()) {
    return {
      baseAmountCents: amountMinor,
      baseShareCents: [...shareMinor],
      fxRate: '1.0000000000',
      fxRateDate: rate.rate_date,
      fxSource: 'identity',
    };
  }

  const baseAmountCents = convertMinor(amountMinor, fromDigits, toDigits, rate.rate);
  const baseShareCents = pinSharesToBase(
    shareMinor,
    baseAmountCents,
    fromDigits,
    toDigits,
    rate.rate,
  );

  return {
    baseAmountCents,
    baseShareCents,
    fxRate: rate.rate,
    fxRateDate: rate.rate_date,
    fxSource: rate.source,
  };
}

// ---------------------------------------------------------------------------
// Display conversion — live and cosmetic
// ---------------------------------------------------------------------------

/**
 * Convert a stored base-currency figure into the user's chosen display
 * currency for rendering. NOTHING here is persisted, and no caller may write
 * the result back to the database.
 */
export function convertForDisplay(
  baseMinor: number,
  baseCurrency: CurrencyCode,
  displayCurrency: CurrencyCode,
  currencies: CurrencyLookup,
  table: RateTable,
): { minor: number; rate: ResolvedRate } | null {
  if (baseCurrency.toUpperCase() === displayCurrency.toUpperCase()) return null;

  const rate = resolveRate(baseCurrency, displayCurrency, table);
  if (!rate) return null;

  return {
    minor: convertMinor(
      baseMinor,
      decimalDigitsFor(baseCurrency, currencies),
      decimalDigitsFor(displayCurrency, currencies),
      rate.rate,
    ),
    rate,
  };
}

// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------

export function ageInHours(fetchedAt: string, now: number = Date.now()): number {
  const then = new Date(fetchedAt).getTime();
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return (now - then) / 3_600_000;
}

export function isStale(fetchedAt: string, now: number = Date.now()): boolean {
  return ageInHours(fetchedAt, now) > STALE_AFTER_HOURS;
}

/** Human-readable freshness for the FX footer. */
export function describeFreshness(fetchedAt: string, now: number = Date.now()): string {
  const hours = ageInHours(fetchedAt, now);
  if (!Number.isFinite(hours)) return 'unknown age';
  if (hours < 1) return 'updated just now';
  if (hours < 24) return `updated ${Math.floor(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `updated ${days} day${days === 1 ? '' : 's'} ago`;
}
