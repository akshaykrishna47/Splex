import { describe, expect, it } from 'vitest';
import { computeSplits } from '@/lib/splits';
import { MEMBERS } from './fixtures';

const three = [
  { memberId: MEMBERS.aditi, included: true },
  { memberId: MEMBERS.ben, included: true },
  { memberId: MEMBERS.cara, included: true },
];

describe('equal splits', () => {
  it('splits evenly and sums to the total', () => {
    const result = computeSplits({ mode: 'equal', totalMinor: 1000, decimalDigits: 2, entries: three });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.shares.map((s) => s.shareCents)).toEqual([334, 333, 333]);
    expect(sum(result)).toBe(1000);
  });

  it('excludes members who are toggled off', () => {
    const result = computeSplits({
      mode: 'equal',
      totalMinor: 1000,
      decimalDigits: 2,
      entries: [...three.slice(0, 2), { memberId: MEMBERS.cara, included: false }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.shares).toHaveLength(2);
    expect(sum(result)).toBe(1000);
  });

  it('refuses a split with nobody in it', () => {
    const result = computeSplits({
      mode: 'equal',
      totalMinor: 1000,
      decimalDigits: 2,
      entries: three.map((e) => ({ ...e, included: false })),
    });
    expect(result.ok).toBe(false);
  });

  it('allocates the remainder in member-id order regardless of input order', () => {
    const forwards = computeSplits({ mode: 'equal', totalMinor: 1000, decimalDigits: 2, entries: three });
    const backwards = computeSplits({
      mode: 'equal',
      totalMinor: 1000,
      decimalDigits: 2,
      entries: [...three].reverse(),
    });

    expect(forwards.ok && backwards.ok).toBe(true);
    if (!forwards.ok || !backwards.ok) return;
    expect(forwards.shares).toEqual(backwards.shares);
  });
});

describe('exact splits', () => {
  it('accepts amounts that add up exactly', () => {
    const result = computeSplits({
      mode: 'exact',
      totalMinor: 1000,
      decimalDigits: 2,
      entries: [
        { memberId: MEMBERS.aditi, included: true, value: '5.00' },
        { memberId: MEMBERS.ben, included: true, value: '3.00' },
        { memberId: MEMBERS.cara, included: true, value: '2.00' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shares.map((s) => s.shareCents)).toEqual([500, 300, 200]);
    expect(result.remainder).toEqual({ kind: 'amount', minor: 0 });
  });

  it('blocks save and reports what is left when it under-adds', () => {
    const result = computeSplits({
      mode: 'exact',
      totalMinor: 1000,
      decimalDigits: 2,
      entries: [
        { memberId: MEMBERS.aditi, included: true, value: '5.00' },
        { memberId: MEMBERS.ben, included: true, value: '3.00' },
        { memberId: MEMBERS.cara, included: true, value: '' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.remainder).toEqual({ kind: 'amount', minor: 200 });
    if (!result.ok) expect(result.error).toContain('2.00');
  });

  it('blocks save when it over-adds', () => {
    const result = computeSplits({
      mode: 'exact',
      totalMinor: 1000,
      decimalDigits: 2,
      entries: [
        { memberId: MEMBERS.aditi, included: true, value: '9.00' },
        { memberId: MEMBERS.ben, included: true, value: '3.00' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.remainder).toEqual({ kind: 'amount', minor: -200 });
    if (!result.ok) expect(result.error).toMatch(/over the total/i);
  });

  it('allows an explicit zero share', () => {
    const result = computeSplits({
      mode: 'exact',
      totalMinor: 1000,
      decimalDigits: 2,
      entries: [
        { memberId: MEMBERS.aditi, included: true, value: '10.00' },
        { memberId: MEMBERS.ben, included: true, value: '0' },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.shares[1]?.shareCents).toBe(0);
  });

  it('rejects precision the currency does not have', () => {
    const result = computeSplits({
      mode: 'exact',
      totalMinor: 1000,
      decimalDigits: 0,
      entries: [{ memberId: MEMBERS.aditi, included: true, value: '1000.5' }],
    });
    expect(result.ok).toBe(false);
  });
});

describe('percent splits', () => {
  it('accepts percentages summing to 100', () => {
    const result = computeSplits({
      mode: 'percent',
      totalMinor: 1000,
      decimalDigits: 2,
      entries: [
        { memberId: MEMBERS.aditi, included: true, value: '50' },
        { memberId: MEMBERS.ben, included: true, value: '25' },
        { memberId: MEMBERS.cara, included: true, value: '25' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shares.map((s) => s.shareCents)).toEqual([500, 250, 250]);
    expect(sum(result)).toBe(1000);
  });

  it('handles thirds without losing a cent', () => {
    const result = computeSplits({
      mode: 'percent',
      totalMinor: 1000,
      decimalDigits: 2,
      entries: [
        { memberId: MEMBERS.aditi, included: true, value: '33.33' },
        { memberId: MEMBERS.ben, included: true, value: '33.33' },
        { memberId: MEMBERS.cara, included: true, value: '33.34' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(sum(result)).toBe(1000);
  });

  it('blocks save when percentages miss 100', () => {
    const under = computeSplits({
      mode: 'percent',
      totalMinor: 1000,
      decimalDigits: 2,
      entries: [
        { memberId: MEMBERS.aditi, included: true, value: '50' },
        { memberId: MEMBERS.ben, included: true, value: '30' },
      ],
    });
    expect(under.ok).toBe(false);
    expect(under.remainder).toEqual({ kind: 'percent', value: 20 });

    const over = computeSplits({
      mode: 'percent',
      totalMinor: 1000,
      decimalDigits: 2,
      entries: [
        { memberId: MEMBERS.aditi, included: true, value: '80' },
        { memberId: MEMBERS.ben, included: true, value: '30' },
      ],
    });
    expect(over.ok).toBe(false);
    expect(over.remainder).toEqual({ kind: 'percent', value: -10 });
  });

  it('keeps the raw percentage so the edit form can round-trip it', () => {
    const result = computeSplits({
      mode: 'percent',
      totalMinor: 1000,
      decimalDigits: 2,
      entries: [
        { memberId: MEMBERS.aditi, included: true, value: '33.33' },
        { memberId: MEMBERS.ben, included: true, value: '66.67' },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.shares.map((s) => s.shareValue)).toEqual([33.33, 66.67]);
  });
});

describe('shares splits', () => {
  it('allocates proportionally', () => {
    const result = computeSplits({
      mode: 'shares',
      totalMinor: 900,
      decimalDigits: 2,
      entries: [
        { memberId: MEMBERS.aditi, included: true, value: '2' },
        { memberId: MEMBERS.ben, included: true, value: '1' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shares.map((s) => s.shareCents)).toEqual([600, 300]);
  });

  it('defaults an empty share box to 1', () => {
    const result = computeSplits({
      mode: 'shares',
      totalMinor: 1000,
      decimalDigits: 2,
      entries: [
        { memberId: MEMBERS.aditi, included: true, value: '' },
        { memberId: MEMBERS.ben, included: true, value: '' },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.shares.map((s) => s.shareCents)).toEqual([500, 500]);
  });

  it('always sums to the total for awkward ratios', () => {
    const result = computeSplits({
      mode: 'shares',
      totalMinor: 1000,
      decimalDigits: 2,
      entries: [
        { memberId: MEMBERS.aditi, included: true, value: '1' },
        { memberId: MEMBERS.ben, included: true, value: '1' },
        { memberId: MEMBERS.cara, included: true, value: '1' },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(sum(result)).toBe(1000);
  });
});

function sum(result: { ok: true; shares: { shareCents: number }[] }): number {
  return result.shares.reduce((acc, s) => acc + s.shareCents, 0);
}
