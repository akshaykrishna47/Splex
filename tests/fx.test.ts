import { describe, expect, it } from 'vitest';
import {
  buildRateTable,
  convertForDisplay,
  describeFreshness,
  divideRates,
  invertRate,
  isStale,
  pinExpenseToBase,
  resolveRate,
} from '@/lib/fx';
import { formatMinor, splitEqual } from '@/lib/money';
import { CURRENCIES, fxRow } from './fixtures';

const RATES = buildRateTable([
  fxRow('USD', 'SGD', '1.3400000000'),
  fxRow('USD', 'THB', '32.5000000000'),
  fxRow('USD', 'MYR', '4.2200000000'),
  fxRow('USD', 'JPY', '152.0000000000'),
  fxRow('USD', 'VND', '25400.0000000000'),
  fxRow('USD', 'KWD', '0.3070000000'),
]);

describe('rate resolution', () => {
  it('returns an identity rate for the same currency', () => {
    const rate = resolveRate('SGD', 'SGD', RATES);
    expect(rate?.rate).toBe('1.0000000000');
    expect(rate?.source).toBe('identity');
  });

  it('reads a direct pair when the cache has one', () => {
    const rate = resolveRate('USD', 'SGD', RATES);
    expect(rate?.rate).toBe('1.3400000000');
    expect(rate?.derived).toBe(false);
  });

  it('inverts when only the reverse pair is cached', () => {
    const rate = resolveRate('SGD', 'USD', RATES);
    expect(rate?.derived).toBe(true);
    expect(Number(rate?.rate)).toBeCloseTo(1 / 1.34, 8);
  });

  it('derives a cross-rate through the USD pivot', () => {
    // THB -> SGD  ==  (USD->SGD) / (USD->THB)  ==  1.34 / 32.5
    const rate = resolveRate('THB', 'SGD', RATES);
    expect(rate?.derived).toBe(true);
    expect(Number(rate?.rate)).toBeCloseTo(1.34 / 32.5, 9);
  });

  it('returns null rather than guessing when the cache cannot cover the pair', () => {
    const sparse = buildRateTable([fxRow('USD', 'SGD', '1.34')]);
    expect(resolveRate('THB', 'MYR', sparse)).toBeNull();
  });

  it('reports the staler leg when deriving', () => {
    const mixed = buildRateTable([
      fxRow('USD', 'SGD', '1.34', { rate_date: '2026-08-17', fetched_at: '2026-08-17T06:00:00.000Z' }),
      fxRow('USD', 'THB', '32.5', { rate_date: '2026-08-10', fetched_at: '2026-08-10T06:00:00.000Z' }),
    ]);
    const rate = resolveRate('THB', 'SGD', mixed);
    expect(rate?.rate_date).toBe('2026-08-10');
  });
});

describe('rate arithmetic', () => {
  it('inverts without drift', () => {
    expect(invertRate('2')).toBe('0.5000000000');
    expect(invertRate('0.5')).toBe('2.0000000000');
  });

  it('divides at ten decimal places', () => {
    expect(divideRates('1.34', '32.5')).toBe('0.0412307692');
  });
});

