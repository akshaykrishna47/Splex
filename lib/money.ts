/**
 * The single owner of money parsing, conversion, and formatting.
 *
 * Rules this module exists to enforce:
 *
 *   1. Money never touches a float. User input is parsed as a STRING straight
 *      into an integer number of minor units. Conversion runs on BigInt.
 *   2. The number of minor units per major unit comes from the currency's
 *      `decimal_digits`. There is no hardcoded 100 anywhere in this file.
 *      JPY and VND have 0. KWD and BHD have 3. CLF has 4.
 *   3. When a total does not divide evenly, the remainder is distributed one
 *      minor unit at a time in the caller's given order (trip_members.id), so
 *      the same inputs always produce the same allocation.
 */

import type { Currency, CurrencyCode } from './types';

/**
 * FX rates are stored as numeric(20,10). We scale them to integers by 10^10
 * and do all conversion arithmetic in BigInt.
 */
const RATE_DECIMALS = 10;
const RATE_SCALE = 10n ** BigInt(RATE_DECIMALS);

export const DEFAULT_DECIMAL_DIGITS = 2;

export class MoneyError extends Error {}

// ---------------------------------------------------------------------------
// Currency metadata
// ---------------------------------------------------------------------------

export type CurrencyLookup = Record<CurrencyCode, Currency>;

/** Build the lookup the rest of the module takes. */
export function indexCurrencies(list: Currency[]): CurrencyLookup {
  const out: CurrencyLookup = {};
  for (const c of list) out[c.code.toUpperCase()] = c;
  return out;
}

export function decimalDigitsFor(code: CurrencyCode, currencies: CurrencyLookup): number {
  const found = currencies[code.toUpperCase()];
  if (!found) {
    // A currency we have no metadata for. Two decimals is the commonest case
    // and is better than crashing mid-expense, but it is a real gap — the
    // caller should have loaded the currencies table first.
    return DEFAULT_DECIMAL_DIGITS;
  }
  return found.decimal_digits;
}

export function symbolFor(code: CurrencyCode, currencies: CurrencyLookup): string {
  return currencies[code.toUpperCase()]?.symbol ?? code.toUpperCase();
}

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

// ---------------------------------------------------------------------------
// Parsing: string -> integer minor units
// ---------------------------------------------------------------------------

export type ParseResult =
  | { ok: true; minor: number }
  | { ok: false; error: string };

/**
 * Parse user input into minor units. Never uses parseFloat.
 *
 * Accepts: "12", "12.5", "1,234.56", " 1 234.56 ", "0.01"
 * Rejects: negatives, non-numeric text, and more decimal places than the
 *          currency actually has (typing "100.50" for JPY is a mistake worth
 *          surfacing, not silently rounding away).
 */
export function parseAmount(input: string, decimalDigits: number): ParseResult {
  const raw = String(input ?? '').trim();
  if (raw === '') return { ok: false, error: 'Enter an amount.' };

  // Strip grouping separators and whitespace, keep digits and one separator.
  const cleaned = raw.replace(/[\s,_]/g, '');

  if (cleaned.startsWith('-')) return { ok: false, error: 'Amount must be positive.' };
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') {
    return { ok: false, error: 'Enter a number.' };
  }

  const [whole = '', fraction = ''] = cleaned.split('.');

  if (fraction.length > decimalDigits) {
    return {
      ok: false,
      error:
        decimalDigits === 0
          ? 'This currency has no decimal places.'
          : `This currency has at most ${decimalDigits} decimal place${decimalDigits === 1 ? '' : 's'}.`,
    };
  }

  const padded = fraction.padEnd(decimalDigits, '0');
  const minor = BigInt(whole === '' ? '0' : whole) * pow10(decimalDigits) + BigInt(padded === '' ? '0' : padded);

  if (minor <= 0n) return { ok: false, error: 'Amount must be greater than zero.' };
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, error: 'Amount is too large.' };

  return { ok: true, minor: Number(minor) };
}

/** Parse or throw. For code paths that have already validated the input. */
export function parseAmountOrThrow(input: string, decimalDigits: number): number {
  const result = parseAmount(input, decimalDigits);
  if (!result.ok) throw new MoneyError(result.error);
  return result.minor;
}

