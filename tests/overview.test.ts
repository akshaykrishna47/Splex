import { describe, expect, it } from 'vitest';
import { buildDebtSummary } from '@/lib/overview';
import type { TripScopedBalance } from '@/lib/repo/balances';
import { MEMBERS } from './fixtures';

const ME = MEMBERS.aditi;
const BEN = MEMBERS.ben;
const CARA = MEMBERS.cara;

const MY_ACCOUNT = 'user-me';
const BEN_ACCOUNT = 'user-ben';

function bal(
  tripId: string,
  memberId: string,
  net: number,
  over: Partial<TripScopedBalance> = {},
): TripScopedBalance {
  return {
    trip_id: tripId,
    member_id: memberId,
    user_id: null,
    display_name: memberId === ME ? 'Me' : memberId === BEN ? 'Ben' : 'Cara',
    removed_at: null,
    paid_cents: net > 0 ? net : 0,
    owed_cents: net < 0 ? -net : 0,
    settlements_cents: 0,
    net_cents: net,
    ...over,
  };
}

const TRIP_A = { id: 'trip-a', name: 'Bangkok', base_currency: 'SGD' };
const TRIP_B = { id: 'trip-b', name: 'Tokyo', base_currency: 'SGD' };
const TRIP_C = { id: 'trip-c', name: 'Bali', base_currency: 'THB' };

const MINE = new Set([ME]);