describe('ledger pinning (INVARIANT 5)', () => {
  it('pins a THB expense on an SGD trip so base shares sum to the base amount', () => {
    // 1,200.00 THB dinner in Bangkok, split equally three ways, SGD trip.
    const amountMinor = 120000;
    const shareMinor = splitEqual(amountMinor, 3);
    const rate = resolveRate('THB', 'SGD', RATES);
    expect(rate).not.toBeNull();
    if (!rate) return;

    const pinned = pinExpenseToBase({
      amountMinor,
      shareMinor,
      currency: 'THB',
      baseCurrency: 'SGD',
      currencies: CURRENCIES,
      rate,
    });

    expect(pinned.baseShareCents.reduce((a, b) => a + b, 0)).toBe(pinned.baseAmountCents);
    expect(pinned.fxRate).toBe(rate.rate);
    expect(pinned.fxSource).toBe(rate.source);
    // 1200 THB / 32.5 * 1.34 ~= 49.48 SGD
    expect(pinned.baseAmountCents).toBe(4948);
  });

  it('pins at rate 1 when the expense is already in the base currency', () => {
    const rate = resolveRate('SGD', 'SGD', RATES);
    if (!rate) throw new Error('identity rate missing');

    const pinned = pinExpenseToBase({
      amountMinor: 5000,
      shareMinor: [2500, 2500],
      currency: 'SGD',
      baseCurrency: 'SGD',
      currencies: CURRENCIES,
      rate,
    });

    expect(pinned.fxRate).toBe('1.0000000000');
    expect(pinned.baseAmountCents).toBe(5000);
    expect(pinned.baseShareCents).toEqual([2500, 2500]);
  });

  it('crosses decimal_digits boundaries: a VND expense on a KWD trip', () => {
    // 0 decimal digits -> 3 decimal digits, the widest gap in the table.
    const amountMinor = 2_540_000; // 2,540,000 VND
    const shareMinor = splitEqual(amountMinor, 3);
    const rate = resolveRate('VND', 'KWD', RATES);
    if (!rate) throw new Error('rate missing');

    const pinned = pinExpenseToBase({
      amountMinor,
      shareMinor,
      currency: 'VND',
      baseCurrency: 'KWD',
      currencies: CURRENCIES,
      rate,
    });

    expect(pinned.baseShareCents.reduce((a, b) => a + b, 0)).toBe(pinned.baseAmountCents);
    // 2,540,000 VND / 25400 * 0.307 = 30.700 KWD -> 30700 minor units (3 digits)
    expect(pinned.baseAmountCents).toBe(30700);
  });
});

describe('display conversion (live, cosmetic)', () => {
  it('renders 3 SGD owed as roughly RM 9 under a MYR display currency', () => {
    const converted = convertForDisplay(300, 'SGD', 'MYR', CURRENCIES, RATES);
    expect(converted).not.toBeNull();
    if (!converted) return;

    // 3 SGD / 1.34 * 4.22 = 9.4478 MYR
    expect(converted.minor).toBe(945);
    expect(formatMinor(converted.minor, 'MYR', CURRENCIES)).toBe('RM9.45');
  });

  it('returns null when display currency equals base currency', () => {
    expect(convertForDisplay(300, 'SGD', 'SGD', CURRENCIES, RATES)).toBeNull();
  });

  it('does not mutate the stored value it was handed', () => {
    const stored = { base_share_cents: 300 };
    const before = { ...stored };
    convertForDisplay(stored.base_share_cents, 'SGD', 'MYR', CURRENCIES, RATES);
    expect(stored).toEqual(before);
  });

  it('leaves the rate table untouched', () => {
    const snapshot = JSON.stringify([...RATES.entries()]);
    convertForDisplay(300, 'SGD', 'MYR', CURRENCIES, RATES);
    convertForDisplay(999, 'SGD', 'JPY', CURRENCIES, RATES);
    expect(JSON.stringify([...RATES.entries()])).toBe(snapshot);
  });
});

describe('staleness', () => {
  const now = new Date('2026-08-17T12:00:00.000Z').getTime();

  it('flags rates older than 12 hours', () => {
    expect(isStale('2026-08-17T06:00:00.000Z', now)).toBe(false);
    expect(isStale('2026-08-16T12:00:00.000Z', now)).toBe(true);
  });

  it('describes freshness in human terms', () => {
    expect(describeFreshness('2026-08-17T11:30:00.000Z', now)).toBe('updated just now');
    expect(describeFreshness('2026-08-17T06:00:00.000Z', now)).toBe('updated 6h ago');
    expect(describeFreshness('2026-08-14T12:00:00.000Z', now)).toBe('updated 3 days ago');
  });
});