// ---------------------------------------------------------------------------
// Formatting: integer minor units -> string
// ---------------------------------------------------------------------------

/** "123456" @ 2 digits -> "1234.56". No symbol, no grouping. Round-trips. */
export function toMajorString(minor: number, decimalDigits: number): string {
  const negative = minor < 0;
  const abs = BigInt(Math.abs(Math.trunc(minor)));
  const factor = pow10(decimalDigits);
  const whole = abs / factor;
  const frac = abs % factor;
  const sign = negative ? '-' : '';

  if (decimalDigits === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${frac.toString().padStart(decimalDigits, '0')}`;
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export type FormatOptions = {
  /** Prefix the currency symbol. Default true. */
  showSymbol?: boolean;
  /** Append the ISO code, e.g. "S$12.00 SGD". Default false. */
  showCode?: boolean;
  /** Render a leading "+" for positive values. Default false. */
  signed?: boolean;
};

/**
 * Format minor units for display. Grouping is applied to the whole part and
 * the fractional part always shows exactly `decimal_digits` places.
 */
export function formatMinor(
  minor: number,
  code: CurrencyCode,
  currencies: CurrencyLookup,
  options: FormatOptions = {},
): string {
  const { showSymbol = true, showCode = false, signed = false } = options;
  const digits = decimalDigitsFor(code, currencies);
  const symbol = symbolFor(code, currencies);

  const negative = minor < 0;
  const major = toMajorString(Math.abs(minor), digits);
  const [whole = '0', frac] = major.split('.');

  const body = frac ? `${group(whole)}.${frac}` : group(whole);
  const sign = negative ? '-' : signed && minor > 0 ? '+' : '';
  const withSymbol = showSymbol ? `${sign}${symbol}${body}` : `${sign}${body}`;

  return showCode ? `${withSymbol} ${code.toUpperCase()}` : withSymbol;
}

// ---------------------------------------------------------------------------
// FX conversion
// ---------------------------------------------------------------------------

/**
 * Parse a numeric(20,10) rate (which PostgREST hands over as a string) into a
 * BigInt scaled by 10^10. Extra precision is rounded half-up.
 */
export function parseRate(rate: string | number): bigint {
  const raw = String(rate).trim();
  if (!/^\d*\.?\d*$/.test(raw) || raw === '' || raw === '.') {
    throw new MoneyError(`Invalid FX rate: ${rate}`);
  }

  const [whole = '0', fraction = ''] = raw.split('.');
  const truncated = fraction.slice(0, RATE_DECIMALS).padEnd(RATE_DECIMALS, '0');
  let scaled = BigInt(whole === '' ? '0' : whole) * RATE_SCALE + BigInt(truncated || '0');

  // Round half-up on the first dropped digit.
  const nextDigit = fraction[RATE_DECIMALS];
  if (nextDigit !== undefined && Number(nextDigit) >= 5) scaled += 1n;

  if (scaled <= 0n) throw new MoneyError(`FX rate must be positive, got ${rate}`);
  return scaled;
}

/** Integer division rounding half away from zero. */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/**
 * Convert an amount in minor units from one currency to another at `rate`,
 * where rate is expressed as "how many units of `to` per one unit of `from`".
 *
 * All arithmetic is BigInt. Nothing here can drift.
 */
export function convertMinor(
  amountMinor: number,
  fromDecimalDigits: number,
  toDecimalDigits: number,
  rate: string | number,
): number {
  const rateScaled = parseRate(rate);
  const numerator = BigInt(Math.trunc(amountMinor)) * rateScaled * pow10(toDecimalDigits);
  const denominator = pow10(fromDecimalDigits) * RATE_SCALE;
  return Number(divRoundHalfUp(numerator, denominator));
}

// ---------------------------------------------------------------------------
// Remainder distribution — INVARIANT 3
// ---------------------------------------------------------------------------

/**
 * Split `total` minor units into `count` shares as evenly as possible.
 *
 * The remainder is handed out one minor unit at a time, starting from index 0.
 * Callers pass members already sorted by trip_members.id, which makes the
 * result deterministic across devices and across re-renders.
 *
 *   splitEqual(1000, 3) -> [334, 333, 333]     ($10.00 / 3)
 *   splitEqual(1, 3)    -> [1, 0, 0]           ($0.01 / 3)
 */
export function splitEqual(total: number, count: number): number[] {
  if (count <= 0) throw new MoneyError('Cannot split across zero members.');

  const t = Math.trunc(total);
  const base = Math.trunc(t / count);
  const remainder = t - base * count;
  const sign = remainder < 0 ? -1 : 1;
  const spread = Math.abs(remainder);

  return Array.from({ length: count }, (_, i) => base + (i < spread ? sign : 0));
}

/**
 * Allocate `total` across the given non-negative weights.
 *
 * Each share gets floor(total * weight / totalWeight); the leftover minor units
 * go out one at a time in index order, skipping zero-weight entries so that a
 * member explicitly excluded from a split never picks up a stray cent.
 */
export function allocateByWeights(total: number, weights: number[]): number[] {
  if (weights.length === 0) throw new MoneyError('Cannot allocate across zero members.');

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) throw new MoneyError('Split weights must add up to more than zero.');

  const t = BigInt(Math.trunc(total));
  // Scale weights to integers so fractional shares (e.g. 33.33%) stay exact.
  const scale = 1_000_000;
  const scaledWeights = weights.map((w) => BigInt(Math.round(w * scale)));
  const scaledTotal = scaledWeights.reduce((sum, w) => sum + w, 0n);

  const shares = scaledWeights.map((w) => Number((t * w) / scaledTotal));

  let allocated = shares.reduce((sum, s) => sum + s, 0);
  let leftover = Math.trunc(total) - allocated;

  // Hand out the remainder in index order, only to members who are in the split.
  let guard = Math.abs(leftover) * shares.length + shares.length;
  for (let i = 0; leftover !== 0 && guard > 0; i = (i + 1) % shares.length, guard -= 1) {
    if (scaledWeights[i] === 0n) continue;
    const step = leftover > 0 ? 1 : -1;
    if (step === -1 && (shares[i] as number) <= 0) continue;
    shares[i] = (shares[i] as number) + step;
    leftover -= step;
  }

  if (leftover !== 0) {
    throw new MoneyError('Could not distribute the remainder across these shares.');
  }

  return shares;
}

/**
 * INVARIANT 5: FX rounding is applied once, at pin time.
 *
 * Convert each split individually into the base currency, then nudge the
 * results so they sum to exactly `baseTotal` — which was itself converted from
 * the expense total. Converting the total and the shares independently leaves
 * them disagreeing by a minor unit or two; this is what prevents that.
 *
 * Returns base-currency shares in the same order as `shares`.
 */
export function pinSharesToBase(
  shares: number[],
  baseTotal: number,
  fromDecimalDigits: number,
  toDecimalDigits: number,
  rate: string | number,
): number[] {
  if (shares.length === 0) throw new MoneyError('Cannot pin an expense with no splits.');

  const converted = shares.map((s) =>
    convertMinor(s, fromDecimalDigits, toDecimalDigits, rate),
  );

  const sum = converted.reduce((acc, v) => acc + v, 0);
  let drift = Math.trunc(baseTotal) - sum;
  if (drift === 0) return converted;

  // Same remainder rule as everywhere else: one unit at a time, in order,
  // skipping members whose share is zero.
  let guard = Math.abs(drift) * converted.length + converted.length;
  for (let i = 0; drift !== 0 && guard > 0; i = (i + 1) % converted.length, guard -= 1) {
    if (shares[i] === 0) continue;
    const step = drift > 0 ? 1 : -1;
    if (step === -1 && (converted[i] as number) <= 0) continue;
    converted[i] = (converted[i] as number) + step;
    drift -= step;
  }

  if (drift !== 0) {
    throw new MoneyError('Could not reconcile converted shares with the converted total.');
  }

  return converted;
}

/** Convenience guard used before every write. INVARIANT 1. */
export function splitsBalance(shares: number[], total: number): boolean {
  return shares.reduce((sum, s) => sum + s, 0) === Math.trunc(total);
}
