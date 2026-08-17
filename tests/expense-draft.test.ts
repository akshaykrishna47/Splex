import { describe, expect, it } from 'vitest';
import { buildExpenseWrite, willRepin, type ExistingPin } from '@/lib/expense-draft';
import { buildRateTable, resolveRate } from '@/lib/fx';
import { splitEqual } from '@/lib/money';
import { computeSplits } from '@/lib/splits';
import { CURRENCIES, fxRow, MEMBERS } from './fixtures';

const RATES_DAY_ONE = buildRateTable([fxRow('USD', 'SGD', '1.34'), fxRow('USD', 'THB', '32.5')]);
const RATES_DAY_TWO = buildRateTable([
  fxRow('USD', 'SGD', '1.34', { rate_date: '2026-08-18' }),
  fxRow('USD', 'THB', '28.0', { rate_date: '2026-08-18' }),
]);

const threeWay = computeSplits({
  mode: 'equal',
  totalMinor: 120000,
  decimalDigits: 2,
  entries: [
    { memberId: MEMBERS.aditi, included: true },
    { memberId: MEMBERS.ben, included: true },
    { memberId: MEMBERS.cara, included: true },
  ],
});

const shares = threeWay.ok ? threeWay.shares : [];

function base(overrides: Partial<Parameters<typeof buildExpenseWrite>[0]> = {}) {
  return {
    tripId: 'trip-1',
    title: 'Dinner in Bangkok',
    amountMinor: 120000,
    currency: 'THB',
    baseCurrency: 'SGD',
    currencies: CURRENCIES,
    category: 'food' as const,
    paidBy: MEMBERS.aditi,
    expenseDate: '2026-08-17',
    mode: 'equal' as const,
    shares,
    freshRate: resolveRate('THB', 'SGD', RATES_DAY_ONE),
    ...overrides,
  };
}

