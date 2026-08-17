import { describe, expect, it } from 'vitest';
import {
  allocateByWeights,
  convertMinor,
  decimalDigitsFor,
  formatMinor,
  parseAmount,
  parseRate,
  pinSharesToBase,
  splitEqual,
  toMajorString,
} from '@/lib/money';
import { CURRENCIES } from './fixtures';

describe('minor-unit parsing', () => {
  describe('2-digit currencies (SGD)', () => {
    const digits = decimalDigitsFor('SGD', CURRENCIES);

    it('reads whole and fractional amounts', () => {
      expect(parseAmount('10', digits)).toEqual({ ok: true, minor: 1000 });
      expect(parseAmount('10.5', digits)).toEqual({ ok: true, minor: 1050 });
      expect(parseAmount('10.55', digits)).toEqual({ ok: true, minor: 1055 });
      expect(parseAmount('0.01', digits)).toEqual({ ok: true, minor: 1 });
    });

    it('strips grouping separators', () => {
      expect(parseAmount('1,234.56', digits)).toEqual({ ok: true, minor: 123456 });
      expect(parseAmount(' 1 234.56 ', digits)).toEqual({ ok: true, minor: 123456 });
    });

    it('rejects more precision than the currency has', () => {
      const result = parseAmount('10.555', digits);
      expect(result.ok).toBe(false);
    });

    it('rejects junk, negatives, and zero', () => {
      expect(parseAmount('abc', digits).ok).toBe(false);
      expect(parseAmount('-5', digits).ok).toBe(false);
      expect(parseAmount('0', digits).ok).toBe(false);
      expect(parseAmount('', digits).ok).toBe(false);
    });

    it('never loses a cent to float representation', () => {
      // 0.1 + 0.2 territory: this is exactly why input is parsed as a string.
      expect(parseAmount('1234567.89', digits)).toEqual({ ok: true, minor: 123456789 });
      expect(parseAmount('0.29', digits)).toEqual({ ok: true, minor: 29 });
      expect(parseAmount('1.005', digits).ok).toBe(false);
    });
  });

  describe('0-digit currencies (JPY, VND)', () => {
    it('treats the amount as already being in minor units', () => {
      const jpy = decimalDigitsFor('JPY', CURRENCIES);
      expect(jpy).toBe(0);
      expect(parseAmount('1200', jpy)).toEqual({ ok: true, minor: 1200 });

      const vnd = decimalDigitsFor('VND', CURRENCIES);
      expect(vnd).toBe(0);
      expect(parseAmount('250000', vnd)).toEqual({ ok: true, minor: 250000 });
    });

    it('rejects decimal input outright', () => {
      const jpy = decimalDigitsFor('JPY', CURRENCIES);
      const result = parseAmount('1200.50', jpy);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/no decimal places/i);
    });
  });

  describe('3-digit currencies (KWD)', () => {
    const digits = decimalDigitsFor('KWD', CURRENCIES);

    it('uses 1000 minor units per dinar, not 100', () => {
      expect(digits).toBe(3);
      expect(parseAmount('1', digits)).toEqual({ ok: true, minor: 1000 });
      expect(parseAmount('1.5', digits)).toEqual({ ok: true, minor: 1500 });
      expect(parseAmount('1.234', digits)).toEqual({ ok: true, minor: 1234 });
      expect(parseAmount('0.001', digits)).toEqual({ ok: true, minor: 1 });
    });

    it('rejects a 4th decimal place', () => {
      expect(parseAmount('1.2345', digits).ok).toBe(false);
    });
  });
});

describe('formatting', () => {
  it('formats each decimal_digits case correctly', () => {
    expect(formatMinor(123456, 'SGD', CURRENCIES)).toBe('S$1,234.56');
    expect(formatMinor(1200, 'JPY', CURRENCIES)).toBe('¥1,200');
    expect(formatMinor(250000, 'VND', CURRENCIES)).toBe('₫250,000');
    expect(formatMinor(1234, 'KWD', CURRENCIES)).toBe('KD1.234');
  });

  it('handles signs, codes, and zero', () => {
    expect(formatMinor(-500, 'SGD', CURRENCIES)).toBe('-S$5.00');
    expect(formatMinor(500, 'SGD', CURRENCIES, { signed: true })).toBe('+S$5.00');
    expect(formatMinor(500, 'SGD', CURRENCIES, { showCode: true })).toBe('S$5.00 SGD');
    expect(formatMinor(0, 'SGD', CURRENCIES)).toBe('S$0.00');
    expect(formatMinor(500, 'SGD', CURRENCIES, { showSymbol: false })).toBe('5.00');
  });

  it('round-trips through parse', () => {
    for (const [code, input] of [
      ['SGD', '1234.56'],
      ['JPY', '1200'],
      ['KWD', '1.234'],
    ] as const) {
      const digits = decimalDigitsFor(code, CURRENCIES);
      const parsed = parseAmount(input, digits);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(toMajorString(parsed.minor, digits)).toBe(input);
    }
  });
});

