import { describe, expect, it } from 'vitest';
import { computeBalances, simplifyDebts, summarizeForMember } from '@/lib/balances';
import { buildRateTable, pinExpenseToBase, resolveRate } from '@/lib/fx';
import { splitEqual } from '@/lib/money';
import { CURRENCIES, fxRow, MEMBERS } from './fixtures';

const threeMembers = [
  { id: MEMBERS.aditi, display_name: 'Aditi' },
  { id: MEMBERS.ben, display_name: 'Ben' },
  { id: MEMBERS.cara, display_name: 'Cara' },
];

describe('balance derivation (INVARIANT 2)', () => {
  it('nets paid against owed', () => {
    // Aditi pays 30.00 for all three, split equally.
    const balances = computeBalances({
      members: threeMembers,
      expenses: [{ id: 'e1', paid_by: MEMBERS.aditi, base_amount_cents: 3000 }],
      splits: [
        { expense_id: 'e1', member_id: MEMBERS.aditi, base_share_cents: 1000 },
        { expense_id: 'e1', member_id: MEMBERS.ben, base_share_cents: 1000 },
        { expense_id: 'e1', member_id: MEMBERS.cara, base_share_cents: 1000 },
      ],
      settlements: [],
    });

    expect(net(balances, MEMBERS.aditi)).toBe(2000);
    expect(net(balances, MEMBERS.ben)).toBe(-1000);
    expect(net(balances, MEMBERS.cara)).toBe(-1000);
    expect(balances.reduce((sum, b) => sum + b.net_cents, 0)).toBe(0);
  });

  it('applies settlements', () => {
    const balances = computeBalances({
      members: threeMembers,
      expenses: [{ id: 'e1', paid_by: MEMBERS.aditi, base_amount_cents: 3000 }],
      splits: [
        { expense_id: 'e1', member_id: MEMBERS.aditi, base_share_cents: 1000 },
        { expense_id: 'e1', member_id: MEMBERS.ben, base_share_cents: 1000 },
        { expense_id: 'e1', member_id: MEMBERS.cara, base_share_cents: 1000 },
      ],
      settlements: [{ from_member: MEMBERS.ben, to_member: MEMBERS.aditi, amount_cents: 1000 }],
    });

    expect(net(balances, MEMBERS.ben)).toBe(0);
    expect(net(balances, MEMBERS.aditi)).toBe(1000);
    expect(net(balances, MEMBERS.cara)).toBe(-1000);
  });

  it('ignores soft-deleted expenses and their splits', () => {
    const balances = computeBalances({
      members: threeMembers,
      expenses: [
        { id: 'e1', paid_by: MEMBERS.aditi, base_amount_cents: 3000 },
        {
          id: 'e2',
          paid_by: MEMBERS.ben,
          base_amount_cents: 6000,
          deleted_at: '2026-08-17T00:00:00.000Z',
        },
      ],
      splits: [
        { expense_id: 'e1', member_id: MEMBERS.aditi, base_share_cents: 1000 },
        { expense_id: 'e1', member_id: MEMBERS.ben, base_share_cents: 1000 },
        { expense_id: 'e1', member_id: MEMBERS.cara, base_share_cents: 1000 },
        { expense_id: 'e2', member_id: MEMBERS.aditi, base_share_cents: 2000 },
        { expense_id: 'e2', member_id: MEMBERS.ben, base_share_cents: 2000 },
        { expense_id: 'e2', member_id: MEMBERS.cara, base_share_cents: 2000 },
      ],
      settlements: [],
    });

    expect(net(balances, MEMBERS.aditi)).toBe(2000);
    expect(net(balances, MEMBERS.ben)).toBe(-1000);
  });

  it('summarizes "you are owed" vs "you owe"', () => {
    const balances = computeBalances({
      members: threeMembers,
      expenses: [{ id: 'e1', paid_by: MEMBERS.aditi, base_amount_cents: 3000 }],
      splits: [
        { expense_id: 'e1', member_id: MEMBERS.aditi, base_share_cents: 1000 },
        { expense_id: 'e1', member_id: MEMBERS.ben, base_share_cents: 1000 },
        { expense_id: 'e1', member_id: MEMBERS.cara, base_share_cents: 1000 },
      ],
      settlements: [],
    });

    expect(summarizeForMember(balances, MEMBERS.aditi)).toEqual({ net: 2000, owed: 2000, owes: 0 });
    expect(summarizeForMember(balances, MEMBERS.ben)).toEqual({ net: -1000, owed: 0, owes: 1000 });
    expect(summarizeForMember(balances, null)).toEqual({ net: 0, owed: 0, owes: 0 });
  });
});

