/**
 * Split calculation for the four share types.
 *
 * Everything here is pure and works in minor units. Members are sorted by id
 * before allocation so the remainder-distribution rule in `money.ts` produces
 * the same answer on every device, every time.
 */

import {
  allocateByWeights,
  MoneyError,
  parseAmount,
  splitEqual,
  toMajorString,
} from './money';
import type { ShareType, Uuid } from './types';

export type SplitEntry = {
  memberId: Uuid;
  included: boolean;
  /** Raw user input: an amount for `exact`, a number for `percent`/`shares`. */
  value?: string;
};

export type ComputedShare = {
  memberId: Uuid;
  shareCents: number;
  /** The raw input, kept so the edit form can round-trip "33.33" or "2". */
  shareValue: number | null;
};

/** What the live "remaining" indicator shows, and what blocks save. */
export type Remainder =
  | { kind: 'amount'; minor: number }
  | { kind: 'percent'; value: number }
  | null;

export type SplitResult =
  | { ok: true; shares: ComputedShare[]; remainder: Remainder }
  | { ok: false; error: string; remainder: Remainder };

const PERCENT_EPSILON = 0.0001;

export function computeSplits(params: {
  mode: ShareType;
  totalMinor: number;
  decimalDigits: number;
  entries: SplitEntry[];
}): SplitResult {
  const { mode, totalMinor, decimalDigits } = params;

  // Deterministic order: trip_members.id, ascending.
  const entries = [...params.entries].sort((a, b) => (a.memberId < b.memberId ? -1 : 1));
  const included = entries.filter((e) => e.included);

  if (included.length === 0) {
    return { ok: false, error: 'Include at least one person in the split.', remainder: null };
  }
  if (totalMinor <= 0) {
    return { ok: false, error: 'Enter an amount first.', remainder: null };
  }

  switch (mode) {
    case 'equal':
      return equalSplit(included, totalMinor);
    case 'exact':
      return exactSplit(included, totalMinor, decimalDigits);
    case 'percent':
      return percentSplit(included, totalMinor);
    case 'shares':
      return sharesSplit(included, totalMinor);
    default:
      return { ok: false, error: `Unknown split type: ${mode}`, remainder: null };
  }
}

function equalSplit(entries: SplitEntry[], totalMinor: number): SplitResult {
  const amounts = splitEqual(totalMinor, entries.length);
  return {
    ok: true,
    remainder: null,
    shares: entries.map((e, i) => ({
      memberId: e.memberId,
      shareCents: amounts[i] as number,
      shareValue: null,
    })),
  };
}

function exactSplit(entries: SplitEntry[], totalMinor: number, decimalDigits: number): SplitResult {
  const amounts: number[] = [];

  for (const entry of entries) {
    const raw = (entry.value ?? '').trim();
    if (raw === '') {
      amounts.push(0);
      continue;
    }
    // parseAmount rejects zero, but zero is a legitimate exact share.
    const parsed = /^0*(\.0*)?$/.test(raw.replace(/[\s,_]/g, ''))
      ? ({ ok: true, minor: 0 } as const)
      : parseAmount(raw, decimalDigits);

    if (!parsed.ok) {
      return { ok: false, error: parsed.error, remainder: null };
    }
    amounts.push(parsed.minor);
  }

  const sum = amounts.reduce((acc, v) => acc + v, 0);
  const remainder: Remainder = { kind: 'amount', minor: totalMinor - sum };

  if (sum !== totalMinor) {
    const diff = totalMinor - sum;
    return {
      ok: false,
      error:
        diff > 0
          ? `${toMajorString(diff, decimalDigits)} left to assign.`
          : `${toMajorString(-diff, decimalDigits)} over the total.`,
      remainder,
    };
  }

  return {
    ok: true,
    remainder,
    shares: entries.map((e, i) => ({
      memberId: e.memberId,
      shareCents: amounts[i] as number,
      shareValue: (amounts[i] as number) / 10 ** decimalDigits,
    })),
  };
}

function percentSplit(entries: SplitEntry[], totalMinor: number): SplitResult {
  const percents: number[] = [];

  for (const entry of entries) {
    const raw = (entry.value ?? '').trim();
    if (raw === '') {
      percents.push(0);
      continue;
    }
    if (!/^\d*\.?\d*$/.test(raw)) {
      return { ok: false, error: 'Percentages must be numbers.', remainder: null };
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, error: 'Percentages must be zero or more.', remainder: null };
    }
    percents.push(value);
  }

  const sum = percents.reduce((acc, v) => acc + v, 0);
  const remainder: Remainder = { kind: 'percent', value: round2(100 - sum) };

  if (Math.abs(sum - 100) > PERCENT_EPSILON) {
    return {
      ok: false,
      error:
        sum < 100
          ? `${round2(100 - sum)}% left to assign.`
          : `${round2(sum - 100)}% over 100%.`,
      remainder,
    };
  }

  const amounts = allocateByWeights(totalMinor, percents);
  return {
    ok: true,
    remainder,
    shares: entries.map((e, i) => ({
      memberId: e.memberId,
      shareCents: amounts[i] as number,
      shareValue: percents[i] as number,
    })),
  };
}

function sharesSplit(entries: SplitEntry[], totalMinor: number): SplitResult {
  const weights: number[] = [];

  for (const entry of entries) {
    const raw = (entry.value ?? '').trim();
    const value = raw === '' ? 1 : Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, error: 'Shares must be zero or more.', remainder: null };
    }
    weights.push(value);
  }

  const total = weights.reduce((acc, v) => acc + v, 0);
  if (total <= 0) {
    return { ok: false, error: 'Assign at least one share.', remainder: null };
  }

  const amounts = allocateByWeights(totalMinor, weights);
  return {
    ok: true,
    remainder: null,
    shares: entries.map((e, i) => ({
      memberId: e.memberId,
      shareCents: amounts[i] as number,
      shareValue: weights[i] as number,
    })),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** INVARIANT 1, checked in the client before any write reaches the RPC. */
export function assertSplitsBalance(shares: ComputedShare[], totalMinor: number): void {
  const sum = shares.reduce((acc, s) => acc + s.shareCents, 0);
  if (sum !== totalMinor) {
    throw new MoneyError(`Splits total ${sum} but the expense is ${totalMinor}.`);
  }
}