describe('equal-split rounding (INVARIANT 3)', () => {
  it('$10 / 3 gives 334/333/333', () => {
    expect(splitEqual(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEqual(1000, 3).reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('$0.01 / 3 gives the cent to the first member', () => {
    expect(splitEqual(1, 3)).toEqual([1, 0, 0]);
    expect(splitEqual(1, 3).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('always sums to the total for 2 through 7 members', () => {
    for (let members = 2; members <= 7; members += 1) {
      for (const total of [1, 2, 7, 100, 999, 1000, 1234, 100000, 250001]) {
        const shares = splitEqual(total, members);
        expect(shares).toHaveLength(members);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
        // No share differs from another by more than one minor unit.
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic: the same inputs always give the same allocation', () => {
    expect(splitEqual(100, 7)).toEqual(splitEqual(100, 7));
    expect(splitEqual(100, 7)).toEqual([15, 15, 14, 14, 14, 14, 14]);
  });

  it('works for 0-digit currencies where 1 minor unit is 1 yen', () => {
    expect(splitEqual(10, 3)).toEqual([4, 3, 3]);
    expect(splitEqual(10, 3).reduce((a, b) => a + b, 0)).toBe(10);
  });
});

describe('weighted allocation', () => {
  it('sums to the total even with awkward weights', () => {
    const shares = allocateByWeights(1000, [33.33, 33.33, 33.34]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('gives nothing to zero-weight members', () => {
    const shares = allocateByWeights(1000, [1, 0, 1]);
    expect(shares[1]).toBe(0);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('respects share ratios', () => {
    expect(allocateByWeights(900, [2, 1])).toEqual([600, 300]);
  });
});

describe('FX arithmetic', () => {
  it('parses numeric(20,10) rates without float drift', () => {
    expect(parseRate('1')).toBe(10_000_000_000n);
    expect(parseRate('0.0412345678')).toBe(412_345_678n);
    // Rounds half-up on the 11th decimal.
    expect(parseRate('0.00000000005')).toBe(1n);
  });

  it('converts across differing decimal_digits', () => {
    // 1000 THB (2 digits) at 0.0412 SGD/THB -> 41.20 SGD
    expect(convertMinor(100000, 2, 2, '0.0412')).toBe(4120);
    // 10000 JPY (0 digits) at 0.0088 SGD/JPY -> 88.00 SGD
    expect(convertMinor(10000, 0, 2, '0.0088')).toBe(8800);
    // 100.00 SGD -> JPY at 113.6 -> 11360 JPY
    expect(convertMinor(10000, 2, 0, '113.6')).toBe(11360);
  });

  it('rounds half-up rather than truncating', () => {
    expect(convertMinor(1, 2, 2, '1.005')).toBe(1);
    expect(convertMinor(100, 2, 2, '1.005')).toBe(101);
  });
});

describe('pinSharesToBase (INVARIANT 5)', () => {
  it('makes converted shares sum to the converted total exactly', () => {
    // 1000.00 THB split three ways, converted to SGD.
    const shares = splitEqual(100000, 3); // [33334, 33333, 33333]
    const baseTotal = convertMinor(100000, 2, 2, '0.0412345678');
    const pinned = pinSharesToBase(shares, baseTotal, 2, 2, '0.0412345678');

    expect(pinned.reduce((a, b) => a + b, 0)).toBe(baseTotal);
  });

  it('holds across many awkward rates and member counts', () => {
    const rates = ['0.0412345678', '113.6', '0.0000432', '1.9999999999', '23456.789'];
    for (const rate of rates) {
      for (let members = 2; members <= 7; members += 1) {
        for (const total of [1, 99, 1000, 123457]) {
          const shares = splitEqual(total, members);
          const baseTotal = convertMinor(total, 2, 2, rate);
          const pinned = pinSharesToBase(shares, baseTotal, 2, 2, rate);
          expect(pinned.reduce((a, b) => a + b, 0)).toBe(baseTotal);
        }
      }
    }
  });

  it('never assigns a share to a member excluded from the split', () => {
    const shares = [500, 0, 500];
    const baseTotal = convertMinor(1000, 2, 2, '0.333');
    const pinned = pinSharesToBase(shares, baseTotal, 2, 2, '0.333');
    expect(pinned[1]).toBe(0);
    expect(pinned.reduce((a, b) => a + b, 0)).toBe(baseTotal);
  });
});