describe('debt simplification', () => {
  it('clears a three-way debt in the minimum number of transfers', () => {
    const balances = computeBalances({
      members: threeMembers,
      expenses: [{ id: 'e1', paid_by: MEMBERS.aditi, base_amount_cents: 3000 }],
      splits: [
        { expense_id: 'e1', member_id: MEMBERS.aditi, base_share_cents: 1000 },
        { expense_id: 'e1', member_id: MEMBERS.ben, base_share_cents: 1000 },
        { expense_id: 'e1', member_id: MEMBERS.cara, base_share_cents: 1000 },
      ],
      settlements: [],
    });

    const transfers = simplifyDebts(balances);
    expect(transfers).toHaveLength(2);
    expect(transfers.every((t) => t.to_member === MEMBERS.aditi)).toBe(true);
    expect(transfers.reduce((sum, t) => sum + t.amount_cents, 0)).toBe(2000);
  });

  it('collapses a circular debt to nothing', () => {
    // A owes B, B owes C, C owes A — all equal. Nobody actually owes anybody.
    const balances = computeBalances({
      members: threeMembers,
      expenses: [
        { id: 'e1', paid_by: MEMBERS.aditi, base_amount_cents: 1000 },
        { id: 'e2', paid_by: MEMBERS.ben, base_amount_cents: 1000 },
        { id: 'e3', paid_by: MEMBERS.cara, base_amount_cents: 1000 },
      ],
      splits: [
        { expense_id: 'e1', member_id: MEMBERS.ben, base_share_cents: 1000 },
        { expense_id: 'e2', member_id: MEMBERS.cara, base_share_cents: 1000 },
        { expense_id: 'e3', member_id: MEMBERS.aditi, base_share_cents: 1000 },
      ],
      settlements: [],
    });

    expect(simplifyDebts(balances)).toEqual([]);
  });

  it('never needs more than n-1 transfers', () => {
    const members = [
      ...threeMembers,
      { id: MEMBERS.dan, display_name: 'Dan' },
      { id: MEMBERS.eve, display_name: 'Eve' },
    ];

    const balances = computeBalances({
      members,
      expenses: [
        { id: 'e1', paid_by: MEMBERS.aditi, base_amount_cents: 5000 },
        { id: 'e2', paid_by: MEMBERS.ben, base_amount_cents: 2500 },
      ],
      splits: [
        ...members.map((m) => ({ expense_id: 'e1', member_id: m.id, base_share_cents: 1000 })),
        ...members.map((m) => ({ expense_id: 'e2', member_id: m.id, base_share_cents: 500 })),
      ],
      settlements: [],
    });

    const transfers = simplifyDebts(balances);
    expect(transfers.length).toBeLessThanOrEqual(members.length - 1);
    expect(applyTransfers(balances, transfers).every((n) => n === 0)).toBe(true);
  });

  it('is stable across calls', () => {
    const balances = computeBalances({
      members: threeMembers,
      expenses: [{ id: 'e1', paid_by: MEMBERS.aditi, base_amount_cents: 3000 }],
      splits: threeMembers.map((m) => ({
        expense_id: 'e1',
        member_id: m.id,
        base_share_cents: 1000,
      })),
      settlements: [],
    });

    expect(simplifyDebts(balances)).toEqual(simplifyDebts(balances));
  });

  it('refuses to suggest settlements from an inconsistent ledger', () => {
    expect(() =>
      simplifyDebts([
        {
          member_id: MEMBERS.aditi,
          display_name: 'Aditi',
          paid_cents: 0,
          owed_cents: 0,
          settlements_cents: 0,
          net_cents: 100,
        },
      ]),
    ).toThrow(/do not sum to zero/i);
  });
});

