/**
 * Balance derivation and settle-up suggestions.
 *
 * INVARIANT 2: no balance is ever stored. The database exposes the same
 * computation as the `trip_member_balances` view; this module is the client
 * mirror of it, and the pair are tested against the same expectations.
 *
 * Everything here operates exclusively on BASE-currency amounts. The ledger is
 * single-currency internally; display currency is applied later, at render.
 */

import type { MemberBalance, Transfer, Uuid } from './types';

export type BalanceInputs = {
  members: { id: Uuid; display_name: string; removed_at?: string | null }[];
  expenses: { id: Uuid; paid_by: Uuid; base_amount_cents: number; deleted_at?: string | null }[];
  splits: { expense_id: Uuid; member_id: Uuid; base_share_cents: number }[];
  settlements: { from_member: Uuid; to_member: Uuid; amount_cents: number }[];
};

/**
 *   net = paid - owed + (settlements sent - settlements received)
 *
 * Positive net: the trip owes this member. Negative: they owe the trip.
 */
export function computeBalances(input: BalanceInputs): MemberBalance[] {
  const live = new Set(input.expenses.filter((e) => !e.deleted_at).map((e) => e.id));

  const paid = new Map<Uuid, number>();
  const owed = new Map<Uuid, number>();
  const settled = new Map<Uuid, number>();

  for (const expense of input.expenses) {
    if (!live.has(expense.id)) continue;
    add(paid, expense.paid_by, expense.base_amount_cents);
  }

  for (const split of input.splits) {
    // Soft-deleted expenses keep their splits but stop counting.
    if (!live.has(split.expense_id)) continue;
    add(owed, split.member_id, split.base_share_cents);
  }

  for (const s of input.settlements) {
    add(settled, s.from_member, s.amount_cents);
    add(settled, s.to_member, -s.amount_cents);
  }

  return input.members.map((m) => {
    const paidCents = paid.get(m.id) ?? 0;
    const owedCents = owed.get(m.id) ?? 0;
    const settlementsCents = settled.get(m.id) ?? 0;
    return {
      member_id: m.id,
      display_name: m.display_name,
      paid_cents: paidCents,
      owed_cents: owedCents,
      settlements_cents: settlementsCents,
      net_cents: paidCents - owedCents + settlementsCents,
    };
  });
}

function add(map: Map<Uuid, number>, key: Uuid, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

/**
 * Reduce a set of net balances to a small set of transfers.
 *
 * Repeatedly settles the largest debtor against the largest creditor, which
 * clears at least one person per transfer and so never needs more than n-1
 * payments. Ties break on member id so the suggestion list is stable between
 * renders rather than reshuffling under the user.
 *
 * Input nets must sum to zero (they always do — every cent owed was paid by
 * someone). Any residue is a bug upstream and is surfaced by the assertion.
 */
export function simplifyDebts(balances: MemberBalance[]): Transfer[] {
  const total = balances.reduce((sum, b) => sum + b.net_cents, 0);
  if (total !== 0) {
    throw new Error(
      `Balances do not sum to zero (off by ${total}). Refusing to suggest settlements from an inconsistent ledger.`,
    );
  }

  const creditors = balances
    .filter((b) => b.net_cents > 0)
    .map((b) => ({ id: b.member_id, amount: b.net_cents }))
    .sort(byAmountThenId);

  const debtors = balances
    .filter((b) => b.net_cents < 0)
    .map((b) => ({ id: b.member_id, amount: -b.net_cents }))
    .sort(byAmountThenId);

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci] as { id: Uuid; amount: number };
    const debtor = debtors[di] as { id: Uuid; amount: number };

    const amount = Math.min(creditor.amount, debtor.amount);
    if (amount > 0) {
      transfers.push({ from_member: debtor.id, to_member: creditor.id, amount_cents: amount });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount === 0) ci += 1;
    if (debtor.amount === 0) di += 1;
  }

  return transfers;
}

function byAmountThenId(
  a: { id: Uuid; amount: number },
  b: { id: Uuid; amount: number },
): number {
  if (b.amount !== a.amount) return b.amount - a.amount;
  return a.id < b.id ? -1 : 1;
}

/** "You are owed" / "You owe" for the trip header. */
export function summarizeForMember(
  balances: MemberBalance[],
  memberId: Uuid | null,
): { net: number; owed: number; owes: number } {
  const mine = memberId ? balances.find((b) => b.member_id === memberId) : undefined;
  const net = mine?.net_cents ?? 0;
  return { net, owed: net > 0 ? net : 0, owes: net < 0 ? -net : 0 };
}