describe('creating an expense', () => {
  it('pins the rate and produces balanced splits', () => {
    const result = buildExpenseWrite(base());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { input } = result;
    expect(input.fxRate).toBe('0.0412307692');
    expect(input.fxSource).toBe('fawazahmed0/currency-api');
    expect(input.baseAmountCents).toBe(4948);
    expect(input.splits.reduce((sum, s) => sum + s.share_cents, 0)).toBe(120000);
    expect(input.splits.reduce((sum, s) => sum + s.base_share_cents, 0)).toBe(4948);
  });

  it('pins at rate 1 for an expense already in the base currency', () => {
    const sameCurrency = computeSplits({
      mode: 'equal',
      totalMinor: 3000,
      decimalDigits: 2,
      entries: [
        { memberId: MEMBERS.aditi, included: true },
        { memberId: MEMBERS.ben, included: true },
      ],
    });

    const result = buildExpenseWrite(
      base({
        currency: 'SGD',
        amountMinor: 3000,
        shares: sameCurrency.ok ? sameCurrency.shares : [],
        freshRate: resolveRate('SGD', 'SGD', RATES_DAY_ONE),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.fxRate).toBe('1.0000000000');
    expect(result.input.baseAmountCents).toBe(3000);
  });

  it('refuses to save rather than inventing a rate when the cache is empty', () => {
    const result = buildExpenseWrite(base({ freshRate: null }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no cached exchange rate/i);
  });

  it('rejects a split that does not add up', () => {
    const result = buildExpenseWrite(
      base({ shares: [{ memberId: MEMBERS.aditi, shareCents: 99, shareValue: null }] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/does not add up/i);
  });
});

describe('editing an expense', () => {
  const existing: ExistingPin = {
    amount_cents: 120000,
    currency: 'THB',
    base_amount_cents: 4948,
    fx_rate: '0.0412307692',
    fx_rate_date: '2026-08-17',
    fx_source: 'fawazahmed0/currency-api',
  };

  it('leaves the pinned rate alone when only the title changes', () => {
    const result = buildExpenseWrite(
      base({
        title: 'Dinner at the night market',
        existing,
        // Even handed a newer, different rate, it must not be used.
        freshRate: resolveRate('THB', 'SGD', RATES_DAY_TWO),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.repinned).toBe(false);
    expect(result.input.fxRate).toBe(existing.fx_rate);
    expect(result.input.fxRateDate).toBe(existing.fx_rate_date);
    expect(result.input.baseAmountCents).toBe(existing.base_amount_cents);
  });

  it('leaves the pinned rate alone when only the split shape changes', () => {
    const twoWay = computeSplits({
      mode: 'equal',
      totalMinor: 120000,
      decimalDigits: 2,
      entries: [
        { memberId: MEMBERS.aditi, included: true },
        { memberId: MEMBERS.ben, included: true },
      ],
    });

    const result = buildExpenseWrite(
      base({
        shares: twoWay.ok ? twoWay.shares : [],
        existing,
        freshRate: resolveRate('THB', 'SGD', RATES_DAY_TWO),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.repinned).toBe(false);
    expect(result.input.fxRate).toBe(existing.fx_rate);
    expect(result.input.baseAmountCents).toBe(4948);
    // Redistributed across two people, still summing to the original total.
    expect(result.input.splits).toHaveLength(2);
    expect(result.input.splits.reduce((sum, s) => sum + s.base_share_cents, 0)).toBe(4948);
  });

  it('re-pins when the amount changes', () => {
    const bigger = computeSplits({
      mode: 'equal',
      totalMinor: 150000,
      decimalDigits: 2,
      entries: [
        { memberId: MEMBERS.aditi, included: true },
        { memberId: MEMBERS.ben, included: true },
        { memberId: MEMBERS.cara, included: true },
      ],
    });

    const result = buildExpenseWrite(
      base({
        amountMinor: 150000,
        shares: bigger.ok ? bigger.shares : [],
        existing,
        freshRate: resolveRate('THB', 'SGD', RATES_DAY_TWO),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.repinned).toBe(true);
    expect(result.input.fxRate).not.toBe(existing.fx_rate);
    expect(result.input.splits.reduce((sum, s) => sum + s.base_share_cents, 0)).toBe(
      result.input.baseAmountCents,
    );
  });

  it('re-pins when the currency changes', () => {
    const result = buildExpenseWrite(
      base({
        currency: 'SGD',
        amountMinor: 120000,
        existing,
        freshRate: resolveRate('SGD', 'SGD', RATES_DAY_TWO),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.repinned).toBe(true);
    expect(result.input.fxRate).toBe('1.0000000000');
  });

  it('willRepin matches what the build actually does', () => {
    expect(willRepin(existing, 120000, 'THB')).toBe(false);
    expect(willRepin(existing, 150000, 'THB')).toBe(true);
    expect(willRepin(existing, 120000, 'SGD')).toBe(true);
    expect(willRepin(null, 120000, 'THB')).toBe(false);
  });

  it('keeps balances stable across a title-only edit', () => {
    // The whole point: renaming an expense must not move anyone's balance.
    const before = buildExpenseWrite(base({ existing }));
    const after = buildExpenseWrite(base({ title: 'Renamed', existing }));

    expect(before.ok && after.ok).toBe(true);
    if (!before.ok || !after.ok) return;

    expect(after.input.baseAmountCents).toBe(before.input.baseAmountCents);
    expect(after.input.splits.map((s) => s.base_share_cents)).toEqual(
      before.input.splits.map((s) => s.base_share_cents),
    );
  });
});

/**
 * Duplicating reuses an expense's values but creates a NEW expense, so it must
 * NOT inherit the original's pinned rate. The mechanism is that the duplicate
 * passes `existing: null` — this locks that behaviour in.
 */
describe('duplicating an expense', () => {
  const original: ExistingPin = {
    amount_cents: 120000,
    currency: 'THB',
    base_amount_cents: 4948,
    fx_rate: '0.0412307692',
    fx_rate_date: '2026-08-17',
    fx_source: 'fawazahmed0/currency-api',
  };

  it('re-pins at today’s rate instead of reusing the original’s', () => {
    const duplicate = buildExpenseWrite(
      base({
        // What the duplicate flow does: same values, no `existing`.
        existing: null,
        expenseDate: '2026-08-19',
        freshRate: resolveRate('THB', 'SGD', RATES_DAY_TWO),
      }),
    );

    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) return;

    expect(duplicate.input.fxRate).not.toBe(original.fx_rate);
    expect(duplicate.input.baseAmountCents).not.toBe(original.base_amount_cents);
    // 1200 THB at the day-two rate (1.34 / 28.0) is a different SGD figure.
    expect(duplicate.input.baseAmountCents).toBe(5743);
    expect(duplicate.input.expenseDate).toBe('2026-08-19');
  });

  it('keeps the copied split intact and balanced', () => {
    const duplicate = buildExpenseWrite(
      base({ existing: null, freshRate: resolveRate('THB', 'SGD', RATES_DAY_TWO) }),
    );

    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) return;

    expect(duplicate.input.splits).toHaveLength(3);
    expect(duplicate.input.splits.reduce((s, x) => s + x.share_cents, 0)).toBe(120000);
    expect(duplicate.input.splits.reduce((s, x) => s + x.base_share_cents, 0)).toBe(
      duplicate.input.baseAmountCents,
    );
  });

  it('copies title, category and payer unchanged', () => {
    const duplicate = buildExpenseWrite(
      base({ existing: null, freshRate: resolveRate('THB', 'SGD', RATES_DAY_TWO) }),
    );
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) return;

    expect(duplicate.input.title).toBe('Dinner in Bangkok');
    expect(duplicate.input.category).toBe('food');
    expect(duplicate.input.paidBy).toBe(MEMBERS.aditi);
  });

  it('refuses rather than falling back to the old rate when none is cached', () => {
    const duplicate = buildExpenseWrite(base({ existing: null, freshRate: null }));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error).toMatch(/no cached exchange rate/i);
  });

  it('a same-currency duplicate needs no rate at all', () => {
    const sameCurrency = computeSplits({
      mode: 'equal',
      totalMinor: 3000,
      decimalDigits: 2,
      entries: [
        { memberId: MEMBERS.aditi, included: true },
        { memberId: MEMBERS.ben, included: true },
      ],
    });

    const duplicate = buildExpenseWrite(
      base({
        existing: null,
        currency: 'SGD',
        amountMinor: 3000,
        shares: sameCurrency.ok ? sameCurrency.shares : [],
        freshRate: resolveRate('SGD', 'SGD', RATES_DAY_TWO),
      }),
    );

    expect(duplicate.ok).toBe(true);
    if (duplicate.ok) expect(duplicate.input.fxRate).toBe('1.0000000000');
  });
});

describe('split ordering', () => {
  it('assigns the rounding remainder by member id, not by input order', () => {
    const result = buildExpenseWrite(base());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const expected = splitEqual(120000, 3);
    expect(result.input.splits.map((s) => s.share_cents)).toEqual(expected);
    expect(result.input.splits[0]?.member_id).toBe(MEMBERS.aditi);
  });
});