/**
 * THE regression test.
 *
 * A foreign-currency expense is pinned once. Later the cached FX rate moves.
 * Balances must not budge — if they do, every member's position shifts daily
 * with no transaction occurring, and the app is lying about who owes what.
 */
describe('balance stability under FX movement', () => {
  function ledgerPinnedAt(rateTable: ReturnType<typeof buildRateTable>) {
    const amountMinor = 120000; // 1,200.00 THB
    const shareMinor = splitEqual(amountMinor, 3);
    const rate = resolveRate('THB', 'SGD', rateTable);
    if (!rate) throw new Error('rate missing');

    const pinned = pinExpenseToBase({
      amountMinor,
      shareMinor,
      currency: 'THB',
      baseCurrency: 'SGD',
      currencies: CURRENCIES,
      rate,
    });

    return {
      pinned,
      inputs: {
        members: threeMembers,
        expenses: [
          { id: 'e1', paid_by: MEMBERS.aditi, base_amount_cents: pinned.baseAmountCents },
        ],
        splits: threeMembers.map((m, i) => ({
          expense_id: 'e1',
          member_id: m.id,
          base_share_cents: pinned.baseShareCents[i] as number,
        })),
        settlements: [],
      },
    };
  }

  it('leaves balances unchanged when the cached rate moves', () => {
    const before = buildRateTable([fxRow('USD', 'SGD', '1.34'), fxRow('USD', 'THB', '32.5')]);

    // The expense is saved once, against the rate of the day.
    const { pinned, inputs } = ledgerPinnedAt(before);
    const balancesAtPinTime = computeBalances(inputs);

    // The FX cache refreshes and the baht moves nearly 15%.
    const after = buildRateTable([
      fxRow('USD', 'SGD', '1.34', { rate_date: '2026-08-18' }),
      fxRow('USD', 'THB', '28.0', { rate_date: '2026-08-18' }),
    ]);

    // Confirm the rate genuinely moved — otherwise this test proves nothing.
    const repinned = pinExpenseToBase({
      amountMinor: 120000,
      shareMinor: splitEqual(120000, 3),
      currency: 'THB',
      baseCurrency: 'SGD',
      currencies: CURRENCIES,
      rate: resolveRate('THB', 'SGD', after)!,
    });
    expect(repinned.baseAmountCents).not.toBe(pinned.baseAmountCents);

    // Balances are derived from the STORED base amounts, so they do not move.
    const balancesAfterRateChange = computeBalances(inputs);
    expect(balancesAfterRateChange).toEqual(balancesAtPinTime);

    expect(net(balancesAfterRateChange, MEMBERS.aditi)).toBe(net(balancesAtPinTime, MEMBERS.aditi));
    expect(net(balancesAfterRateChange, MEMBERS.ben)).toBe(net(balancesAtPinTime, MEMBERS.ben));
    expect(net(balancesAfterRateChange, MEMBERS.cara)).toBe(net(balancesAtPinTime, MEMBERS.cara));
  });

  it('keeps the pinned rate metadata alongside the amounts', () => {
    const table = buildRateTable([fxRow('USD', 'SGD', '1.34'), fxRow('USD', 'THB', '32.5')]);
    const { pinned } = ledgerPinnedAt(table);

    expect(pinned.fxRate).toBe('0.0412307692');
    expect(pinned.fxRateDate).toBe('2026-08-17');
    expect(pinned.fxSource).toBe('fawazahmed0/currency-api');
  });
});

function net(balances: ReturnType<typeof computeBalances>, memberId: string): number {
  return balances.find((b) => b.member_id === memberId)?.net_cents ?? 0;
}

function applyTransfers(
  balances: ReturnType<typeof computeBalances>,
  transfers: ReturnType<typeof simplifyDebts>,
): number[] {
  const nets = new Map(balances.map((b) => [b.member_id, b.net_cents]));
  for (const t of transfers) {
    nets.set(t.from_member, (nets.get(t.from_member) ?? 0) + t.amount_cents);
    nets.set(t.to_member, (nets.get(t.to_member) ?? 0) - t.amount_cents);
  }
  return [...nets.values()];
}