describe('buildDebtSummary', () => {
  it('lists people who owe me', () => {
    const summary = buildDebtSummary({
      trips: [TRIP_A],
      balances: [bal('trip-a', ME, 3000), bal('trip-a', BEN, -3000)],
      myMemberIds: MINE,
    });

    expect(summary.owedToYou).toHaveLength(1);
    expect(summary.owedToYou[0]?.name).toBe('Ben');
    expect(summary.owedToYou[0]?.amountCents).toBe(3000);
    expect(summary.owedToYou[0]?.currency).toBe('SGD');
    expect(summary.youOwe).toHaveLength(0);
  });

  it('lists people I owe', () => {
    const summary = buildDebtSummary({
      trips: [TRIP_A],
      balances: [bal('trip-a', ME, -2500), bal('trip-a', BEN, 2500)],
      myMemberIds: MINE,
    });

    expect(summary.youOwe).toHaveLength(1);
    expect(summary.youOwe[0]?.name).toBe('Ben');
    expect(summary.youOwe[0]?.amountCents).toBe(2500);
    expect(summary.owedToYou).toHaveLength(0);
  });

  it('is empty when everyone is square', () => {
    const summary = buildDebtSummary({
      trips: [TRIP_A],
      balances: [bal('trip-a', ME, 0), bal('trip-a', BEN, 0)],
      myMemberIds: MINE,
    });

    expect(summary.owedToYou).toEqual([]);
    expect(summary.youOwe).toEqual([]);
  });

  it('ignores debts between other people', () => {
    // Ben owes Cara; nothing to do with me.
    const summary = buildDebtSummary({
      trips: [TRIP_A],
      balances: [bal('trip-a', ME, 0), bal('trip-a', BEN, -1000), bal('trip-a', CARA, 1000)],
      myMemberIds: MINE,
    });

    expect(summary.owedToYou).toEqual([]);
    expect(summary.youOwe).toEqual([]);
  });

  it('merges the same account across trips in the same currency', () => {
    const summary = buildDebtSummary({
      trips: [TRIP_A, TRIP_B],
      balances: [
        bal('trip-a', ME, 3000, { user_id: MY_ACCOUNT }),
        bal('trip-a', BEN, -3000, { user_id: BEN_ACCOUNT }),
        bal('trip-b', 'me-2', 2000, { user_id: MY_ACCOUNT, display_name: 'Me' }),
        bal('trip-b', 'ben-2', -2000, { user_id: BEN_ACCOUNT, display_name: 'Ben' }),
      ],
      myMemberIds: new Set([ME, 'me-2']),
    });

    expect(summary.owedToYou).toHaveLength(1);
    expect(summary.owedToYou[0]?.amountCents).toBe(5000);
    expect(summary.owedToYou[0]?.tripNames).toEqual(['Bangkok', 'Tokyo']);
  });

  it('nets opposing debts with the same person across trips', () => {
    const summary = buildDebtSummary({
      trips: [TRIP_A, TRIP_B],
      balances: [
        // Trip A: I owe Ben 80.
        bal('trip-a', ME, -8000, { user_id: MY_ACCOUNT }),
        bal('trip-a', BEN, 8000, { user_id: BEN_ACCOUNT }),
        // Trip B: Ben owes me 40.
        bal('trip-b', 'me-2', 4000, { user_id: MY_ACCOUNT, display_name: 'Me' }),
        bal('trip-b', 'ben-2', -4000, { user_id: BEN_ACCOUNT, display_name: 'Ben' }),
      ],
      myMemberIds: new Set([ME, 'me-2']),
    });

    // One debt of 40, not "you owe 80" beside "Ben owes you 40".
    expect(summary.owedToYou).toHaveLength(0);
    expect(summary.youOwe).toHaveLength(1);
    expect(summary.youOwe[0]?.amountCents).toBe(4000);
    expect(summary.youOwe[0]?.name).toBe('Ben');
    expect(summary.youOwe[0]?.tripNames).toEqual(['Bangkok', 'Tokyo']);
  });

  it('flips the direction when the other trip is the larger debt', () => {
    const summary = buildDebtSummary({
      trips: [TRIP_A, TRIP_B],
      balances: [
        bal('trip-a', ME, -3000, { user_id: MY_ACCOUNT }),
        bal('trip-a', BEN, 3000, { user_id: BEN_ACCOUNT }),
        bal('trip-b', 'me-2', 7500, { user_id: MY_ACCOUNT, display_name: 'Me' }),
        bal('trip-b', 'ben-2', -7500, { user_id: BEN_ACCOUNT, display_name: 'Ben' }),
      ],
      myMemberIds: new Set([ME, 'me-2']),
    });

    expect(summary.youOwe).toHaveLength(0);
    expect(summary.owedToYou[0]?.amountCents).toBe(4500);
  });

  it('drops a person who cancels out exactly', () => {
    const summary = buildDebtSummary({
      trips: [TRIP_A, TRIP_B],
      balances: [
        bal('trip-a', ME, -5000, { user_id: MY_ACCOUNT }),
        bal('trip-a', BEN, 5000, { user_id: BEN_ACCOUNT }),
        bal('trip-b', 'me-2', 5000, { user_id: MY_ACCOUNT, display_name: 'Me' }),
        bal('trip-b', 'ben-2', -5000, { user_id: BEN_ACCOUNT, display_name: 'Ben' }),
      ],
      myMemberIds: new Set([ME, 'me-2']),
    });

    expect(summary.owedToYou).toHaveLength(0);
    expect(summary.youOwe).toHaveLength(0);
  });

  it('nets only within a currency, never across them', () => {
    const summary = buildDebtSummary({
      trips: [TRIP_A, TRIP_C],
      balances: [
        // SGD: I owe Ben 80.
        bal('trip-a', ME, -8000, { user_id: MY_ACCOUNT }),
        bal('trip-a', BEN, 8000, { user_id: BEN_ACCOUNT }),
        // THB: Ben owes me 40. Different currency — must not cancel.
        bal('trip-c', 'me-3', 4000, { user_id: MY_ACCOUNT, display_name: 'Me' }),
        bal('trip-c', 'ben-3', -4000, { user_id: BEN_ACCOUNT, display_name: 'Ben' }),
      ],
      myMemberIds: new Set([ME, 'me-3']),
    });

    expect(summary.youOwe).toEqual([
      expect.objectContaining({ currency: 'SGD', amountCents: 8000 }),
    ]);
    expect(summary.owedToYou).toEqual([
      expect.objectContaining({ currency: 'THB', amountCents: 4000 }),
    ]);
  });

  it('does not net across two account-less people who share a name', () => {
    const summary = buildDebtSummary({
      trips: [TRIP_A, TRIP_B],
      balances: [
        bal('trip-a', ME, -6000, { display_name: 'Me' }),
        bal('trip-a', BEN, 6000, { display_name: 'Sam' }),
        bal('trip-b', 'me-2', 6000, { display_name: 'Me' }),
        bal('trip-b', 'sam-2', -6000, { display_name: 'Sam' }),
      ],
      myMemberIds: new Set([ME, 'me-2']),
    });

    // Two unrelated Sams: netting them to zero would erase two real debts.
    expect(summary.youOwe).toHaveLength(1);
    expect(summary.owedToYou).toHaveLength(1);
  });

  it('never sums across currencies — one row per currency', () => {
    const summary = buildDebtSummary({
      trips: [TRIP_A, TRIP_C],
      balances: [
        bal('trip-a', ME, 3000, { user_id: MY_ACCOUNT }),
        bal('trip-a', BEN, -3000, { user_id: BEN_ACCOUNT }),
        bal('trip-c', 'me-3', 40000, { user_id: MY_ACCOUNT, display_name: 'Me' }),
        bal('trip-c', 'ben-3', -40000, { user_id: BEN_ACCOUNT, display_name: 'Ben' }),
      ],
      myMemberIds: new Set([ME, 'me-3']),
    });

    expect(summary.owedToYou).toHaveLength(2);
    const currencies = summary.owedToYou.map((r) => r.currency).sort();
    expect(currencies).toEqual(['SGD', 'THB']);
    // The THB figure is larger in minor units and must not be added to the SGD one.
    expect(summary.owedToYou.find((r) => r.currency === 'THB')?.amountCents).toBe(40000);
    expect(summary.owedToYou.find((r) => r.currency === 'SGD')?.amountCents).toBe(3000);
  });

  it('does not merge two account-less people who share a name', () => {
    // Both called "Ben", neither has an account: they are different people.
    const summary = buildDebtSummary({
      trips: [TRIP_A, TRIP_B],
      balances: [
        bal('trip-a', ME, 1000),
        bal('trip-a', BEN, -1000),
        bal('trip-b', 'me-2', 1000, { display_name: 'Me' }),
        bal('trip-b', 'ben-other', -1000, { display_name: 'Ben' }),
      ],
      myMemberIds: new Set([ME, 'me-2']),
    });

    expect(summary.owedToYou).toHaveLength(2);
    expect(summary.owedToYou.every((r) => r.amountCents === 1000)).toBe(true);
  });

  it('can show both directions at once', () => {
    const summary = buildDebtSummary({
      trips: [TRIP_A, TRIP_B],
      balances: [
        bal('trip-a', ME, 3000),
        bal('trip-a', BEN, -3000),
        bal('trip-b', 'me-2', -1500, { display_name: 'Me' }),
        bal('trip-b', 'cara-2', 1500, { display_name: 'Cara' }),
      ],
      myMemberIds: new Set([ME, 'me-2']),
    });

    expect(summary.owedToYou.map((r) => r.name)).toEqual(['Ben']);
    expect(summary.youOwe.map((r) => r.name)).toEqual(['Cara']);
  });

  it('sorts by amount, largest first', () => {
    const summary = buildDebtSummary({
      trips: [TRIP_A],
      balances: [bal('trip-a', ME, 5000), bal('trip-a', BEN, -1000), bal('trip-a', CARA, -4000)],
      myMemberIds: MINE,
    });

    expect(summary.owedToYou.map((r) => r.amountCents)).toEqual([4000, 1000]);
    expect(summary.owedToYou.map((r) => r.name)).toEqual(['Cara', 'Ben']);
  });

  it('skips an inconsistent trip instead of blanking the whole summary', () => {
    const summary = buildDebtSummary({
      trips: [TRIP_A, TRIP_B],
      balances: [
        // trip-a does not sum to zero — simplifyDebts refuses it.
        bal('trip-a', ME, 5000),
        bal('trip-a', BEN, -1000),
        bal('trip-b', 'me-2', 2000, { display_name: 'Me' }),
        bal('trip-b', 'cara-2', -2000, { display_name: 'Cara' }),
      ],
      myMemberIds: new Set([ME, 'me-2']),
    });

    // The healthy trip still reports.
    expect(summary.owedToYou.map((r) => r.name)).toEqual(['Cara']);
  });

  it('ignores trips the user is not part of', () => {
    const summary = buildDebtSummary({
      trips: [TRIP_A],
      balances: [bal('trip-a', BEN, 1000), bal('trip-a', CARA, -1000)],
      myMemberIds: MINE,
    });

    expect(summary.owedToYou).toEqual([]);
    expect(summary.youOwe).toEqual([]);
  });
});
